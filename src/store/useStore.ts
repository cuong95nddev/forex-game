import { create } from 'zustand'
import { supabase, type User, type GoldPrice } from '../lib/supabase'
import { getFingerprint } from '../lib/fingerprint'
import { initializeDatabase } from '../lib/initDb'

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
  loadRecentBets: () => Promise<void>
  loadPriceHistory: () => Promise<void>
  loadOnlineUsers: () => Promise<void>
}

let countdownInterval: NodeJS.Timeout | null = null
let broadcastChannel: any = null

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
  loading: true,

  loadUser: async () => {
    try {
      // Initialize database with initial data if needed
      await initializeDatabase()
      
      const fingerprint = await getFingerprint()
      
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('fingerprint', fingerprint)
        .single()

      if (userError && userError.code !== 'PGRST116') {
        console.error('Error loading user:', userError)
        set({ loading: false })
        return
      }

      if (userData) {
        set({ user: userData })
      }

      // Load latest gold price
      const { data: priceData } = await supabase
        .from('gold_prices')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(1)
        .single()

      set({ goldPrice: priceData })

      // Load current round
      const { data: roundData } = await supabase
        .from('rounds')
        .select('*')
        .eq('status', 'active')
        .order('round_number', { ascending: false })
        .limit(1)
        .single()

      if (roundData) {
        set({ currentRound: roundData })
        
        // Don't calculate countdown here, wait for broadcast from admin
        // Admin will send the accurate countdown via broadcast channel

        // Check if user has bet in this round
        if (userData) {
          const { data: betData } = await supabase
            .from('bets')
            .select('*')
            .eq('user_id', userData.id)
            .eq('round_id', roundData.id)
            .single()

          set({ userBet: betData })
        }
      }

      set({ loading: false })
    } catch (error) {
      console.error('Error in loadUser:', error)
      set({ loading: false })
    }
  },

  initializeUser: async (name: string) => {
    try {
      const fingerprint = await getFingerprint()
      
      const { data: newUser, error: userError } = await supabase
        .from('users')
        .insert([{ fingerprint, name, balance: 10000 }])
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
      alert('Không thể đặt cược ngay bây giờ!')
      return false
    }

    if (countdown <= 0) {
      alert('Hết thời gian đặt cược cho vòng này!')
      return false
    }

    if (user.balance < amount) {
      alert('Số dư không đủ!')
      return false
    }

    if (amount < 100) {
      alert('Số tiền cược tối thiểu là $100!')
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
        alert('Không thể đặt cược! Có thể bạn đã đặt cược trong vòng này rồi.')
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
    console.log('Setting up gold price subscription...')
    const channel = supabase
      .channel('gold-prices-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'gold_prices'
        },
        (payload) => {
          console.log('🔥 Gold price updated via realtime:', payload.new)
          const newPrice = payload.new as GoldPrice
          set({ goldPrice: newPrice })
          
          // Don't update price history here - let broadcast handle it to avoid duplicates
          // Price history will be updated via broadcast channel which includes countdown sync
        }
      )
      .subscribe((status, err) => {
        if (err) {
          console.error('❌ Gold price subscription error:', err)
        }
        console.log('✅ Gold price subscription status:', status)
      })
    
    return channel
  },

  subscribeToBroadcast: () => {
    console.log('Setting up broadcast subscription...')
    
    broadcastChannel = supabase.channel('game-state')
    
    broadcastChannel
      .on('broadcast', { event: 'game-state' }, (payload: any) => {
        console.log('📡 Broadcast received:', payload)
        const { countdown, currentRound, goldPrice, winRate: broadcastWinRate } = payload.payload
        
        // Update winRate if provided
        if (broadcastWinRate !== undefined) {
          set({ winRate: broadcastWinRate })
        }
        
        if (goldPrice !== undefined) {
          console.log('🔥 Gold Price from broadcast:', goldPrice, 'Type:', typeof goldPrice)
          // If goldPrice is a complete object with price and change, use it
          // Otherwise treat it as just a price number (backwards compatibility)
          if (typeof goldPrice === 'object' && goldPrice.price !== undefined) {
            console.log('✅ Setting goldPrice object:', goldPrice)
            set({ 
              countdown,
              currentRound,
              goldPrice: goldPrice
            })
            
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
            console.log('⚠️ Converting number to goldPrice object. Old:', oldPrice?.price, 'New:', goldPrice, 'Change:', change)
            
            const newPriceObj = {
              price: goldPrice,
              change: change,
              timestamp: new Date().toISOString(),
              id: '' // ID not needed for display
            }
            
            set({ 
              countdown,
              currentRound,
              goldPrice: newPriceObj
            })
            
            // Update price history
            const { priceHistory } = get()
            const updatedHistory = [...priceHistory, newPriceObj]
            // Keep last 100 prices
            if (updatedHistory.length > 100) {
              updatedHistory.shift()
            }
            set({ priceHistory: updatedHistory })
          }
        } else {
          set({ countdown, currentRound })
        }
      })
      .subscribe((status) => {
        console.log('Broadcast subscription status:', status)
      })
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
    // Subscribe to new rounds
    supabase
      .channel('rounds-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'rounds',
        },
        (payload) => {
          console.log('New round started:', payload.new)
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
          console.log('Round updated:', payload.new)
          const updatedRound = payload.new as Round
          if (updatedRound.status === 'completed') {
            set({ currentRound: updatedRound })
          }
        }
      )
      .subscribe()

    // Subscribe to bet results
    supabase
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
            console.log('Your bet result:', updatedBet)
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
              alert(`🎉 Chúc mừng! Bạn đã thắng $${updatedBet.profit.toFixed(2)}!`)
            } else if (updatedBet.result === 'lost') {
              alert(`😔 Bạn đã thua $${updatedBet.bet_amount.toFixed(2)}`)
            }
          }
        }
      )
      .subscribe()
  },
}))
