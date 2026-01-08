import { create } from 'zustand'
import { supabase, type User, type GoldPrice } from '../lib/supabase'
import { getFingerprint } from '../lib/fingerprint'
import { initializeDatabase } from '../lib/initDb'
import { toast } from 'sonner'

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
  priceHistory: GoldPrice[]
  countdown: number
  winRate: number
  onlineUsers: number
  loading: boolean
  initializeUser: (name: string) => Promise<void>
  loadUser: () => Promise<void>
  placeBet: (prediction: 'up' | 'down', amount: number) => Promise<boolean>
  subscribeToGoldPrice: () => void
  subscribeToBroadcast: () => void
  subscribeToRounds: () => void
  subscribeToUsers: () => void
  loadRecentBets: () => Promise<void>
  loadPriceHistory: () => Promise<void>
  loadOnlineUsers: () => Promise<void>
}

let countdownInterval: NodeJS.Timeout | null = null
let broadcastChannel: any = null
let goldPriceChannel: any = null
let roundsChannel: any = null
let betsChannel: any = null
let usersChannel: any = null
let subscriptionsActive = false
let acceptedAdminSession: string | null = null // Only accept broadcasts from one admin

export const useStore = create<AppState>((set, get) => ({
  user: null,
  goldPrice: null,
  currentRound: null,
  userBet: null,
  recentBets: [],
  priceHistory: [],
  countdown: 15,
  winRate: 0.95,
  onlineUsers: 0,
  loading: false, // Changed default to false

  loadUser: async () => {
    try {
      console.log('🔄 Starting loadUser...')
      set({ loading: true })
      
      // Initialize database with initial data if needed
      console.log('🔄 Initializing database...')
      const dbInitialized = await Promise.race([
        initializeDatabase(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Database initialization timeout')), 10000))
      ])
      console.log('✅ Database initialized:', dbInitialized)
      
      const fingerprint = await getFingerprint()
      console.log('🔑 Got fingerprint:', fingerprint)
      
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('fingerprint', fingerprint)
        .single()

      if (userError && userError.code !== 'PGRST116') {
        console.error('❌ Error loading user:', userError)
        set({ loading: false })
        return
      }

      if (userData) {
        console.log('✅ User found:', userData.name)
        set({ user: userData })
      } else {
        console.log('ℹ️ No user found for this device')
      }

      // Load latest gold price
      console.log('🔄 Loading gold price...')
      const { data: priceData } = await supabase
        .from('gold_prices')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(1)
        .single()

      if (priceData) {
        console.log('✅ Gold price loaded:', priceData.price)
        set({ goldPrice: priceData })
      }

      // Load current round
      console.log('🔄 Loading current round...')
      const { data: roundData } = await supabase
        .from('rounds')
        .select('*')
        .eq('status', 'active')
        .order('round_number', { ascending: false })
        .limit(1)
        .single()

      if (roundData) {
        console.log('✅ Active round found:', roundData.round_number)
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
            console.log('✅ User bet found:', betData.prediction)
            set({ userBet: betData })
          }
        }
      } else {
        console.log('ℹ️ No active round found')
      }

      console.log('✅ loadUser completed successfully')
      set({ loading: false })
    } catch (error) {
      console.error('❌ Error in loadUser:', error)
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
        console.error('User creation error:', userError)
        throw new Error(`Failed to create user: ${userError.message} (Code: ${userError.code})`)
      }

      set({ user: newUser })
    } catch (error) {
      console.error('Error initializing user:', error)
      throw error
    }
  },

  placeBet: async (prediction: 'up' | 'down', amount: number) => {
    const { user, currentRound, countdown } = get()
    
    if (!user || !currentRound) {
      toast.error('Không thể đặt cược ngay bây giờ!')
      return false
    }

    if (countdown <= 0) {
      toast.warning('Hết thời gian đặt cược cho vòng này!')
      return false
    }

    if (user.balance < amount) {
      toast.error('Số dư không đủ!')
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
      toast.warning(`Số tiền cược tối thiểu là $${minBet}!`)
      return false
    }

    if (amount > maxBet) {
      toast.warning(`Số tiền cược tối đa là $${maxBet.toLocaleString()}!`)
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
        console.error('Bet error:', betError)
        // Refund if bet fails
        await supabase
          .from('users')
          .update({ balance: user.balance })
          .eq('id', user.id)
        toast.error('Không thể đặt cược! Có thể bạn đã đặt cược trong vòng này rồi.')
        return false
      }

      set({ 
        user: { ...user, balance: newBalance },
        userBet: betData
      })

      return true
    } catch (error) {
      console.error('Error placing bet:', error)
      return false
    }
  },

  subscribeToGoldPrice: () => {
    // Clean up existing channel if it exists
    if (goldPriceChannel) {
      console.log('🧹 Cleaning up existing gold price channel')
      goldPriceChannel.unsubscribe()
      goldPriceChannel = null
    }
    
    // Note: We're not subscribing to postgres_changes for gold_prices
    // because it can cause realtime binding errors.
    // Gold prices will be updated via the broadcast channel from admin.
    console.log('⏭️ Skipping gold price postgres subscription (using broadcast only)')
  },

  subscribeToBroadcast: () => {
    // Prevent duplicate subscriptions
    if (subscriptionsActive && broadcastChannel) {
      console.log('⚠️ Broadcast subscription already active, skipping')
      return
    }
    
    // Clean up existing channel if it exists
    if (broadcastChannel) {
      console.log('🧹 Cleaning up existing broadcast channel')
      broadcastChannel.unsubscribe()
      broadcastChannel = null
    }
    
    subscriptionsActive = true
    broadcastChannel = supabase.channel('game-state')
    
    broadcastChannel
      .on('broadcast', { event: 'game-state' }, (payload: any) => {
        const { countdown, currentRound, goldPrice, winRate: broadcastWinRate, adminSessionId } = payload.payload
        
        // If this is from a new admin session, accept it (first one wins, or reset on new round)
        if (adminSessionId) {
          if (!acceptedAdminSession) {
            acceptedAdminSession = adminSessionId
            console.log('🔒 Locked to admin session:', adminSessionId)
          } else if (acceptedAdminSession !== adminSessionId) {
            // Ignore broadcasts from other admin sessions
            console.log('⚠️ Ignoring broadcast from different admin:', adminSessionId.slice(-6), '(locked to:', acceptedAdminSession.slice(-6) + ')')
            return
          }
        }
        
        // Update countdown from admin broadcast - this is the source of truth
        if (countdown !== undefined) {
          console.log('⏱️ Countdown updated from admin:', countdown, 'session:', adminSessionId?.slice(-6) || 'unknown')
          set({ countdown })
        }
        
        // Update current round if provided - reset admin lock on new round
        if (currentRound !== undefined) {
          const oldRound = get().currentRound
          if (oldRound && currentRound.id !== oldRound.id) {
            // New round started, reset admin lock to allow any admin
            acceptedAdminSession = adminSessionId || null
            console.log('🔄 New round, reset admin lock to:', acceptedAdminSession?.slice(-6) || 'none')
          }
          set({ currentRound })
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
      console.error('Error loading recent bets:', error)
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
      console.error('Error loading price history:', error)
    }
  },

  loadOnlineUsers: async () => {
    try {
      const { count } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })

      if (count !== null) {
        set({ onlineUsers: count })
      }
    } catch (error) {
      console.error('Error loading online users:', error)
    }
  },

  subscribeToRounds: () => {
    // Prevent duplicate subscriptions
    if (subscriptionsActive && (roundsChannel || betsChannel)) {
      console.log('⚠️ Rounds/Bets subscriptions already active, skipping')
      return
    }
    
    // Clean up existing channels if they exist
    if (roundsChannel) {
      console.log('🧹 Cleaning up existing rounds channel')
      roundsChannel.unsubscribe()
      roundsChannel = null
    }
    if (betsChannel) {
      console.log('🧹 Cleaning up existing bets channel')
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
          event: 'UPDATE',
          schema: 'public',
          table: 'bets',
        },
        async (payload) => {
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

            // Reload recent bets
            get().loadRecentBets()

            // Show result
            if (updatedBet.result === 'won') {
              toast.success(`🎉 Chúc mừng! Bạn đã thắng $${updatedBet.profit.toFixed(2)}!`)
            } else if (updatedBet.result === 'lost') {
              toast.error(`😔 Bạn đã thua $${updatedBet.bet_amount.toFixed(2)}`)
            }
          }
        }
      )
      .subscribe()
  },

  subscribeToUsers: () => {
    // Clean up existing channel if it exists
    if (usersChannel) {
      console.log('🧹 Cleaning up existing users channel')
      usersChannel.unsubscribe()
      usersChannel = null
    }
    
    const currentUser = get().user
    if (!currentUser) {
      console.log('⚠️ No user found, skipping user subscription')
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
          
          console.log('💰 User balance changed:', {
            old: oldUser.balance,
            new: updatedUser.balance,
            change: updatedUser.balance - oldUser.balance
          })
          
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
              console.log('💸 Penalty detected:', penaltyAmount)
              toast.error(`⚠️ Bạn bị phạt $${penaltyAmount.toFixed(2)} vì không đặt cược!`, {
                duration: 6000,
                description: 'Đặt cược trong vòng tiếp theo để tránh bị phạt!'
              })
            }
          } else if (balanceChange > 0) {
            // Balance increased - user won or got refund
            console.log('💰 Balance increased:', balanceChange)
          }
        }
      )
      .subscribe((status) => {
        console.log('👤 User subscription status:', status)
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to user balance changes for user:', currentUser.id)
        }
      })
  },
}))
