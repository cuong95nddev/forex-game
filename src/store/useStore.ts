import { create } from 'zustand'
import { supabase, type User, type GoldPrice } from '../lib/supabase'
import { getFingerprint } from '../lib/fingerprint'
import { initializeDatabase } from '../lib/initDb'
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
  loading: boolean
  allUsers: User[]
  lastWinAmount: number | null
  isWaitingForNewGame: boolean
  isAdminOnline: boolean
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
  updateUserPresence: () => Promise<void>
  loadRecentBets: () => Promise<void>
  loadActiveBets: () => Promise<void>
  loadPriceHistory: () => Promise<void>
  loadOnlineUsers: () => Promise<void>
  loadAllUsers: () => Promise<void>
}

let broadcastChannel: any = null
let goldPriceChannel: any = null
let roundsChannel: any = null
let betsChannel: any = null
let usersChannel: any = null
let presenceChannel: any = null
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
  allUsers: [],
  lastWinAmount: null,
  lastLossAmount: null,
  loading: false, // Changed default to false
  isWaitingForNewGame: false,
  isAdminOnline: false,

  setLastWinAmount: (amount) => set({ lastWinAmount: amount }),
  setLastLossAmount: (amount) => set({ lastLossAmount: amount }),

  loadUser: async () => {
    try {
      set({ loading: true })
      
      // Initialize database with initial data if needed
      await Promise.race([
        initializeDatabase(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Database initialization timeout')), 10000))
      ])
      
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

      // Load current round
      const { data: roundData } = await supabase
        .from('rounds')
        .select('*')
        .eq('status', 'active')
        .order('round_number', { ascending: false })
        .limit(1)
        .single()

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

      set({ user: newUser })
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
      .on('broadcast', { event: 'game-state' }, (payload: any) => {
        const { countdown, currentRound, goldPrice, winRate: broadcastWinRate, adminSessionId, isWaiting } = payload.payload
        
        
        // Handle waiting state
        if (isWaiting !== undefined) {
          set({ isWaitingForNewGame: isWaiting })
          if (isWaiting) {
            // Clear current round when waiting for new game
            set({ currentRound: null, userBet: null, countdown: 0 })
            return // Don't process other updates when in waiting state
          }
        }
        
        // If this is from a new admin session, accept it (first one wins, or reset on new round)
        if (adminSessionId) {
          if (!acceptedAdminSession) {
            acceptedAdminSession = adminSessionId
          } else if (acceptedAdminSession !== adminSessionId) {
            // Ignore broadcasts from other admin sessions
            return
          }
        }
        
        // Update countdown from admin broadcast - this is the source of truth
        if (countdown !== undefined) {
          set({ countdown })
        }
        
        // Update current round if provided - reset admin lock on new round
        if ('currentRound' in payload.payload) {
          const oldRound = get().currentRound
          if (oldRound && currentRound && currentRound.id !== oldRound.id) {
            // New round started, reset admin lock to allow any admin
            acceptedAdminSession = adminSessionId || null
          }
          // If currentRound is null, clear userBet as well
          if (currentRound === null) {
            set({ currentRound: null, userBet: null })
          } else {
            set({ currentRound })
          }
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
      // Count users active in last 30 seconds
      const { count } = await supabase
        .from('presence')
        .select('*', { count: 'exact', head: true })
        .eq('session_type', 'user')
        .gte('last_seen', new Date(Date.now() - 30000).toISOString())

      if (count !== null) {
        set({ onlineUsers: count })
      }
    } catch (error) {
    }
  },

  loadAllUsers: async () => {
    try {
      const { data } = await supabase
        .from('users')
        .select('*')
        .order('balance', { ascending: false })

      if (data) {
        set({ allUsers: data })
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
          if (updatedRound.status === 'completed') {
            set({ currentRound: updatedRound })
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
          .gte('last_seen', new Date(Date.now() - 15000).toISOString()) // Active in last 15 seconds
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

    // Subscribe to presence changes
    presenceChannel = supabase
      .channel('presence-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'presence',
        },
        () => {
          checkAdminPresence()
        }
      )
      .subscribe()

    // Poll every 5 seconds as backup
    const presenceCheckInterval = setInterval(checkAdminPresence, 5000)

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
        }, 2000) // Update every 2 seconds
      }
    } catch (error) {
      console.error('Failed to initialize user presence:', error)
    }
  },
}))
