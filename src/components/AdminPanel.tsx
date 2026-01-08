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
    if (!confirm('Delete the current game? This will end the round and stop the game.')) {
      return
    }

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

      // Broadcast no active game and clear waiting state
      if (broadcastChannel.current) {
        broadcastChannel.current.send({
          type: 'broadcast',
          event: 'game-state',
          payload: {
            adminSessionId: adminSessionId.current,
            currentRound: null,
            countdown: 0,
            isWaiting: false,
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

      // Start heartbeat to update presence every 2 seconds
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
      }, 2000)

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
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      return
    }

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
    if (!confirm('Are you sure you want to clean all price history? This action cannot be undone.')) {
      return
    }

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
    if (!confirm('DANGER: This will delete ALL data including users, bets, rounds, and price history. Are you absolutely sure?')) {
      return
    }

    if (!confirm('Final confirmation: This action CANNOT be undone. Continue?')) {
      return
    }

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
    if (!confirm('This will delete all completed rounds older than 24 hours. Continue?')) {
      return
    }

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

    const { data: newRound } = await supabase
      .from('rounds')
      .insert({
        round_number: newRoundNumber,
        start_price: startPrice,
        start_time: new Date().toISOString(),
        status: 'active',
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
    <>
      {/* Start New Game Dialog */}
      <Dialog open={showStartDialog} onOpenChange={setShowStartDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Start New Game Session</DialogTitle>
            <DialogDescription>
              Configure your game settings. This will reset all game data and start from Round 1.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Round Duration (seconds)</label>
                <Input 
                  type="number" 
                  value={newGameConfig.roundDuration} 
                  onChange={(e) => setNewGameConfig({...newGameConfig, roundDuration: parseInt(e.target.value) || 15})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Price Update Interval (seconds)</label>
                <Input 
                  type="number" 
                  value={newGameConfig.priceUpdateInterval} 
                  onChange={(e) => setNewGameConfig({...newGameConfig, priceUpdateInterval: parseInt(e.target.value) || 1})}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Win Rate (%)</label>
                <Input 
                  type="number" 
                  value={newGameConfig.winRate} 
                  onChange={(e) => setNewGameConfig({...newGameConfig, winRate: parseInt(e.target.value) || 95})}
                />
                <p className="text-xs text-muted-foreground">Winners get bet × (1 + rate/100)</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Default Balance ($)</label>
                <Input 
                  type="number" 
                  value={newGameConfig.defaultUserBalance} 
                  onChange={(e) => setNewGameConfig({...newGameConfig, defaultUserBalance: parseInt(e.target.value) || 10000})}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Min Bet ($)</label>
                <Input 
                  type="number" 
                  value={newGameConfig.minBetAmount} 
                  onChange={(e) => setNewGameConfig({...newGameConfig, minBetAmount: parseInt(e.target.value) || 10})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Max Bet ($)</label>
                <Input 
                  type="number" 
                  value={newGameConfig.maxBetAmount} 
                  onChange={(e) => setNewGameConfig({...newGameConfig, maxBetAmount: parseInt(e.target.value) || 50000})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">No Bet Penalty ($)</label>
                <Input 
                  type="number" 
                  value={newGameConfig.noBetPenalty} 
                  onChange={(e) => setNewGameConfig({...newGameConfig, noBetPenalty: parseInt(e.target.value) || 0})}
                />
              </div>
            </div>

            <Alert variant="destructive" className="mt-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Warning:</strong> Starting a new game will reset all user balances and delete all bets, rounds, and price history. Users will remain registered.
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStartDialog(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button 
              onClick={startNewGameSession} 
              disabled={isSaving}
              className="bg-gradient-to-r from-primary to-emerald-600 hover:from-primary/90 hover:to-emerald-600/90"
            >
              {isSaving ? 'Starting...' : 'Start New Game'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    <div className="flex h-screen bg-muted/40 text-foreground">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-10 hidden w-64 flex-col border-r bg-background sm:flex">
        <div className="flex h-14 items-center border-b px-6 lg:h-[60px]">
          <a className="flex items-center gap-2 font-semibold" href="#">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#f59e0b] via-[#d97706] to-[#b45309] flex items-center justify-center text-white shadow-lg glow-gold">
              <Settings size={20} />
            </div>
            <span className="">Admin Panel</span>
          </a>
        </div>
        <nav className="grid gap-1 px-2 py-4 text-sm font-medium">
          <Button 
            variant={activeView === 'dashboard' ? 'secondary' : 'ghost'} 
            className="justify-start gap-2"
            onClick={() => setActiveView('dashboard')}
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Button>
          <Button 
            variant={activeView === 'users' ? 'secondary' : 'ghost'} 
            className="justify-start gap-2"
            onClick={() => setActiveView('users')}
          >
            <Users className="h-4 w-4" />
            Users
          </Button>
          <Button 
            variant={activeView === 'settings' ? 'secondary' : 'ghost'} 
            className="justify-start gap-2"
            onClick={() => setActiveView('settings')}
          >
            <Settings className="h-4 w-4" />
            Settings
          </Button>
          <Button 
            variant={activeView === 'data' ? 'secondary' : 'ghost'} 
            className="justify-start gap-2"
            onClick={() => setActiveView('data')}
          >
            <Database className="h-4 w-4" />
            Data
          </Button>
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex flex-col sm:gap-4 sm:py-4 sm:pl-64 w-full h-full">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6">
          <div className="flex items-center gap-4">
             {/* Mobile menu trigger could go here */}
             <h1 className="text-xl font-semibold capitalize">{activeView}</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {isWaitingForConfig && (
              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 gap-1.5">
                <Clock size={14} />
                Waiting for Config
              </Badge>
            )}
            {isGameRunning && (
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 gap-1.5 hidden sm:flex">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </span>
                Broadcasting Live
              </Badge>
            )}
            <Button
              onClick={prepareForNewGame}
              size="sm"
              className="bg-gradient-to-r from-primary to-emerald-600 hover:from-primary/90 hover:to-emerald-600/90"
            >
              <Play size={16} className="mr-2" />
              Start New Game
            </Button>
            {currentRound && (
              <>
                {isGameRunning ? (
                  <Button
                    onClick={() => setIsGameRunning(false)}
                    size="sm"
                    variant="outline"
                  >
                    <Pause size={16} className="mr-2" />
                    Pause Game
                  </Button>
                ) : (
                  <Button
                    onClick={() => setIsGameRunning(true)}
                    size="sm"
                    variant="outline"
                  >
                    <Play size={16} className="mr-2" />
                    Resume Game
                  </Button>
                )}
                <Button
                  onClick={deleteCurrentGame}
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:bg-destructive/10"
                >
                  <Trash2 size={16} className="mr-2" />
                  Delete Game
                </Button>
              </>
            )}
          </div>
        </header>
        
        <main className="grid flex-1 items-start gap-4 p-4 sm:px-6 sm:py-0 md:gap-8 overflow-auto">
          
          {/* Dashboard View */}
          {activeView === 'dashboard' && (
            <div className="space-y-6">
              {/* Warning Banner */}
              <Alert className="bg-amber-500/10 border-amber-500/50 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4 stroke-amber-600 dark:stroke-amber-400" />
                 <AlertDescription className="ml-2 font-medium">
                  Keep this page open to maintain game broadcast. Closing it will stop the game.
                </AlertDescription>
              </Alert>

              {/* No Active Game State */}
              {!currentRound && !isGameRunning && !isWaitingForConfig && (
                <Card className="bg-muted/30 border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <div className="rounded-full bg-muted p-4 mb-4">
                      <Clock className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2">No Active Game</h3>
                    <p className="text-muted-foreground text-center mb-4">
                      Click "Start New Game" to begin a new game session
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Stats Grid - Only show when there's an active game */}
              {currentRound && (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Rounds</CardTitle>
                    <RefreshCw className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.totalRounds}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Active Players</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.activePlayers}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Bets</CardTitle>
                    <Database className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.totalBets}</div>
                  </CardContent>
                </Card>
                <Card>
                   <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Current Price</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">${currentPrice.toFixed(2)}</div>
                    <p className="text-xs text-muted-foreground">
                      {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}
                    </p>
                  </CardContent>
                </Card>
              </div>
              )}

               {/* Current Round Card */}
              {currentRound && (
                <Card className="bg-gradient-to-br from-primary/5 via-transparent to-transparent border-primary/20">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <RefreshCw className="h-5 w-5 animate-spin text-primary" />
                         Current Round #{currentRound.round_number}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="bg-background/50 p-4 rounded-xl border">
                         <div className="text-sm font-medium text-muted-foreground mb-1">Status</div>
                         <div className="text-xl font-bold uppercase text-primary">Active</div>
                      </div>
                      <div className="bg-background/50 p-4 rounded-xl border">
                        <div className="text-sm font-medium text-muted-foreground mb-1">Start Price</div>
                         <div className="text-xl font-bold">${currentRound.start_price.toFixed(2)}</div>
                      </div>
                      <div className="bg-background/50 p-4 rounded-xl border">
                        <div className="text-sm font-medium text-muted-foreground mb-1">Time Remaining</div>
                         <div className={`text-xl font-bold ${countdown <= 5 ? 'text-destructive animate-pulse' : ''}`}>
                          {countdown}s
                         </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Game Status Section */}
              {isGameRunning && (
                <Card className="border-primary/20">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <RefreshCw className="h-5 w-5 animate-spin text-primary" />
                      Auto Mode Active
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-muted/30 p-4 rounded-lg">
                        <div className="text-sm text-muted-foreground mb-1">Price Updates</div>
                        <div className="font-semibold">Every {priceUpdateInterval}s</div>
                      </div>
                      <div className="bg-muted/30 p-4 rounded-lg">
                        <div className="text-sm text-muted-foreground mb-1">Win Rate</div>
                        <div className="font-semibold">{winRate*100}%</div>
                      </div>
                      <div className="bg-muted/30 p-4 rounded-lg">
                        <div className="text-sm text-muted-foreground mb-1">Bet Range</div>
                        <div className="font-semibold">${minBetAmount} - ${maxBetAmount}</div>
                      </div>
                      <div className="bg-muted/30 p-4 rounded-lg">
                        <div className="text-sm text-muted-foreground mb-1">No Bet Penalty</div>
                        <div className="font-semibold">${noBetPenalty}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Users View */}
          {activeView === 'users' && (
             <Card>
              <CardHeader>
                <CardTitle>User Management</CardTitle>
                <CardDescription>Manage your registered users and their balances.</CardDescription>
              </CardHeader>
              <CardContent>
                 <ScrollArea className="h-[600px] pr-4">
                   <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Balance</TableHead>
                        <TableHead>ID / Fingerprint</TableHead>
                        <TableHead>Joined</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                       {users.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell className="font-medium">{user.name}</TableCell>
                           <TableCell>
                            {editingUser === user.id ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  value={editBalance}
                                  onChange={(e) => setEditBalance(parseFloat(e.target.value))}
                                  className="w-24 h-8"
                                />
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => updateUserBalance(user.id, editBalance)}>
                                  <TrendingUp className="h-4 w-4" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" onClick={() => setEditingUser(null)}>
                                  <LogOut className="h-4 w-4 rotate-180" />
                                </Button>
                              </div>
                            ) : (
                               <span className="font-mono">${user.balance.toFixed(2)}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs font-mono">{user.fingerprint.substring(0, 12)}...</TableCell>
                          <TableCell className="text-muted-foreground text-xs">{new Date(user.created_at).toLocaleDateString()}</TableCell>
                          <TableCell className="text-right">
                             {editingUser !== user.id && (
                                <div className="flex justify-end gap-2">
                                  <Button variant="outline" size="sm" onClick={() => { setEditingUser(user.id); setEditBalance(user.balance); }}>Edit</Button>
                                  <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => deleteUser(user.id)}>Delete</Button>
                                </div>
                             )}
                          </TableCell>
                        </TableRow>
                       ))}
                    </TableBody>
                   </Table>
                 </ScrollArea>
              </CardContent>
             </Card>
          )}

          {/* Settings View */}
          {activeView === 'settings' && (
            <div className="max-w-4xl space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Game Configuration</CardTitle>
                  <CardDescription>Adjust the core mechanics of the game rounds.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-6">
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Round Duration (s)</label>
                        <Input type="number" value={roundDuration} onChange={(e) => { setRoundDuration(parseInt(e.target.value)||15); setHasUnsavedChanges(true); }} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Price Update Interval (s)</label>
                        <Input type="number" value={priceUpdateInterval} onChange={(e) => { setPriceUpdateInterval(parseInt(e.target.value)||1); setHasUnsavedChanges(true); }} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Win Rate</label>
                         <Input type="number" value={(winRate * 100).toFixed(0)} onChange={(e) => { setWinRate(parseFloat(e.target.value)/100 || 0.95); setHasUnsavedChanges(true); }} />
                         <p className="text-xs text-muted-foreground">Payout multiplier (e.g. 95 = 1.95x)</p>
                      </div>
                   </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Financial Limits</CardTitle>
                  <CardDescription>Set limits for betting and balances.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                       <div className="space-y-2">
                          <label className="text-sm font-medium">Default Balance ($)</label>
                          <Input type="number" value={defaultUserBalance} onChange={(e) => { setDefaultUserBalance(parseFloat(e.target.value)||10000); setHasUnsavedChanges(true); }} />
                       </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">No Bet Penalty ($)</label>
                          <Input type="number" value={noBetPenalty} onChange={(e) => { setNoBetPenalty(parseFloat(e.target.value)||0); setHasUnsavedChanges(true); }} />
                       </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Min Bet ($)</label>
                          <Input type="number" value={minBetAmount} onChange={(e) => { setMinBetAmount(parseFloat(e.target.value)||10); setHasUnsavedChanges(true); }} />
                       </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Max Bet ($)</label>
                          <Input type="number" value={maxBetAmount} onChange={(e) => { setMaxBetAmount(parseFloat(e.target.value)||50000); setHasUnsavedChanges(true); }} />
                       </div>
                    </div>
                </CardContent>
                <div className="p-6 border-t bg-muted/20">
                    <Button onClick={saveSettings} disabled={!hasUnsavedChanges || isSaving} size="lg" className="w-full sm:w-auto">
                      {isSaving ? 'Saving...' : 'Save Configuration'}
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2">Settings will apply to new rounds. To reset and start fresh, use "Start New Game".</p>
                </div>
              </Card>
            </div>
          )}

          {/* Data View */}
          {activeView === 'data' && (
            <div className="max-w-4xl space-y-6">
               <Card>
                 <CardHeader>
                   <CardTitle>Database Maintenance</CardTitle>
                   <CardDescription>Clean up old data to keep the system running smoothly.</CardDescription>
                 </CardHeader>
                 <CardContent className="grid gap-4">
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <div className="font-semibold">Clear Price History</div>
                        <div className="text-sm text-muted-foreground">Removes all price records except the latest ones.</div>
                      </div>
                       <Button variant="outline" onClick={cleanPriceHistory}>Clear</Button>
                    </div>
                     <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <div className="font-semibold">Clear Old Rounds</div>
                        <div className="text-sm text-muted-foreground">Removes completed rounds older than 24 hours.</div>
                      </div>
                       <Button variant="outline" onClick={cleanOldRounds}>Clear</Button>
                    </div>
                 </CardContent>
               </Card>

               <Card className="border-destructive/50">
                 <CardHeader>
                   <CardTitle className="text-destructive">Danger Zone</CardTitle>
                 </CardHeader>
                 <CardContent>
                    <div className="space-y-4">
                       <Alert variant="destructive">
                         <AlertTriangle className="h-4 w-4" />
                         <AlertDescription>
                           This action will wipe ALL data including users, bets, and settings. This cannot be undone.
                         </AlertDescription>
                       </Alert>
                       <Button variant="destructive" onClick={resetAllData}>Reset Entire System</Button>
                    </div>
                 </CardContent>
               </Card>
            </div>
          )}

        </main>
      </div>
    </div>
    </>
  )
}

