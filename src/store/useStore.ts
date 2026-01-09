import { create } from 'zustand'
import { supabase, type User, type GoldPrice, type UserSkill, type SkillDefinition, type SkillSignal } from '../lib/supabase'
import { getFingerprint } from '../lib/fingerprint'
import { toast } from 'sonner'
import confetti from 'canvas-confetti'

interface Round {
  id: string
  round_number: number
  start_price: number
  end_price: number | null
  start_time: string
  end_time: string | null
  status: 'active' | 'completed'
  allowed_users?: string[] // Array of user IDs allowed to participate
}

interface Bet {
  id: string
  user_id: string
  round_id: string
  prediction: 'up' | 'down'
  bet_amount: number
  result: 'pending' | 'won' | 'lost'
  profit: number
  created_at: string
}

interface AppState {
  user: User | null
  goldPrice: GoldPrice | null
  currentRound: Round | null
  userBet: Bet | null
  recentBets: Bet[]
  activeBets: Bet[]
  priceHistory: GoldPrice[]
  countdown: number
  winRate: number
  onlineUsers: number
  onlineUsersList: User[]
  loading: boolean
  allUsers: User[]
  lastWinAmount: number | null
  isWaitingForNewGame: boolean
  isAdminOnline: boolean
  isGameCompleted: boolean
  leaderboard: User[]
  maxRound: number | null
  userSkills: UserSkill[]
  skillDefinitions: SkillDefinition[]
  incomingSkillEffect: SkillSignal | null
  setLastWinAmount: (amount: number | null) => void
  lastLossAmount: number | null
  setLastLossAmount: (amount: number | null) => void
  initializeUser: (name: string) => Promise<void>
  loadUser: () => Promise<void>
  placeBet: (prediction: 'up' | 'down', amount: number) => Promise<boolean>
  subscribeToGoldPrice: () => void
  subscribeToBroadcast: () => void
  subscribeToRounds: () => void
  subscribeToUsers: () => void
  subscribeToAdminPresence: () => void
  subscribeToSkillSignals: () => void
  updateUserPresence: () => Promise<void>
  loadRecentBets: () => Promise<void>
  loadActiveBets: () => Promise<void>
  loadPriceHistory: () => Promise<void>
  loadOnlineUsers: () => Promise<void>
  loadAllUsers: () => Promise<void>
  loadUserSkills: () => Promise<void>
  loadSkillDefinitions: () => Promise<void>
  activateSkill: (skillId: string, targetUserId?: string) => Promise<boolean>
  clearIncomingSkillEffect: () => void
}

let broadcastChannel: any = null
let goldPriceChannel: any = null
let roundsChannel: any = null
let betsChannel: any = null
let usersChannel: any = null
let presenceChannel: any = null
let skillSignalsChannel: any = null
let subscriptionsActive = false
let acceptedAdminSession: string | null = null // Only accept broadcasts from one admin
let userSessionId: string | null = null
let presenceHeartbeatInterval: any = null

