import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { Play, Pause, TrendingUp, TrendingDown, RefreshCw, Settings, Users, Database, AlertTriangle, LayoutDashboard, LogOut, Clock, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

export default function AdminPanel() {
  const [currentPrice, setCurrentPrice] = useState(2000)
  const [priceChange, setPriceChange] = useState(0)
  const [currentRound, setCurrentRound] = useState<any>(null)
  const [countdown, setCountdown] = useState(15)
  const [showStartDialog, setShowStartDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showDeleteUserDialog, setShowDeleteUserDialog] = useState(false)
  const [userToDelete, setUserToDelete] = useState<string | null>(null)
  const [showCleanPricesDialog, setShowCleanPricesDialog] = useState(false)
  const [showResetAllDialog, setShowResetAllDialog] = useState(false)
  const [showCleanRoundsDialog, setShowCleanRoundsDialog] = useState(false)
  const [isGameRunning, setIsGameRunning] = useState(false)
  const [isWaitingForConfig, setIsWaitingForConfig] = useState(false)
  const [newGameConfig, setNewGameConfig] = useState({
    roundDuration: 15,
    priceUpdateInterval: 1,
    winRate: 95,
    defaultUserBalance: 10000,
    minBetAmount: 10,
    maxBetAmount: 50000,
    noBetPenalty: 0
  })
  
  // Settings
  const [roundDuration, setRoundDuration] = useState(15) // seconds
  const [priceUpdateInterval, setPriceUpdateInterval] = useState(1) // seconds
  const [winRate, setWinRate] = useState(0.95) // 95% profit (0.95 = 95%)
  const [defaultUserBalance, setDefaultUserBalance] = useState(10000)
  const [minBetAmount, setMinBetAmount] = useState(10)
  const [maxBetAmount, setMaxBetAmount] = useState(50000)
  const [noBetPenalty, setNoBetPenalty] = useState(0)
  const [settingsId, setSettingsId] = useState<string | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  
  const [stats, setStats] = useState({
    totalRounds: 0,
    activePlayers: 0,
    totalBets: 0,
  })
  
  // User management
  const [users, setUsers] = useState<any[]>([])
  const [activeView, setActiveView] = useState<'dashboard' | 'users' | 'settings' | 'data'>('dashboard')
  const [editingUser, setEditingUser] = useState<string | null>(null)
  const [editBalance, setEditBalance] = useState<number>(0)
  
  const broadcastChannel = useRef<any>(null)
  const countdownInterval = useRef<any>(null)
  const countdownTimerId = useRef<string | null>(null)
  const adminSessionId = useRef<string>(`admin-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`)
  const currentPriceRef = useRef(2000)
  const priceChangeRef = useRef(0)
  const lastTrendRef = useRef(0) // For smoother price movement
  const isInitialized = useRef(false)
  const pausedCountdown = useRef<number | null>(null)
  const pausedRound = useRef<any>(null)
  const presenceHeartbeatInterval = useRef<any>(null)

  useEffect(() => {
    // Prevent double initialization (React StrictMode)
    if (isInitialized.current) {
      return
    }
    isInitialized.current = true
    
    const initialize = async () => {
      // Setup broadcast channel
      broadcastChannel.current = supabase.channel('game-state')
      await broadcastChannel.current.subscribe()
      
      await loadSettings()
      await loadCurrentPrice()
      await loadCurrentRound()
      await loadStats()
      await loadUsers()
      
      // Initialize admin presence
      await initializeAdminPresence()
    }
    
    initialize()

    return () => {
      if (countdownInterval.current) {
        clearInterval(countdownInterval.current)
      }
      if (presenceHeartbeatInterval.current) {
        clearInterval(presenceHeartbeatInterval.current)
      }
      // Clean up presence on unmount
      cleanupAdminPresence()
      if (broadcastChannel.current) broadcastChannel.current.unsubscribe()
      isInitialized.current = false
    }
  }, []) // Empty dependency array - only run once on mount
  
  // Separate effect for stats polling
  useEffect(() => {
    const statsInterval = setInterval(() => {
      loadStats()
      if (activeView === 'users') {
        loadUsers()
      }
    }, 3000)
    
    return () => clearInterval(statsInterval)
  }, [activeView])

  // Effect to handle game running state - start/stop countdown
  useEffect(() => {
    if (!isGameRunning) {
      // Pause countdown when game is stopped
      if (countdownInterval.current) {
        clearInterval(countdownInterval.current)
        countdownInterval.current = null
        countdownTimerId.current = null
      }
    } else if (isGameRunning && currentRound && !countdownInterval.current) {
      // Start countdown when game is running and there's a round
      startCountdownTimer(currentRound)
    }
  }, [isGameRunning, currentRound])

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>

    if (isGameRunning) {
      interval = setInterval(() => {
        handleAutoUpdatePrice()
      }, priceUpdateInterval * 1000)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [isGameRunning, currentPrice, priceUpdateInterval])

  const loadSettings = async () => {
    try {
      const { data } = await supabase
        .from('game_settings')
        .select('*')
        .limit(1)
        .single()

      if (data) {
        setRoundDuration(data.round_duration)
        setPriceUpdateInterval(data.price_update_interval)
        setWinRate(data.win_rate)
        setDefaultUserBalance(data.default_user_balance || 10000)
        setMinBetAmount(data.min_bet_amount || 10)
        setMaxBetAmount(data.max_bet_amount || 50000)
        setNoBetPenalty(data.no_bet_penalty || 0)
        setSettingsId(data.id)
        setHasUnsavedChanges(false)
      }
    } catch (error) {
      // Error loading settings
    }
  }

  const saveSettings = async () => {
    if (!settingsId) return

    setIsSaving(true)
    try {
      await supabase
        .from('game_settings')
        .update({
          round_duration: roundDuration,
          price_update_interval: priceUpdateInterval,
          win_rate: winRate,
          default_user_balance: defaultUserBalance,
          min_bet_amount: minBetAmount,
          max_bet_amount: maxBetAmount,
          no_bet_penalty: noBetPenalty,
          updated_at: new Date().toISOString()
        })
        .eq('id', settingsId)

      setHasUnsavedChanges(false)
      toast.success('✅ Settings saved successfully!')
    } catch (error) {
      toast.error('❌ Error saving settings!')
    } finally {
      setIsSaving(false)
    }
  }

  const deleteCurrentGame = async () => {
    try {
      // Stop the game
      setIsGameRunning(false)
      if (countdownInterval.current) {
        clearInterval(countdownInterval.current)
        countdownInterval.current = null
        countdownTimerId.current = null
      }

      // End current round if exists
      if (currentRound) {
        const { error: updateError } = await supabase
          .from('rounds')
          .update({
            status: 'completed',
            end_time: new Date().toISOString(),
            end_price: currentPrice
          })
          .eq('id', currentRound.id)
        
        if (updateError) {
          console.error('Error updating round status:', updateError)
          throw updateError
        }
        
        // Clear the current round immediately
        setCurrentRound(null)
        setCountdown(0)
      }

      // Broadcast no active game (don't change waiting state)
      if (broadcastChannel.current) {
        broadcastChannel.current.send({
          type: 'broadcast',
          event: 'game-state',
          payload: {
            adminSessionId: adminSessionId.current,
            currentRound: null,
            countdown: 0,
            goldPrice: { price: currentPrice, change: 0, timestamp: new Date().toISOString() }
          }
        })
      }
      
      setIsWaitingForConfig(false)

      await loadStats()
      // Reload current round to ensure UI is in sync with database
      await loadCurrentRound()
      
      toast.success('🗑️ Current game deleted successfully')
    } catch (error) {
      console.error('Error deleting game:', error)
      toast.error('❌ Failed to delete current game!')
    }
  }

  const prepareForNewGame = async () => {
    try {
      // Stop the game
      setIsGameRunning(false)
      if (countdownInterval.current) {
        clearInterval(countdownInterval.current)
        countdownInterval.current = null
        countdownTimerId.current = null
      }

      // End current round if exists
      if (currentRound) {
        await supabase
          .from('rounds')
          .update({
            status: 'completed',
            end_time: new Date().toISOString(),
            end_price: currentPrice
          })
          .eq('id', currentRound.id)
        
        setCurrentRound(null)
      }

      // Set waiting state
      setIsWaitingForConfig(true)
      
      // Broadcast waiting state to all clients
      if (broadcastChannel.current) {
        broadcastChannel.current.send({
          type: 'broadcast',
          event: 'game-state',
          payload: {
            adminSessionId: adminSessionId.current,
            isWaiting: true
          }
        })
      }

      // Show the config dialog
      setShowStartDialog(true)
      toast.info('⏳ Game paused. Configure new game settings.')
    } catch (error) {
      toast.error('❌ Failed to prepare for new game!')
    }
  }

  const startNewGameSession = async () => {
    setIsSaving(true)
    try {
      // Stop countdown
      setIsGameRunning(false)
      if (countdownInterval.current) {
        clearInterval(countdownInterval.current)
        countdownInterval.current = null
        countdownTimerId.current = null
      }

      // Delete game history (but keep users)
      await supabase.from('bets').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('rounds').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('gold_prices').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      
      // Reset all user balances to default instead of deleting them
      await supabase
        .from('users')
        .update({ balance: newGameConfig.defaultUserBalance })
        .neq('id', '00000000-0000-0000-0000-000000000000')
      
      // Update settings with new config
      if (settingsId) {
        await supabase
          .from('game_settings')
          .update({
            round_duration: newGameConfig.roundDuration,
            price_update_interval: newGameConfig.priceUpdateInterval,
            win_rate: newGameConfig.winRate / 100,
            default_user_balance: newGameConfig.defaultUserBalance,
            min_bet_amount: newGameConfig.minBetAmount,
            max_bet_amount: newGameConfig.maxBetAmount,
            no_bet_penalty: newGameConfig.noBetPenalty,
            updated_at: new Date().toISOString()
          })
          .eq('id', settingsId)
      }
      
      // Reload settings
      await loadSettings()
      
      // Reset state
      setCurrentPrice(2000)
      setPriceChange(0)
      currentPriceRef.current = 2000
      priceChangeRef.current = 0
      setCurrentRound(null)
      setCountdown(newGameConfig.roundDuration)
      pausedCountdown.current = null
      pausedRound.current = null
      setIsWaitingForConfig(false)
      
      // Initialize with fresh price
      await supabase.from('gold_prices').insert({ price: 2000, change: 0 })
      
      // Start first round
      await startNewRound(2000)
      
      // Broadcast game started (clear waiting state)
      if (broadcastChannel.current) {
        broadcastChannel.current.send({
          type: 'broadcast',
          event: 'game-state',
          payload: {
            adminSessionId: adminSessionId.current,
            isWaiting: false
          }
        })
      }
      
      // Start game running
      setIsGameRunning(true)
      
      await loadStats()
      await loadUsers()
      
      setShowStartDialog(false)
      toast.success('🎮 New game session started! Round 1 is now active.')
    } catch (error) {
      toast.error('❌ Failed to start new game session!')
    } finally {
      setIsSaving(false)
    }
  }

  const loadCurrentPrice = async () => {
    const { data } = await supabase
      .from('gold_prices')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(1)
      .single()

    if (data) {
      // Validate price - if invalid, reset to 2000
      const validPrice = (data.price >= 1000 && data.price <= 10000) ? data.price : 2000
      if (validPrice !== data.price) {
        // Insert corrected price
        await supabase
          .from('gold_prices')
          .insert({ price: 2000, change: 0 })
      }
      setCurrentPrice(validPrice)
      setPriceChange(validPrice === 2000 ? 0 : data.change)
      currentPriceRef.current = validPrice
      priceChangeRef.current = validPrice === 2000 ? 0 : data.change
    } else {
      // Insert initial price if none exists
      const { data: newPrice } = await supabase
        .from('gold_prices')
        .insert({ price: 2000, change: 0 })
        .select()
        .single()
      
      if (newPrice) {
        setCurrentPrice(newPrice.price)
        setPriceChange(0)
        currentPriceRef.current = newPrice.price
        priceChangeRef.current = 0
      }
    }
  }

  const resumeCountdownTimer = (round: any, remainingSeconds: number) => {
    // Generate unique timer ID
    const timerId = `timer-resume-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    // Clear any existing interval first
    if (countdownInterval.current) {
      clearInterval(countdownInterval.current)
      countdownInterval.current = null
      countdownTimerId.current = null
    }
    
    countdownTimerId.current = timerId
    
    // Calculate new start time based on remaining seconds
    const fixedDuration = roundDuration
    const startTime = Date.now() - ((fixedDuration - remainingSeconds) * 1000)
    
    const updateCountdown = () => {
      // Check if this timer is still the active one
      if (countdownTimerId.current !== timerId) {
        return
      }
      
      const now = Date.now()
      const elapsed = Math.floor((now - startTime) / 1000)
      const remaining = Math.max(0, fixedDuration - elapsed)
      
      setCountdown(remaining)
      
      // Broadcast game state to all clients
      if (broadcastChannel.current) {
        const latestPrice = currentPriceRef.current
        const change = latestPrice - round.start_price
        broadcastChannel.current.send({
          type: 'broadcast',
          event: 'game-state',
          payload: {
            adminSessionId: adminSessionId.current,
            countdown: remaining,
            currentRound: round,
            goldPrice: { price: latestPrice, change: change, timestamp: new Date().toISOString() },
            roundDuration: fixedDuration,
            winRate: winRate,
            minBetAmount: minBetAmount,
            maxBetAmount: maxBetAmount
          }
        })
      }
      
      if (remaining === 0) {
        clearInterval(countdownInterval.current)
        countdownInterval.current = null
        countdownTimerId.current = null
        completeRound(round)
      }
    }
    
    updateCountdown()
    countdownInterval.current = setInterval(updateCountdown, 1000)
  }

  const startCountdownTimer = (round: any) => {
    // Generate unique timer ID
    const timerId = `timer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    // Clear any existing interval first
    if (countdownInterval.current) {
      clearInterval(countdownInterval.current)
      countdownInterval.current = null
      countdownTimerId.current = null
    }
    
    countdownTimerId.current = timerId
    
    const startTime = new Date(round.start_time).getTime()
    // Capture the duration at the start of the round - don't use reactive state
    const fixedDuration = roundDuration
    
    
    const updateCountdown = () => {
      // Check if this timer is still the active one
      if (countdownTimerId.current !== timerId) {
        return
      }
      
      const now = Date.now()
      const elapsed = Math.floor((now - startTime) / 1000)
      const remaining = Math.max(0, fixedDuration - elapsed)
      
      setCountdown(remaining)
      
      // Broadcast game state to all clients
      if (broadcastChannel.current) {
        const latestPrice = currentPriceRef.current
        const change = latestPrice - round.start_price
        broadcastChannel.current.send({
          type: 'broadcast',
          event: 'game-state',
          payload: {
            adminSessionId: adminSessionId.current,
            countdown: remaining,
            currentRound: round,
            goldPrice: { price: latestPrice, change: change, timestamp: new Date().toISOString() },
            roundDuration: fixedDuration, // Send the fixed duration for this round
            winRate: winRate, // Gửi winRate đến clients
            minBetAmount: minBetAmount,
            maxBetAmount: maxBetAmount
          }
        })
      }
      
      if (remaining === 0) {
        clearInterval(countdownInterval.current)
        countdownInterval.current = null
        countdownTimerId.current = null
        completeRound(round)
      }
    }
    
    updateCountdown()
    countdownInterval.current = setInterval(updateCountdown, 1000)
  }

  const loadCurrentRound = async () => {
    const { data } = await supabase
      .from('rounds')
      .select('*')
      .eq('status', 'active')
      .order('round_number', { ascending: false })
      .limit(1)
      .single()

    setCurrentRound(data)
    // Don't automatically start countdown - wait for auto mode to be enabled
  }

  const initializeAdminPresence = async () => {
    try {
      // Insert admin presence
      await supabase
        .from('presence')
        .upsert({
          session_id: adminSessionId.current,
          session_type: 'admin',
          last_seen: new Date().toISOString(),
        }, {
          onConflict: 'session_id'
        })

      // Start heartbeat to update presence every 1 second
      presenceHeartbeatInterval.current = setInterval(async () => {
        try {
          await supabase
            .from('presence')
            .update({
              last_seen: new Date().toISOString(),
            })
            .eq('session_id', adminSessionId.current)
        } catch (error) {
          console.error('Failed to update admin presence:', error)
        }
      }, 1000)

      console.log('Admin presence initialized')
    } catch (error) {
      console.error('Failed to initialize admin presence:', error)
    }
  }

  const cleanupAdminPresence = async () => {
    try {
      await supabase
        .from('presence')
        .delete()
        .eq('session_id', adminSessionId.current)
      
      console.log('Admin presence cleaned up')
    } catch (error) {
      console.error('Failed to cleanup admin presence:', error)
    }
  }

  const loadStats = async () => {
    const { count: roundCount } = await supabase
      .from('rounds')
      .select('*', { count: 'exact', head: true })

    const { count: betCount } = await supabase
      .from('bets')
      .select('*', { count: 'exact', head: true })

    // Count online users (active in last 30 seconds)
    const { count: userCount } = await supabase
      .from('presence')
      .select('*', { count: 'exact', head: true })
      .eq('session_type', 'user')
      .gte('last_seen', new Date(Date.now() - 30000).toISOString())

    setStats({
      totalRounds: roundCount || 0,
      activePlayers: userCount || 0,
      totalBets: betCount || 0,
    })
  }

  const loadUsers = async () => {
    const { data } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (data) {
      setUsers(data)
    }
  }

  const updateUserBalance = async (userId: string, newBalance: number) => {
    try {
      await supabase
        .from('users')
        .update({ balance: newBalance })
        .eq('id', userId)
      
      await loadUsers()
      setEditingUser(null)
      toast.success('Balance updated successfully')
    } catch (error) {
      toast.error('Failed to update balance')
    }
  }

  const deleteUser = async (userId: string) => {
    try {
      // Delete user (CASCADE will automatically delete related bets)
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', userId)
      
      if (error) throw error
      
      await loadUsers()
      await loadStats()
      toast.success('User deleted successfully')
    } catch (error) {
      toast.error('Failed to delete user')
    }
  }

  const cleanPriceHistory = async () => {
    try {
      await supabase
        .from('gold_prices')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all
      
      // Insert fresh starting price
      await supabase
        .from('gold_prices')
        .insert({ price: 2000, change: 0 })
      
      setCurrentPrice(2000)
      setPriceChange(0)
      currentPriceRef.current = 2000
      priceChangeRef.current = 0
      
      toast.success('Price history cleaned successfully')
    } catch (error) {
      toast.error('Failed to clean price history')
    }
  }

  const resetAllData = async () => {
    try {
      // Stop countdown and auto mode
      setIsAutoMode(false)
      if (countdownInterval.current) clearInterval(countdownInterval.current)

      // Delete all data in order
      await supabase.from('bets').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('rounds').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('gold_prices').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('users').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      
      // Reset state
      setCurrentPrice(2000)
      setPriceChange(0)
      currentPriceRef.current = 2000
      priceChangeRef.current = 0
      setCurrentRound(null)
      setCountdown(15)
      
      // Reinitialize
      await supabase.from('gold_prices').insert({ price: 2000, change: 0 })
      await loadStats()
      await loadUsers()
      
      toast.success('All data has been reset successfully. You can restart the system now.')
    } catch (error) {
      toast.error('Failed to reset data')
    }
  }

  const cleanOldRounds = async () => {
    try {
      const oneDayAgo = new Date()
      oneDayAgo.setHours(oneDayAgo.getHours() - 24)

      await supabase
        .from('rounds')
        .delete()
        .eq('status', 'completed')
        .lt('end_time', oneDayAgo.toISOString())
      
      await loadStats()
      toast.success('Old rounds cleaned successfully')
    } catch (error) {
      toast.error('Failed to clean old rounds')
    }
  }

  const completeRound = async (round: any) => {
    try {
      // Get latest price
      const { data: latestPrice } = await supabase
        .from('gold_prices')
        .select('price')
        .order('timestamp', { ascending: false })
        .limit(1)
        .single()

      if (!latestPrice) return

      // Validate end price - if invalid, use 2000
      let endPrice = latestPrice.price
      if (endPrice < 1000 || endPrice > 10000 || isNaN(endPrice)) {
        endPrice = 2000
      }

      // Update round
      await supabase
        .from('rounds')
        .update({
          end_price: endPrice,
          end_time: new Date().toISOString(),
          status: 'completed',
        })
        .eq('id', round.id)

      // Process all bets for this round
      const { data: bets } = await supabase
        .from('bets')
        .select('*, users(*)')
        .eq('round_id', round.id)
        .eq('result', 'pending')

      if (bets) {
        for (const bet of bets) {
          const priceWentUp = endPrice > round.start_price
          const userWon = 
            (bet.prediction === 'up' && priceWentUp) ||
            (bet.prediction === 'down' && !priceWentUp)

          const result = userWon ? 'won' : 'lost'
          const profit = userWon ? bet.bet_amount * winRate : 0
          // Winners get their bet back + profit, losers already lost their bet when placing it
          const balanceChange = userWon ? bet.bet_amount + profit : 0

          // Update bet result
          await supabase
            .from('bets')
            .update({ result, profit })
            .eq('id', bet.id)

          // Update user balance if they won
          if (userWon) {
            const newBalance = bet.users.balance + balanceChange
            await supabase
              .from('users')
              .update({ balance: newBalance })
              .eq('id', bet.user_id)
          }
        }
      }

      // Apply penalty to users who didn't bet (if penalty is configured)
      if (noBetPenalty > 0) {
        // Get all active users
        const { data: allUsers } = await supabase
          .from('users')
          .select('id, balance, name')

        if (allUsers) {
          // Get user IDs who placed bets in this round
          const userIdsWithBets = bets?.map(bet => bet.user_id) || []

          // Find users who didn't bet
          const usersWithoutBets = allUsers.filter(
            user => !userIdsWithBets.includes(user.id)
          )

          // Apply penalty to each user who didn't bet
          for (const user of usersWithoutBets) {
            const newBalance = Math.max(0, user.balance - noBetPenalty)
            await supabase
              .from('users')
              .update({ balance: newBalance })
              .eq('id', user.id)
            
          }

          if (usersWithoutBets.length > 0) {
            toast.info(`💸 Penalized ${usersWithoutBets.length} users ($${noBetPenalty} each) for not betting`)
          }
        }
      }

      // Start new round
      await startNewRound(endPrice)
    } catch (error) {
    }
  }

  const startNewRound = async (startPrice: number) => {
    const { data: lastRound } = await supabase
      .from('rounds')
      .select('round_number')
      .order('round_number', { ascending: false })
      .limit(1)
      .single()

    const newRoundNumber = (lastRound?.round_number || 0) + 1

    // Get all online users (active in last 5 seconds)
    const { data: presenceData } = await supabase
      .from('presence')
      .select('user_id')
      .eq('session_type', 'user')
      .gte('last_seen', new Date(Date.now() - 1000).toISOString())

    // Extract unique user IDs
    const allowedUsers = presenceData 
      ? [...new Set(presenceData.map(p => p.user_id).filter(id => id))]
      : []

    console.log('Starting round with allowed users:', allowedUsers)

    const { data: newRound } = await supabase
      .from('rounds')
      .insert({
        round_number: newRoundNumber,
        start_price: startPrice,
        start_time: new Date().toISOString(),
        status: 'active',
        allowed_users: allowedUsers,
      })
      .select()
      .single()

    if (newRound) {
      setCurrentRound(newRound)
      startCountdownTimer(newRound)
    }
  }

  const handleAutoUpdatePrice = async () => {
    // Use ref to get latest price value
    let latestPrice = currentPriceRef.current
    
    // Safety check: if price is invalid, reset to 2000
    if (latestPrice < 1000 || latestPrice > 10000 || isNaN(latestPrice)) {
      latestPrice = 2000
      currentPriceRef.current = 2000
      setCurrentPrice(2000)
    }
    
    // Improved realistic market movement
    // 1. Update trend (smooth random walk): allow trend to shift slowly
    // Small random adjustment to current trend
    const trendAdjustment = (Math.random() - 0.5) * 0.1
    // Apply decay to pull trend back to 0 over time (mean reversion for trend)
    lastTrendRef.current = (lastTrendRef.current * 0.95) + trendAdjustment
    
    // Clamp trend to avoid runaway prices
    if (lastTrendRef.current > 1.5) lastTrendRef.current = 1.5
    if (lastTrendRef.current < -1.5) lastTrendRef.current = -1.5

    // 2. Volatility (Market Noise) - Random distinct move
    // Using box-muller for normal distribution feel
    const u1 = Math.random()
    const u2 = Math.random()
    const z = Math.sqrt(-2.0 * Math.log(u1 || 0.00001)) * Math.cos(2.0 * Math.PI * u2)
    const volatility = 2.0 // Standard deviation in dollars
    const noise = z * volatility

    // 3. Calculate new change
    let change = lastTrendRef.current + noise
    
    // 4. Global Mean Reversion (pull back to 2000 if strayed too far)
    if (latestPrice > 2500) change -= 0.5
    if (latestPrice < 1500) change += 0.5
    
    const newPrice = latestPrice + change

    await updatePrice(newPrice, change)
  }

  const handleManualUpdate = async () => {
    await updatePrice(currentPrice, priceChange)
  }

  const updatePrice = async (price: number, priceIncrement: number) => {
    try {
      // Calculate change relative to round start price
      const change = currentRound ? price - currentRound.start_price : priceIncrement
      
      // Insert new price
      await supabase
        .from('gold_prices')
        .insert({
          price: price,
          change: change,
          timestamp: new Date().toISOString(),
        })

      setCurrentPrice(price)
      setPriceChange(change)
      currentPriceRef.current = price
      priceChangeRef.current = change

      // NOTE: Don't broadcast here! The countdown timer already broadcasts game state
      // including the latest price from currentPriceRef. Broadcasting here causes
      // duplicate broadcasts with potentially stale countdown values.

      // Check if we need to start a new round
      if (!currentRound) {
        await startNewRound(price)
      }
    } catch (error) {
    }
  }

  const handlePriceIncrease = async () => {
    const increase = currentPrice * 0.01 // 1%
    const newPrice = currentPrice + increase
    await updatePrice(newPrice, increase)
  }

  const handlePriceDecrease = async () => {
    const decrease = currentPrice * 0.01 // 1%
    const newPrice = currentPrice - decrease
    await updatePrice(newPrice, -decrease)
  }

  return (
    <div className="flex h-screen bg-[#0b0f13] text-white font-sans overflow-hidden select-none">
      {/* Start New Game Dialog */}
      <Dialog open={showStartDialog} onOpenChange={setShowStartDialog}>
        <DialogContent className="max-w-2xl bg-[#0b0f13] border-[#1e293b] text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Start New Game Session</DialogTitle>
            <DialogDescription className="text-[#94a3b8]">
              Configure your game settings. This will reset all game data and start from Round 1.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">Round Duration (s)</label>
                <Input 
                  type="number" 
                  className="bg-[#1e293b] border-[#334155] text-white font-mono"
                  value={newGameConfig.roundDuration} 
                  onChange={(e) => setNewGameConfig({...newGameConfig, roundDuration: parseInt(e.target.value) || 15})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">Price Update (s)</label>
                <Input 
                  type="number" 
                  className="bg-[#1e293b] border-[#334155] text-white font-mono"
                  value={newGameConfig.priceUpdateInterval} 
                  onChange={(e) => setNewGameConfig({...newGameConfig, priceUpdateInterval: parseInt(e.target.value) || 1})}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">Win Rate (%)</label>
                <Input 
                  type="number" 
                  className="bg-[#1e293b] border-[#334155] text-white font-mono"
                  value={newGameConfig.winRate} 
                  onChange={(e) => setNewGameConfig({...newGameConfig, winRate: parseInt(e.target.value) || 95})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">Default Balance ($)</label>
                <Input 
                  type="number" 
                  className="bg-[#1e293b] border-[#334155] text-white font-mono"
                  value={newGameConfig.defaultUserBalance} 
                  onChange={(e) => setNewGameConfig({...newGameConfig, defaultUserBalance: parseInt(e.target.value) || 10000})}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">Min Bet ($)</label>
                <Input 
                  type="number" 
                  className="bg-[#1e293b] border-[#334155] text-white font-mono"
                  value={newGameConfig.minBetAmount} 
                  onChange={(e) => setNewGameConfig({...newGameConfig, minBetAmount: parseInt(e.target.value) || 10})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">Max Bet ($)</label>
                <Input 
                  type="number" 
                  className="bg-[#1e293b] border-[#334155] text-white font-mono"
                  value={newGameConfig.maxBetAmount} 
                  onChange={(e) => setNewGameConfig({...newGameConfig, maxBetAmount: parseInt(e.target.value) || 50000})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">Penalty ($)</label>
                <Input 
                  type="number" 
                  className="bg-[#1e293b] border-[#334155] text-white font-mono"
                  value={newGameConfig.noBetPenalty} 
                  onChange={(e) => setNewGameConfig({...newGameConfig, noBetPenalty: parseInt(e.target.value) || 0})}
                />
              </div>
            </div>

            <Alert className="mt-2 bg-[#ef4444]/10 border-[#ef4444]/20 text-[#ef4444]">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Starting a new game will reset all user balances and delete all bets, rounds, and price history.
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter>
            <Button variant="outline" className="border-[#334155] text-[#94a3b8] hover:bg-[#1e293b] hover:text-white" onClick={() => setShowStartDialog(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button 
              onClick={startNewGameSession} 
              disabled={isSaving}
              className="bg-[#10b981] hover:bg-[#059669] text-white font-bold"
            >
              {isSaving ? 'Starting...' : 'Start New Game'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sidebar */}
      <aside className="w-[240px] bg-[#0b0f13] border-r border-[#1e293b] flex flex-col hidden sm:flex z-50">
        <div className="h-14 flex items-center px-6 border-b border-[#1e293b]">
          <div className="flex items-center gap-2 font-bold text-white">
            <div className="w-8 h-8 rounded bg-[#f59e0b] flex items-center justify-center text-black shadow-lg shadow-[#f59e0b]/20">
              <Settings size={18} />
            </div>
            <span className="tracking-wider text-sm">ADMIN PANEL</span>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          {[
            { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
            { id: 'users', icon: Users, label: 'Users' },
            { id: 'settings', icon: Settings, label: 'Settings' },
            { id: 'data', icon: Database, label: 'Data' }
          ].map((item) => (
            <Button 
              key={item.id}
              variant="ghost" 
              className={`w-full justify-start gap-3 h-10 ${activeView === item.id ? 'bg-[#1e293b] text-[#f59e0b] border-r-2 border-[#f59e0b]' : 'text-[#94a3b8] hover:bg-[#1e293b]/50 hover:text-white'}`}
              onClick={() => setActiveView(item.id as any)}
            >
              <item.icon size={18} />
              <span className="font-medium text-xs uppercase tracking-wider">{item.label}</span>
            </Button>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-[#0b0f13] border-b border-[#1e293b] flex items-center px-6 justify-between shrink-0">
          <div className="flex items-center gap-2">
            <h1 className="font-bold text-xs uppercase tracking-widest text-white">{activeView}</h1>
          </div>
          
          <div className="flex items-center gap-3">
            {isWaitingForConfig && (
              <Badge variant="outline" className="bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/20 gap-1.5 animate-pulse">
                <Clock size={12} />
                WAITING FOR CONFIG
              </Badge>
            )}
            {isGameRunning && (
              <Badge variant="outline" className="bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20 gap-1.5 hidden sm:flex">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10b981] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#10b981]"></span>
                </span>
                BROADCASTING LIVE
              </Badge>
            )}
            
            <div className="h-6 w-[1px] bg-[#1e293b] mx-2"></div>

            <Button
              onClick={prepareForNewGame}
              size="sm"
              className="bg-[#f59e0b] hover:bg-[#d97706] text-black font-bold text-xs"
            >
              <Play size={14} className="mr-2" />
              NEW GAME
            </Button>
            
            {currentRound && (
              <>
                <Button
                  onClick={() => setIsGameRunning(!isGameRunning)}
                  size="sm"
                  variant="outline"
                  className="border-[#334155] text-[#94a3b8] hover:text-white hover:bg-[#1e293b]"
                >
                  {isGameRunning ? <Pause size={14} className="mr-2" /> : <Play size={14} className="mr-2" />}
                  {isGameRunning ? 'PAUSE' : 'RESUME'}
                </Button>
                <Button
                  onClick={() => setShowDeleteDialog(true)}
                  size="sm"
                  variant="outline"
                  className="border-[#ef4444]/30 text-[#ef4444] hover:bg-[#ef4444]/10 hover:text-[#ef4444]"
                >
                  <Trash2 size={14} className="mr-2" />
                  DELETE
                </Button>
              </>
            )}
          </div>
        </header>
        
        <ScrollArea className="flex-1 bg-[#0b0f13]">
          <div className="p-6 space-y-6">
          
          {/* Dashboard View */}
          {activeView === 'dashboard' && (
            <div className="space-y-6">
              {/* Warning Banner */}
              <div className="bg-[#f59e0b]/10 border border-[#f59e0b]/20 p-4 rounded-lg flex items-start gap-3">
                <AlertTriangle className="h-4 w-4 text-[#f59e0b] shrink-0" />
                 <div>
                  <h4 className="text-[#f59e0b] font-bold text-xs uppercase tracking-wider">Broadcast Active</h4>
                  <p className="text-[#94a3b8] text-xs mt-1">
                    Keep this page open to maintain game broadcast. Closing it will stop the game.
                  </p>
                </div>
              </div>

              {/* No Active Game State */}
              {!currentRound && !isGameRunning && !isWaitingForConfig && (
                <div className="border border-dashed border-[#1e293b] rounded-xl bg-[#0b0f13]/50 p-12 flex flex-col items-center justify-center text-center">
                    <div className="rounded-full bg-[#1e293b] p-4 mb-4">
                      <Clock className="h-8 w-8 text-[#94a3b8]" />
                    </div>
                    <h3 className="text-sm font-bold mb-2 text-white uppercase tracking-wider">No Active Game</h3>
                    <p className="text-[#94a3b8] mb-6 max-w-sm text-xs">
                      Start a new game session to begin trading rounds and broadcasts.
                    </p>
                    <Button onClick={prepareForNewGame} className="bg-[#10b981] hover:bg-[#059669] text-white text-xs font-bold uppercase tracking-wider">
                      Initialize Game System
                    </Button>
                </div>
              )}

              {/* Stats Grid */}
              {currentRound && (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {[
                  { label: 'Total Rounds', value: stats.totalRounds, icon: RefreshCw },
                  { label: 'Active Players', value: stats.activePlayers, icon: Users },
                  { label: 'Total Bets', value: stats.totalBets, icon: Database },
                  { label: 'Current Price', value: `$${currentPrice.toFixed(2)}`, sub: `${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}`, icon: TrendingUp, color: priceChange >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]' },
                ].map((stat, i) => (
                  <div key={i} className="bg-[#0b0f13] border border-[#1e293b] p-4 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                       <span className="text-[#94a3b8] text-[10px] uppercase font-bold tracking-wider">{stat.label}</span>
                       <stat.icon size={14} className="text-[#94a3b8]" />
                    </div>
                    <div className={`text-2xl font-mono font-bold text-white`}>
                       {stat.value}
                    </div>
                    {stat.sub && (
                       <div className={`text-xs font-bold mt-1 ${stat.color}`}>{stat.sub}</div>
                    )}
                  </div>
                ))}
              </div>
              )}

               {/* Current Round Card */}
              {currentRound && (
                <div className="bg-[#0b0f13] border border-[#1e293b] rounded-lg overflow-hidden">
                  <div className="border-b border-[#1e293b] bg-[#1e293b]/30 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                       <RefreshCw className="h-4 w-4 animate-spin text-[#f59e0b]" />
                       <h3 className="font-bold text-white text-xs uppercase tracking-wider">Round #{currentRound.round_number}</h3>
                    </div>
                    <Badge variant="outline" className="border-[#10b981] text-[#10b981] bg-[#10b981]/10">ACTIVE</Badge>
                  </div>
                  <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="bg-[#0b0f13] p-4 rounded-lg border border-[#1e293b]">
                         <div className="text-[#94a3b8] text-[10px] uppercase font-bold tracking-wider mb-2">Start Price</div>
                         <div className="text-2xl font-mono font-bold text-white">${currentRound.start_price.toFixed(2)}</div>
                      </div>
                      <div className="bg-[#0b0f13] p-4 rounded-lg border border-[#1e293b]">
                         <div className="text-[#94a3b8] text-[10px] uppercase font-bold tracking-wider mb-2">Current Price</div>
                         <div className={`text-2xl font-mono font-bold ${currentPrice >= currentRound.start_price ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                            ${currentPrice.toFixed(2)}
                         </div>
                      </div>
                      <div className="bg-[#0b0f13] p-4 rounded-lg border border-[#1e293b]">
                        <div className="text-[#94a3b8] text-[10px] uppercase font-bold tracking-wider mb-2">Time Remaining</div>
                         <div className={`text-2xl font-mono font-bold flex items-center gap-2 ${countdown <= 5 ? 'text-[#ef4444] animate-pulse' : 'text-[#f59e0b]'}`}>
                          <Clock size={20} />
                          {countdown}s
                         </div>
                      </div>
                  </div>
                </div>
              )}

              {/* Auto Mode Config View */}
              {isGameRunning && (
                <div className="bg-[#0b0f13] border border-[#1e293b] rounded-lg p-6">
                  <h3 className="font-bold text-white mb-4 text-xs uppercase tracking-widest">Configuration</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[
                        { label: 'Update Interval', value: `${priceUpdateInterval}s` },
                        { label: 'Win Rate', value: `${(winRate*100).toFixed(0)}%` },
                        { label: 'Bet Range', value: `$${minBetAmount} - $${maxBetAmount}` },
                        { label: 'No Bet Penalty', value: `$${noBetPenalty}` },
                      ].map((item, i) => (
                        <div key={i} className="bg-[#1e293b]/50 p-3 rounded border border-[#1e293b]">
                          <div className="text-[#94a3b8] text-[10px] uppercase font-bold mb-1">{item.label}</div>
                          <div className="font-mono text-sm text-white">{item.value}</div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Users View */}
          {activeView === 'users' && (
             <div className="bg-[#0b0f13] border border-[#1e293b] rounded-lg flex flex-col h-[600px]">
              <div className="p-4 border-b border-[#1e293b] bg-[#1e293b]/20">
                <h3 className="font-bold text-white text-xs uppercase tracking-widest">User Management</h3>
              </div>
              <ScrollArea className="flex-1">
                 <Table>
                  <TableHeader className="bg-[#1e293b]/50 sticky top-0">
                    <TableRow className="border-[#1e293b] hover:bg-transparent">
                      <TableHead className="text-[#94a3b8] text-[10px] uppercase font-bold">User</TableHead>
                      <TableHead className="text-[#94a3b8] text-[10px] uppercase font-bold">Balance</TableHead>
                      <TableHead className="text-[#94a3b8] text-[10px] uppercase font-bold">ID / Fingerprint</TableHead>
                      <TableHead className="text-[#94a3b8] text-[10px] uppercase font-bold">Joined</TableHead>
                      <TableHead className="text-right text-[#94a3b8] text-[10px] uppercase font-bold">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                     {users.map((user) => (
                      <TableRow key={user.id} className="border-[#1e293b] hover:bg-[#1e293b]/30">
                        <TableCell className="font-bold text-white">{user.name}</TableCell>
                         <TableCell>
                          {editingUser === user.id ? (
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                value={editBalance}
                                onChange={(e) => setEditBalance(parseFloat(e.target.value))}
                                className="w-24 h-8 bg-[#0b0f13] border-[#334155] text-white"
                              />
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-[#10b981] hover:bg-[#10b981]/10 hover:text-[#10b981]" onClick={() => updateUserBalance(user.id, editBalance)}>
                                <TrendingUp className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-[#ef4444] hover:bg-[#ef4444]/10 hover:text-[#ef4444]" onClick={() => setEditingUser(null)}>
                                <LogOut className="h-4 w-4 rotate-180" />
                              </Button>
                            </div>
                          ) : (
                             <span className="font-mono text-[#f59e0b]">${user.balance.toFixed(2)}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-[#94a3b8] text-xs font-mono">{user.fingerprint.substring(0, 12)}...</TableCell>
                        <TableCell className="text-[#94a3b8] text-xs">{new Date(user.created_at).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right">
                           {editingUser !== user.id && (
                              <div className="flex justify-end gap-2">
                                <Button variant="outline" size="sm" className="h-8 text-xs border-[#334155] text-[#94a3b8] hover:text-white" onClick={() => { setEditingUser(user.id); setEditBalance(user.balance); }}>EDIT</Button>
                                <Button variant="ghost" size="sm" className="h-8 w-8 text-[#ef4444] hover:bg-[#ef4444]/10 hover:text-[#ef4444] p-0" onClick={() => { setUserToDelete(user.id); setShowDeleteUserDialog(true); }}>
                                   <Trash2 size={14} />
                                </Button>
                              </div>
                           )}
                        </TableCell>
                      </TableRow>
                     ))}
                  </TableBody>
                 </Table>
              </ScrollArea>
             </div>
          )}

          {/* Settings View */}
          {activeView === 'settings' && (
            <div className="max-w-4xl space-y-6">
              <div className="bg-[#0b0f13] border border-[#1e293b] rounded-lg p-6">
                <h3 className="font-bold text-white mb-1 text-xs uppercase tracking-widest">Game Configuration</h3>
                <p className="text-xs text-[#94a3b8] mb-6">Adjust the core mechanics of the game rounds.</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">Round Duration (s)</label>
                      <Input className="bg-[#1e293b] border-[#334155] text-white" type="number" value={roundDuration} onChange={(e) => { setRoundDuration(parseInt(e.target.value)||15); setHasUnsavedChanges(true); }} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">Price Update (s)</label>
                      <Input className="bg-[#1e293b] border-[#334155] text-white" type="number" value={priceUpdateInterval} onChange={(e) => { setPriceUpdateInterval(parseInt(e.target.value)||1); setHasUnsavedChanges(true); }} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">Win Rate (0.95 = 95%)</label>
                       <Input className="bg-[#1e293b] border-[#334155] text-white" type="number" value={(winRate * 100).toFixed(0)} onChange={(e) => { setWinRate(parseFloat(e.target.value)/100 || 0.95); setHasUnsavedChanges(true); }} />
                    </div>
                </div>
              </div>

              <div className="bg-[#0b0f13] border border-[#1e293b] rounded-lg p-6">
                <h3 className="font-bold text-white mb-1 text-xs uppercase tracking-widest">Financial Limits</h3>
                <p className="text-xs text-[#94a3b8] mb-6">Set limits for betting and balances.</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">Default Balance ($)</label>
                        <Input className="bg-[#1e293b] border-[#334155] text-white" type="number" value={defaultUserBalance} onChange={(e) => { setDefaultUserBalance(parseFloat(e.target.value)||10000); setHasUnsavedChanges(true); }} />
                    </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">Penalty ($)</label>
                        <Input className="bg-[#1e293b] border-[#334155] text-white" type="number" value={noBetPenalty} onChange={(e) => { setNoBetPenalty(parseFloat(e.target.value)||0); setHasUnsavedChanges(true); }} />
                    </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">Min Bet ($)</label>
                        <Input className="bg-[#1e293b] border-[#334155] text-white" type="number" value={minBetAmount} onChange={(e) => { setMinBetAmount(parseFloat(e.target.value)||10); setHasUnsavedChanges(true); }} />
                    </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">Max Bet ($)</label>
                        <Input className="bg-[#1e293b] border-[#334155] text-white" type="number" value={maxBetAmount} onChange={(e) => { setMaxBetAmount(parseFloat(e.target.value)||50000); setHasUnsavedChanges(true); }} />
                    </div>
                </div>

                <div className="mt-6 pt-6 border-t border-[#1e293b]">
                    <Button onClick={saveSettings} disabled={!hasUnsavedChanges || isSaving} className="w-full sm:w-auto bg-[#10b981] hover:bg-[#059669] text-white font-bold text-xs uppercase tracking-wider">
                      {isSaving ? 'Saving...' : 'Save Configuration'}
                    </Button>
                </div>
              </div>
            </div>
          )}

          {/* Data View */}
          {activeView === 'data' && (
            <div className="max-w-4xl space-y-6">
               <div className="bg-[#0b0f13] border border-[#1e293b] rounded-lg p-6">
                 <h3 className="font-bold text-white mb-4 text-xs uppercase tracking-widest">Database Maintenance</h3>
                 <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 border border-[#1e293b] rounded-lg bg-[#1e293b]/30">
                      <div>
                        <div className="font-bold text-white text-sm">Clear Price History</div>
                        <div className="text-xs text-[#94a3b8]">Removes all price records except the latest ones.</div>
                      </div>
                       <Button variant="outline" className="border-[#334155] text-[#94a3b8] hover:text-white" onClick={() => setShowCleanPricesDialog(true)}>Clear</Button>
                    </div>
                     <div className="flex items-center justify-between p-4 border border-[#1e293b] rounded-lg bg-[#1e293b]/30">
                      <div>
                        <div className="font-bold text-white text-sm">Clear Old Rounds</div>
                        <div className="text-xs text-[#94a3b8]">Removes completed rounds older than 24 hours.</div>
                      </div>
                       <Button variant="outline" className="border-[#334155] text-[#94a3b8] hover:text-white" onClick={() => setShowCleanRoundsDialog(true)}>Clear</Button>
                    </div>
                 </div>
               </div>

               <div className="bg-[#0b0f13] border border-[#ef4444]/30 rounded-lg p-6">
                 <h3 className="font-bold text-[#ef4444] mb-4 text-xs uppercase tracking-widest">Danger Zone</h3>
                 <div className="space-y-4">
                    <div className="bg-[#ef4444]/10 border border-[#ef4444]/20 p-4 rounded-lg flex items-start gap-3 text-[#ef4444] text-xs">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <p>This action will wipe ALL data including users, bets, and settings. This cannot be undone.</p>
                    </div>
                    <Button variant="destructive" className="w-full text-xs uppercase tracking-wider font-bold" onClick={() => setShowResetAllDialog(true)}>Reset Entire System</Button>
                 </div>
               </div>
            </div>
          )}
          </div>
        </ScrollArea>
      </div>

      {/* Delete Game Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="bg-[#0b0f13] border-[#1e293b] text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Delete Current Game?</DialogTitle>
            <DialogDescription className="text-[#94a3b8]">
              This will end the current round and stop the game. Players will return to the waiting screen.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="border-[#334155] text-[#94a3b8] hover:text-white" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => {
                setShowDeleteDialog(false)
                deleteCurrentGame()
              }}
            >
              Delete Game
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation Dialog */}
      <Dialog open={showDeleteUserDialog} onOpenChange={setShowDeleteUserDialog}>
        <DialogContent className="bg-[#0b0f13] border-[#1e293b] text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Delete User?</DialogTitle>
            <DialogDescription className="text-[#94a3b8]">
              This will permanently delete this user and all their bets. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="border-[#334155] text-[#94a3b8] hover:text-white" onClick={() => setShowDeleteUserDialog(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => {
                setShowDeleteUserDialog(false)
                if (userToDelete) {
                  deleteUser(userToDelete)
                  setUserToDelete(null)
                }
              }}
            >
              Delete User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clean Price History Dialog */}
      <Dialog open={showCleanPricesDialog} onOpenChange={setShowCleanPricesDialog}>
        <DialogContent className="bg-[#0b0f13] border-[#1e293b] text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Clean Price History?</DialogTitle>
            <DialogDescription className="text-[#94a3b8]">
              This will delete all price history and reset to starting price. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="border-[#334155] text-[#94a3b8] hover:text-white" onClick={() => setShowCleanPricesDialog(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => {
                setShowCleanPricesDialog(false)
                cleanPriceHistory()
              }}
            >
              Clean History
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clean Old Rounds Dialog */}
      <Dialog open={showCleanRoundsDialog} onOpenChange={setShowCleanRoundsDialog}>
        <DialogContent className="bg-[#0b0f13] border-[#1e293b] text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Clean Old Rounds?</DialogTitle>
            <DialogDescription className="text-[#94a3b8]">
               This will delete all completed rounds older than 24 hours. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="border-[#334155] text-[#94a3b8] hover:text-white" onClick={() => setShowCleanRoundsDialog(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => {
                setShowCleanRoundsDialog(false)
                cleanOldRounds()
              }}
            >
              Clean Rounds
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset All Data Dialog */}
      <Dialog open={showResetAllDialog} onOpenChange={setShowResetAllDialog}>
        <DialogContent className="bg-[#0b0f13] border-[#1e293b] text-white">
          <DialogHeader>
            <DialogTitle className="text-white text-destructive">⚠️ DANGER: Reset Entire System?</DialogTitle>
            <DialogDescription className="space-y-2 text-[#94a3b8]">
              <p className="font-bold text-destructive">This will delete ALL data including:</p>
              <ul className="list-disc list-inside text-sm">
                <li>All users</li>
                <li>All bets</li>
                <li>All rounds</li>
                <li>All price history</li>
              </ul>
              <p className="font-bold">This action CANNOT be undone!</p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="border-[#334155] text-[#94a3b8] hover:text-white" onClick={() => setShowResetAllDialog(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => {
                setShowResetAllDialog(false)
                resetAllData()
              }}
            >
              Reset Everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

