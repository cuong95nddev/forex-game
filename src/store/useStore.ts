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
  countdown: number
  loading: boolean
  initializeUser: (name: string) => Promise<void>
  loadUser: () => Promise<void>
  placeBet: (prediction: 'up' | 'down', amount: number) => Promise<boolean>
  subscribeToGoldPrice: () => void
  subscribeToBroadcast: () => void
  subscribeToRounds: () => void
  loadRecentBets: () => Promise<void>
}

let countdownInterval: NodeJS.Timeout | null = null
let broadcastChannel: any = null

export const useStore = create<AppState>((set, get) => ({
  user: null,
  goldPrice: null,
  currentRound: null,
  userBet: null,
  recentBets: [],
  countdown: 15,
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
        
        // Calculate initial countdown
        const startTime = new Date(roundData.start_time).getTime()
        const now = Date.now()
        const elapsed = Math.floor((now - startTime) / 1000)
        const remaining = Math.max(0, 15 - elapsed)
        set({ countdown: remaining })

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
    supabase
      .channel('gold-prices-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'gold_prices'
        },
        (payload) => {
          console.log('🔥 Gold price updated:', payload.new)
          set({ goldPrice: payload.new as GoldPrice })
        }
      )
      .subscribe((status) => {
        console.log('Gold price subscription status:', status)
      })
  },

  subscribeToBroadcast: () => {
    console.log('Setting up broadcast subscription...')
    
    broadcastChannel = supabase.channel('game-state')
    
    broadcastChannel
      .on('broadcast', { event: 'game-state' }, (payload: any) => {
        console.log('📡 Broadcast received:', payload)
        const { countdown, currentRound, goldPrice } = payload.payload
        
        set({ 
          countdown,
          currentRound,
          goldPrice: goldPrice ? { price: goldPrice, change: 0, timestamp: new Date().toISOString() } : get().goldPrice
        })
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
            userBet: null,
            countdown: 15
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