export const useStore = create<AppState>((set, get) => ({
  user: null,
  goldPrice: null,
  currentRound: null,
  userBet: null,
  recentBets: [],
  activeBets: [],
  priceHistory: [],
  countdown: 15,
  winRate: 0.95,
  onlineUsers: 0,
  onlineUsersList: [],
  allUsers: [],
  lastWinAmount: null,
  lastLossAmount: null,
  loading: false, // Changed default to false
  isWaitingForNewGame: false,
  isAdminOnline: false,
  isGameCompleted: false,
  leaderboard: [],
  maxRound: null,
  userSkills: [],
  skillDefinitions: [],
  incomingSkillEffect: null,

  setLastWinAmount: (amount) => set({ lastWinAmount: amount }),
  setLastLossAmount: (amount) => set({ lastLossAmount: amount }),
  clearIncomingSkillEffect: () => set({ incomingSkillEffect: null }),

  loadUser: async () => {
    try {
      set({ loading: true })
      
      const fingerprint = await getFingerprint()
      
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('fingerprint', fingerprint)
        .single()

      if (userError && userError.code !== 'PGRST116') {
        set({ loading: false })
        return
      }

      // Load current round FIRST before setting user
      const { data: roundData } = await supabase
        .from('rounds')
        .select('*')
        .eq('status', 'active')
        .order('round_number', { ascending: false })
        .limit(1)
        .maybeSingle()

      // Check if user is allowed to participate BEFORE setting the user
      if (userData && roundData && roundData.allowed_users !== undefined && roundData.allowed_users !== null) {
        if (!roundData.allowed_users.includes(userData.id)) {
          console.log('User not in allowed list for this round. Allowed:', roundData.allowed_users, 'User:', userData.id)
          // Don't set user - this will show NameInput which will show the locked screen
          set({ loading: false })
          return
        }
      }

      // Only set user if they passed the allowed check (or no check needed)
      if (userData) {
        set({ user: userData })
      } else {
      }

      // Load latest gold price
      const { data: priceData } = await supabase
        .from('gold_prices')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(1)
        .single()

      if (priceData) {
        set({ goldPrice: priceData })
      }

      if (roundData) {
        set({ currentRound: roundData, countdown: 0 }) // Set countdown to 0, wait for broadcast from admin
        
        // Check if user has bet in this round
        if (userData) {
          const { data: betData } = await supabase
            .from('bets')
            .select('*')
            .eq('user_id', userData.id)
            .eq('round_id', roundData.id)
            .single()

          if (betData) {
            set({ userBet: betData })
          }
        }
      } else {
      }

      set({ loading: false })
    } catch (error) {
      set({ loading: false })
    }
  },

  initializeUser: async (name: string) => {
    try {
      const fingerprint = await getFingerprint()
      
      // Check if game is already active - prevent new users from joining mid-game
      const { data: activeRounds } = await supabase
        .from('rounds')
        .select('id, status, round_number, allowed_users')
        .eq('status', 'active')
        .limit(1)
      
      const activeRound = activeRounds && activeRounds.length > 0 ? activeRounds[0] : null
      
      if (activeRound) {
        throw new Error('Cannot join while a game is in progress. Please wait for the current round to finish.')
      }
      
      // Get default balance from settings
      const { data: settings } = await supabase
        .from('game_settings')
        .select('default_user_balance')
        .limit(1)
        .single()
      
      const defaultBalance = settings?.default_user_balance || 10000
      
      const { data: newUser, error: userError } = await supabase
        .from('users')
        .insert([{ fingerprint, name, balance: defaultBalance }])
        .select()
        .single()

      if (userError) {
        throw new Error(`Failed to create user: ${userError.message} (Code: ${userError.code})`)
      }

      // Set user first
      set({ user: newUser })
      
      // Load latest gold price to prevent "Connecting to market..." stuck state
      const { data: priceData } = await supabase
        .from('gold_prices')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(1)
        .single()

      if (priceData) {
        set({ goldPrice: priceData })
      }
      
      // Load current round if exists
      const { data: roundData } = await supabase
        .from('rounds')
        .select('*')
        .eq('status', 'active')
        .order('round_number', { ascending: false })
        .limit(1)
        .maybeSingle()
      
      if (roundData) {
        set({ currentRound: roundData, countdown: 0 })
      }
    } catch (error) {
      throw error
    }
  },

  placeBet: async (prediction: 'up' | 'down', amount: number) => {
    const { user, currentRound, countdown } = get()
    
    if (!user || !currentRound) {
      toast.error('Cannot place bet right now!')
      return false
    }

    if (countdown <= 0) {
      toast.warning('Betting time is over for this round!')
      return false
    }

    if (user.balance < amount) {
      toast.error('Insufficient balance!')
      return false
    }

    // Get bet limits from settings
    const { data: settings } = await supabase
      .from('game_settings')
      .select('min_bet_amount, max_bet_amount')
      .limit(1)
      .single()
    
    const minBet = settings?.min_bet_amount || 10
    const maxBet = settings?.max_bet_amount || 50000

    if (amount < minBet) {
      toast.warning(`Minimum bet amount is $${minBet}!`)
      return false
    }

    if (amount > maxBet) {
      toast.warning(`Maximum bet amount is $${maxBet.toLocaleString()}!`)
      return false
    }

    try {
      // Deduct balance
      const newBalance = user.balance - amount
      await supabase
        .from('users')
        .update({ balance: newBalance })
        .eq('id', user.id)

      // Place bet
      const { data: betData, error: betError } = await supabase
        .from('bets')
        .insert([{
          user_id: user.id,
          round_id: currentRound.id,
          prediction,
          bet_amount: amount
        }])
        .select()
        .single()

      if (betError) {
        // Refund if bet fails
        await supabase
          .from('users')
          .update({ balance: user.balance })
          .eq('id', user.id)
        toast.error('Cannot place bet! You may have already placed a bet in this round.')
        return false
      }

      set({ 
        user: { ...user, balance: newBalance },
        userBet: betData
      })

      return true
    } catch (error) {
      return false
    }
  },

  subscribeToGoldPrice: () => {
    // Clean up existing channel if it exists
    if (goldPriceChannel) {
      goldPriceChannel.unsubscribe()
      goldPriceChannel = null
    }
    
    // Note: We're not subscribing to postgres_changes for gold_prices
    // because it can cause realtime binding errors.
    // Gold prices will be updated via the broadcast channel from admin.
  },

  subscribeToBroadcast: () => {
    // Prevent duplicate subscriptions
    if (subscriptionsActive && broadcastChannel) {
      return
    }
    
    // Clean up existing channel if it exists
    if (broadcastChannel) {
      broadcastChannel.unsubscribe()
      broadcastChannel = null
    }
    
    subscriptionsActive = true
    broadcastChannel = supabase.channel('game-state')
    
    broadcastChannel
      .on('broadcast', { event: 'game-state' }, async (payload: any) => {
        const { countdown, currentRound, goldPrice, winRate: broadcastWinRate, adminSessionId, isWaiting } = payload.payload
        
        
        // Handle waiting state
        if (isWaiting !== undefined) {
          if (isWaiting) {
            // Clear current round when waiting for new game
            set({ 
              isWaitingForNewGame: isWaiting, 
              currentRound: null, 
              userBet: null, 
              countdown: 0,
              isGameCompleted: false,
              leaderboard: [],
              maxRound: null
            })
            return // Don't process other updates when in waiting state
          } else {
            // When no longer waiting, clear waiting state but continue processing other updates
            set({ isWaitingForNewGame: isWaiting })
          }
        }
        
        // Update current round if provided - reset admin lock on new round
        if ('currentRound' in payload.payload) {
          const oldRound = get().currentRound
          
          // If currentRound is null, always accept it to clear the game state (e.g., when deleting game)
          if (currentRound === null) {
            set({ currentRound: null, userBet: null, countdown: 0, isWaitingForNewGame: false })
            // Reset admin session when game is cleared
            acceptedAdminSession = null
            return // No need to process further updates when clearing game
          }
          
          // For non-null rounds, check admin session
          if (adminSessionId) {
            if (!acceptedAdminSession) {
              acceptedAdminSession = adminSessionId
            } else if (acceptedAdminSession !== adminSessionId) {
              // Ignore broadcasts from other admin sessions
              return
            }
          }
          
          if (oldRound && currentRound && currentRound.id !== oldRound.id) {
            // New round started, reset admin lock to allow any admin
            acceptedAdminSession = adminSessionId || null
            // Reload all users to reflect allowed_users from new round
            get().loadAllUsers()
          }
          
          set({ currentRound })
        } else {
          // No currentRound in payload, check admin session for other updates
          if (adminSessionId) {
            if (!acceptedAdminSession) {
              acceptedAdminSession = adminSessionId
            } else if (acceptedAdminSession !== adminSessionId) {
              // Ignore broadcasts from other admin sessions
              return
            }
          }
        }
        
        // Update countdown from admin broadcast - this is the source of truth
        if (countdown !== undefined) {
          set({ countdown })
        }
        
        // Update winRate if provided
        if (broadcastWinRate !== undefined) {
          set({ winRate: broadcastWinRate })
        }
        
        if (goldPrice !== undefined) {
          // If goldPrice is a complete object with price and change, use it
          // Otherwise treat it as just a price number (backwards compatibility)
          if (typeof goldPrice === 'object' && goldPrice.price !== undefined) {
            set({ goldPrice: goldPrice })
            
            // Update price history
            const { priceHistory } = get()
            const updatedHistory = [...priceHistory, goldPrice]
            // Keep last 100 prices
            if (updatedHistory.length > 100) {
              updatedHistory.shift()
            }
            set({ priceHistory: updatedHistory })
          } else {
            // Fallback: calculate change from previous price
            const oldPrice = get().goldPrice
            const change = oldPrice ? goldPrice - oldPrice.price : 0
            
            const newPriceObj = {
              price: goldPrice,
              change: change,
              timestamp: new Date().toISOString(),
              id: '' // ID not needed for display
            }
            
            set({ goldPrice: newPriceObj })
            
            // Update price history
            const { priceHistory } = get()
            const updatedHistory = [...priceHistory, newPriceObj]
            // Keep last 100 prices
            if (updatedHistory.length > 100) {
              updatedHistory.shift()
            }
            set({ priceHistory: updatedHistory })
          }
        }
      })
      .on('broadcast', { event: 'system-reset' }, (payload: any) => {
        // System has been reset - clear user session and force re-login
        console.log('System reset detected:', payload.payload.message)
        set({ 
          user: null, 
          currentRound: null, 
          userBet: null, 
          countdown: 0, 
          isWaitingForNewGame: false,
          goldPrice: null,
          isGameCompleted: false,
          leaderboard: []
        })
        toast.error(payload.payload.message || 'System has been reset. Please login again.')
        // Reset admin session
        acceptedAdminSession = null
      })
      .on('broadcast', { event: 'game-completed' }, (payload: any) => {
        // Game has completed - show leaderboard
        console.log('Game completed:', payload.payload)
        const { leaderboard, maxRound } = payload.payload
        
        set({ 
          isGameCompleted: true,
          leaderboard: leaderboard || [],
          maxRound: maxRound || null,
          currentRound: null,
          userBet: null,
          countdown: 0
        })
        
        // Show confetti for winners
        const currentUser = get().user
        if (currentUser && leaderboard && leaderboard.length > 0) {
          const userRank = leaderboard.findIndex((u: User) => u.id === currentUser.id)
          if (userRank === 0) {
            // Winner - show gold confetti
            confetti({
              particleCount: 200,
              spread: 100,
              origin: { y: 0.6 },
              colors: ['#f59e0b', '#fbbf24', '#fcd34d']
            })
            toast.success(`🏆 Congratulations! You won the game!`)
          } else if (userRank === 1) {
            // Second place - silver confetti
            confetti({
              particleCount: 150,
              spread: 80,
              origin: { y: 0.6 },
              colors: ['#94a3b8', '#cbd5e1', '#e2e8f0']
            })
            toast.success(`🥈 Great job! You finished in 2nd place!`)
          } else if (userRank === 2) {
            // Third place - bronze confetti
            confetti({
              particleCount: 100,
              spread: 70,
              origin: { y: 0.6 },
              colors: ['#cd7f32', '#d4a574', '#e5c29f']
            })
            toast.success(`🥉 Well done! You finished in 3rd place!`)
          } else if (userRank >= 0) {
            toast.info(`Game completed! You finished in position #${userRank + 1}`)
          }
        } else {
          toast.info(`🏁 Game completed after ${maxRound} rounds!`)
        }
      })
      .on('broadcast', { event: 'game-started' }, async (payload: any) => {
        // New game started - clear completed state
        console.log('New game started:', payload.payload)
        
        set({ 
          isGameCompleted: false,
          leaderboard: [],
          maxRound: null,
          isWaitingForNewGame: false,
          userBet: null // Clear current bet
        })
        
        // Wait for database cleanup to complete
        await new Promise(resolve => setTimeout(resolve, 500))
        
        console.log('🔄 Reloading user data after new game...')
        // Reload user data
        await get().loadUser()
        console.log('✅ User data reloaded')
        
        toast.success('🎮 New game has started!')
      })
      .subscribe()
  },

  loadRecentBets: async () => {
    try {
      const { data } = await supabase
        .from('bets')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)

      if (data) {
        set({ recentBets: data })
      }
    } catch (error) {
    }
  },

  loadActiveBets: async () => {
    try {
      const { data } = await supabase
        .from('bets')
        .select('*')
        .eq('result', 'pending')
        .order('created_at', { ascending: false })

      if (data) {
        set({ activeBets: data })
      }
    } catch (error) {
    }
  },

  loadPriceHistory: async () => {
    try {
      const { data } = await supabase
        .from('gold_prices')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(100)

      if (data) {
        // Reverse to get oldest first (for chart)
        set({ priceHistory: data.reverse() })
      }
    } catch (error) {
    }
  },

  loadOnlineUsers: async () => {
    try {
      // Get users active in last 5 seconds with user details
      const { data: presenceData } = await supabase
        .from('presence')
        .select('user_id, users(id, name, balance)')
        .eq('session_type', 'user')
        .gte('last_seen', new Date(Date.now() - 1000).toISOString())

      if (presenceData) {
        // Extract user details and remove duplicates
        const userMap = new Map()
        presenceData.forEach((item: any) => {
          if (item.users) {
            userMap.set(item.users.id, item.users)
          }
        })
        const onlineUsersList = Array.from(userMap.values())
        set({ onlineUsers: onlineUsersList.length, onlineUsersList })
      }
    } catch (error) {
      console.error('Failed to load online users:', error)
    }
  },

  loadAllUsers: async () => {
    try {
      const currentRound = get().currentRound
      
      // If there's a current round with allowed_users, filter by that list
      if (currentRound && currentRound.allowed_users && currentRound.allowed_users.length > 0) {
        const { data } = await supabase
          .from('users')
          .select('*')
          .in('id', currentRound.allowed_users)
          .order('balance', { ascending: false })

        if (data) {
          set({ allUsers: data })
        }
      } else {
        // If no allowed_users restriction, show all users
        const { data } = await supabase
          .from('users')
          .select('*')
          .order('balance', { ascending: false })

        if (data) {
          set({ allUsers: data })
        }
      }
    } catch (error) {
    }
  },

  subscribeToRounds: () => {
    // Prevent duplicate subscriptions
    if (subscriptionsActive && (roundsChannel || betsChannel)) {
      return
    }
    
    // Clean up existing channels if they exist
    if (roundsChannel) {
      roundsChannel.unsubscribe()
      roundsChannel = null
    }
    if (betsChannel) {
      betsChannel.unsubscribe()
      betsChannel = null
    }
    
    // Subscribe to new rounds
    roundsChannel = supabase
      .channel('rounds-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'rounds',
        },
        (payload) => {

          const newRound = payload.new as Round
          set({ 
            currentRound: newRound,
            userBet: null
            // Don't set countdown here, wait for broadcast from admin with accurate countdown
          })
          // Reload all users to reflect allowed_users from new round
          get().loadAllUsers()
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rounds',
        },
        (payload) => {
          const updatedRound = payload.new as Round
          const { currentRound } = get()
          
          // Only update if it's the current round being completed
          // Don't set a completed round as current round if we don't have one
          if (updatedRound.status === 'completed' && currentRound && currentRound.id === updatedRound.id) {
            set({ currentRound: updatedRound })
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'rounds',
        },
        (payload) => {
          const deletedRound = payload.old as Round
          const { currentRound } = get()
          // If the deleted round is the current round, clear it
          if (currentRound && currentRound.id === deletedRound.id) {
            set({ currentRound: null, userBet: null, isWaitingForNewGame: false })
          }
        }
      )
      .subscribe()

    // Subscribe to bet results
    betsChannel = supabase
      .channel('bets-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bets',
        },
        async (payload) => {
          // Reload bet lists on any change
          get().loadActiveBets()
          get().loadRecentBets()

          // Handle updates for current user
          if (payload.eventType === 'UPDATE') {
            const updatedBet = payload.new as Bet
            const { user, userBet } = get()
            
            if (user && userBet && updatedBet.id === userBet.id) {
              set({ userBet: updatedBet })

              // Refresh user balance
              const { data: userData } = await supabase
                .from('users')
                .select('*')
                .eq('id', user.id)
                .single()

              if (userData) {
                set({ user: userData })
              }

              // Show result
              if (updatedBet.result === 'won') {
                // Set the win amount to trigger the animation in the UI
                set({ lastWinAmount: updatedBet.profit })
                
                // Trigger confetti
                confetti({
                  particleCount: 150,
                  spread: 80,
                  origin: { y: 0.6 },
                  colors: ['#10b981', '#f59e0b', '#ffffff'],
                  zIndex: 100 // Ensure it's above everything
                });
              } else if (updatedBet.result === 'lost') {
                // Set the loss amount to trigger the animation in the UI
                set({ lastLossAmount: updatedBet.bet_amount })
                // toast.error(`😔 Bạn đã thua $${updatedBet.bet_amount.toFixed(2)}`)
              }
            }
          }
        }
      )
      .subscribe()
  },

  subscribeToUsers: () => {
    // Clean up existing channel if it exists
    if (usersChannel) {
      usersChannel.unsubscribe()
      usersChannel = null
    }
    
    const currentUser = get().user
    if (!currentUser) {
      return
    }
    
    // Subscribe to user balance changes
    usersChannel = supabase
      .channel('users-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `id=eq.${currentUser.id}`,
        },
        async (payload) => {
          const updatedUser = payload.new as User
          const oldUser = payload.old as User
          
          // Update user state
          set({ user: updatedUser })
          
          // Check if balance decreased (could be penalty or bet placement)
          const balanceChange = updatedUser.balance - oldUser.balance
          
          if (balanceChange < 0) {
            // Balance decreased - could be penalty or bet
            // Check if this is likely a penalty (not immediately after placing a bet)
            const { userBet, currentRound } = get()
            
            // If user has no bet at all, or bet is from previous round, this is a penalty
            const isPenalty = !userBet || (currentRound && userBet.round_id !== currentRound.id)
            
            if (isPenalty) {
              const penaltyAmount = Math.abs(balanceChange)
              toast.error(`⚠️ You were penalized $${penaltyAmount.toFixed(2)} for not placing a bet!`, {
                duration: 6000,
                description: 'Place a bet in the next round to avoid penalty!'
              })
            }
          } else if (balanceChange > 0) {
            // Balance increased - user won or got refund
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'users',
          filter: `id=eq.${currentUser.id}`,
        },
        async (_payload) => {
          // User was deleted from database - log them out
          console.log('User deleted from database, logging out...')
          set({ 
            user: null, 
            currentRound: null, 
            userBet: null, 
            goldPrice: null,
            countdown: 0,
            isWaitingForNewGame: false
          })
          toast.error('Your account has been removed. Please login again.')
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
        }
      })
  },

  subscribeToAdminPresence: () => {
    // Clean up existing channel if it exists
    if (presenceChannel) {
      presenceChannel.unsubscribe()
      presenceChannel = null
    }

    // Check for admin presence
    const checkAdminPresence = async () => {
      try {
        const { data, error } = await supabase
          .from('presence')
          .select('*')
          .eq('session_type', 'admin')
          .gte('last_seen', new Date(Date.now() - 15000).toISOString()) // Active in last 15 seconds (admin updates every 10s)
          .limit(1)
          .single()

        const adminOnline = !error && data !== null
        set({ isAdminOnline: adminOnline })
      } catch (error) {
        set({ isAdminOnline: false })
      }
    }

    // Initial check
    checkAdminPresence()

    // Subscribe to presence changes - focus on admin session type
    presenceChannel = supabase
      .channel('presence-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'presence',
          filter: 'session_type=eq.admin'
        },
        () => {
          // Immediately check admin presence when any change occurs
          checkAdminPresence()
        }
      )
      .subscribe()

    // Poll every 3 seconds for admin detection (admin updates every 10s, check more frequently)
    const presenceCheckInterval = setInterval(checkAdminPresence, 3000)

    // Clean up on unmount
    return () => {
      clearInterval(presenceCheckInterval)
      if (presenceChannel) {
        presenceChannel.unsubscribe()
        presenceChannel = null
      }
    }
  },

  updateUserPresence: async () => {
    const { user } = get()
    if (!user) return

    // Generate or use existing session ID
    if (!userSessionId) {
      userSessionId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }

    try {
      // Upsert presence
      await supabase
        .from('presence')
        .upsert({
          session_id: userSessionId,
          session_type: 'user',
          user_id: user.id,
          last_seen: new Date().toISOString(),
        }, {
          onConflict: 'session_id'
        })

      // Start heartbeat if not already running
      if (!presenceHeartbeatInterval) {
        presenceHeartbeatInterval = setInterval(async () => {
          const currentUser = get().user
          if (!currentUser || !userSessionId) {
            clearInterval(presenceHeartbeatInterval)
            presenceHeartbeatInterval = null
            return
          }

          try {
            await supabase
              .from('presence')
              .update({
                last_seen: new Date().toISOString(),
              })
              .eq('session_id', userSessionId)
          } catch (error) {
            console.error('Failed to update user presence:', error)
          }
        }, 500)
      }
    } catch (error) {
      console.error('Failed to initialize user presence:', error)
    }
  },

  loadUserSkills: async () => {
    try {
      const { user } = get()
      if (!user) return

      const { data, error } = await supabase
        .from('user_skills')
        .select(`
          *,
          skill_definitions (*)
        `)
        .eq('user_id', user.id)

      if (error) throw error
      set({ userSkills: data || [] })
    } catch (error) {
      console.error('Failed to load user skills:', error)
    }
  },

  loadSkillDefinitions: async () => {
    try {
      const { data, error } = await supabase
        .from('skill_definitions')
        .select('*')

      if (error) throw error
      set({ skillDefinitions: data || [] })
    } catch (error) {
      console.error('Failed to load skill definitions:', error)
    }
  },

  activateSkill: async (skillId: string, targetUserId?: string) => {
    try {
      const { user, currentRound, userSkills } = get()
      if (!user || !currentRound) return false

      // Check if user has this skill with quantity available
      const userSkill = userSkills.find(s => s.skill_id === skillId)
      if (!userSkill || userSkill.quantity <= 0) {
        toast.error('You don\'t have this skill!')
        return false
      }

      // Create skill signal for admin to process
      const { error } = await supabase
        .from('skill_signals')
        .insert({
          signal_type: 'skill_request',
          from_user_id: user.id,
          target_user_id: targetUserId || null,
          skill_id: skillId,
          round_number: currentRound.round_number,
          processed: false
        })

      if (error) throw error

      toast.success('⚡ Skill activated! Processing...')
      return true
    } catch (error) {
      console.error('Failed to activate skill:', error)
      toast.error('Failed to activate skill!')
      return false
    }
  },

  subscribeToSkillSignals: () => {
    const { user } = get()
    if (!user) return

    // Clean up existing channel if it exists
    if (skillSignalsChannel) {
      skillSignalsChannel.unsubscribe()
      skillSignalsChannel = null
    }

    skillSignalsChannel = supabase
      .channel('skill-signals')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'skill_signals',
          filter: `target_user_id=eq.${user.id}`
        },
        async (payload) => {
          const signal = payload.new as SkillSignal
          
          if (signal.signal_type === 'skill_executed') {
            // Show effect to target user
            set({ incomingSkillEffect: signal })
            
            // Update user balance directly without full reload (to avoid "Connecting..." flash)
            const currentUser = get().user
            if (currentUser) {
              const { data: updatedUser } = await supabase
                .from('users')
                .select('balance')
                .eq('id', currentUser.id)
                .single()
              
              if (updatedUser) {
                set({ user: { ...currentUser, balance: updatedUser.balance } })
              }
            }
            
            // Auto-clear after 5 seconds
            setTimeout(() => {
              get().clearIncomingSkillEffect()
            }, 5000)
          }
        }
      )
      .subscribe()
  },


}))
