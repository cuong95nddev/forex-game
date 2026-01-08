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
    noBetPenalty: 0,
    maxRound: null as number | null
  })
  
  // Settings
  const [roundDuration, setRoundDuration] = useState(15) // seconds
  const [priceUpdateInterval, setPriceUpdateInterval] = useState(1) // seconds
  const [winRate, setWinRate] = useState(0.95) // 95% profit (0.95 = 95%)
  const [defaultUserBalance, setDefaultUserBalance] = useState(10000)
  const [minBetAmount, setMinBetAmount] = useState(10)
  const [maxBetAmount, setMaxBetAmount] = useState(50000)
  const [noBetPenalty, setNoBetPenalty] = useState(0)
  const [maxRound, setMaxRound] = useState<number | null>(null)
  const [gameStatus, setGameStatus] = useState<'running' | 'completed'>('running')
  const [settingsId, setSettingsId] = useState<string | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showLeaderboardDialog, setShowLeaderboardDialog] = useState(false)
  const [leaderboard, setLeaderboard] = useState<any[]>([])
  
  const [stats, setStats] = useState({
    totalRounds: 0,
    activePlayers: 0,
    totalBets: 0,
  })
  
  // User management
  const [users, setUsers] = useState<any[]>([])
  const [currentBets, setCurrentBets] = useState<any[]>([])
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
  const betsSubscription = useRef<any>(null)
  const usersSubscription = useRef<any>(null)

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
      await loadCurrentBets()
      
      // Initialize admin presence
      await initializeAdminPresence()
      
      // Setup real-time subscriptions
      setupRealtimeSubscriptions()
    }
    
    initialize()

    return () => {
      if (countdownInterval.current) {
        clearInterval(countdownInterval.current)
      }
      if (presenceHeartbeatInterval.current) {
        clearInterval(presenceHeartbeatInterval.current)
      }
      // Clean up subscriptions
      if (betsSubscription.current) {
        betsSubscription.current.unsubscribe()
      }
      if (usersSubscription.current) {
        usersSubscription.current.unsubscribe()
      }
      // Clean up presence on unmount
      cleanupAdminPresence()
      if (broadcastChannel.current) broadcastChannel.current.unsubscribe()
      isInitialized.current = false
    }
  }, []) // Empty dependency array - only run once on mount
  
  // Separate effect for stats polling (bets and users update via real-time subscriptions)
  useEffect(() => {
    const statsInterval = setInterval(() => {
      loadStats()
    }, 5000)
    
    return () => clearInterval(statsInterval)
  }, [])

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
        setMaxRound(data.max_round || null)
        setGameStatus(data.game_status || 'running')
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
          max_round: maxRound,
          game_status: gameStatus,
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

      // Set waiting state and clear leaderboard
      setIsWaitingForConfig(true)
      setShowLeaderboardDialog(false)
      setLeaderboard([])
      setGameStatus('running')
      
      // Broadcast waiting state to all clients (clears game completed state)
      if (broadcastChannel.current) {
        broadcastChannel.current.send({
          type: 'broadcast',
          event: 'game-state',
          payload: {
            adminSessionId: adminSessionId.current,
            isWaiting: true,
            currentRound: null,
            countdown: 0
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
            max_round: newGameConfig.maxRound,
            game_status: 'running',
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
      setShowLeaderboardDialog(false)
      setLeaderboard([])
      setGameStatus('running')
      
      // Initialize with fresh price
      await supabase.from('gold_prices').insert({ price: 2000, change: 0 })
      
      // Start first round
      await startNewRound(2000)
      
      // Broadcast game started (clear waiting state and completed state)
      if (broadcastChannel.current) {
        broadcastChannel.current.send({
          type: 'broadcast',
          event: 'game-started',
          payload: {
            adminSessionId: adminSessionId.current,
            isWaiting: false,
            isGameCompleted: false
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

    if (data) {
      setCurrentRound(data)
      setIsGameRunning(true) // Resume game running state if there's an active round
      // Load bets after confirming there's a round
      await loadCurrentBets()
    }
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

  const setupRealtimeSubscriptions = () => {
    console.log('Setting up real-time subscriptions for admin...')
    
    // Subscribe to bet changes
    betsSubscription.current = supabase
      .channel('admin-bets-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bets',
        },
        (payload) => {
          console.log('Bet change detected:', payload)
          loadCurrentBets()
        }
      )
      .subscribe((status) => {
        console.log('Bets subscription status:', status)
      })

    // Subscribe to user changes (balance updates)
    usersSubscription.current = supabase
      .channel('admin-users-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
        },
        (payload) => {
          console.log('User change detected:', payload)
          loadUsers()
        }
      )
      .subscribe((status) => {
        console.log('Users subscription status:', status)
      })
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

  const loadCurrentBets = async () => {
    try {
      // Load recent bets from last 50 bets across all rounds
      const { data } = await supabase
        .from('bets')
        .select('*, users(name)')
        .order('created_at', { ascending: false })
        .limit(50)
      
      if (data) {
        setCurrentBets(data)
      }
    } catch (error) {
      console.error('Failed to load bets:', error)
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
      // Stop the game first
      setIsGameRunning(false)
      setIsWaitingForConfig(false)
      
      // Stop countdown
      if (countdownInterval.current) {
        clearInterval(countdownInterval.current)
        countdownInterval.current = null
        countdownTimerId.current = null
      }

      // Broadcast to users that system is being reset (force logout)
      if (broadcastChannel.current) {
        broadcastChannel.current.send({
          type: 'broadcast',
          event: 'system-reset',
          payload: {
            adminSessionId: adminSessionId.current,
            message: 'System has been reset. Please refresh and login again.'
          }
        })
      }

      // Delete all data in order
      await supabase.from('bets').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('rounds').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('gold_prices').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('users').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      
      // Reset all state variables
      setCurrentPrice(2000)
      setPriceChange(0)
      currentPriceRef.current = 2000
      priceChangeRef.current = 0
      lastTrendRef.current = 0
      setCurrentRound(null)
      setCountdown(roundDuration)
      pausedCountdown.current = null
      pausedRound.current = null
      
      // Reinitialize
      await supabase.from('gold_prices').insert({ price: 2000, change: 0 })
      await loadStats()
      await loadUsers()
      
      toast.success('All data has been reset successfully. The game has been stopped.')
    } catch (error) {
      console.error('Failed to reset data:', error)
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
      console.log('⏰ Completing round:', { 
        roundNumber: round.round_number, 
        maxRound: maxRound,
        willEndGame: maxRound && round.round_number >= maxRound 
      })
      
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
          const baseProfit = userWon ? bet.bet_amount * winRate : 0

          // Use the resolve_bet_with_skills function
          const { data: resolutionData, error: resolutionError } = await supabase.rpc('resolve_bet_with_skills', {
            p_bet_id: bet.id,
            p_result: result,
            p_base_profit: baseProfit
          })

          if (resolutionError) {
            console.error('Error resolving bet with skills:', resolutionError)
            // Fallback to old method
            await supabase
              .from('bets')
              .update({ result, profit: baseProfit })
              .eq('id', bet.id)

            if (userWon) {
              const balanceChange = bet.bet_amount + baseProfit
              const newBalance = bet.users.balance + balanceChange
              await supabase
                .from('users')
                .update({ balance: newBalance })
                .eq('id', bet.user_id)
            }
          } else if (resolutionData?.had_double && userWon) {
            console.log(`User ${bet.user_id} had double skill active! Profit: ${resolutionData.final_profit}`)
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

      // Check if we've reached max round
      if (maxRound && round.round_number >= maxRound) {
        // Game completed! Show leaderboard
        console.log('🏁 Max round reached! Ending game...', { maxRound, currentRound: round.round_number })
        toast.info(`🏁 Max round ${maxRound} reached! Calculating final results...`)
        await endGame()
      } else {
        // Start new round
        await startNewRound(endPrice)
      }
    } catch (error) {
      console.error('Error completing round:', error)
    }
  }

  const endGame = async () => {
    try {
      console.log('🏆 Ending game and generating leaderboard...')
      
      // Stop the game
      setIsGameRunning(false)
      if (countdownInterval.current) {
        clearInterval(countdownInterval.current)
        countdownInterval.current = null
        countdownTimerId.current = null
      }

      // Update game status to completed
      if (settingsId) {
        await supabase
          .from('game_settings')
          .update({
            game_status: 'completed',
            updated_at: new Date().toISOString()
          })
          .eq('id', settingsId)
        
        setGameStatus('completed')
      }

      // Wait a moment for all database updates to complete
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // Reload users to get final updated balances (after all bets and penalties processed)
      const { data: users } = await supabase
        .from('users')
        .select('*')
        .order('balance', { ascending: false })

      console.log('📊 Leaderboard data:', users)

      if (users && users.length > 0) {
        setLeaderboard(users)
        
        // Clear current round
        setCurrentRound(null)
        setCountdown(0)

        // Broadcast game completed to all clients
        if (broadcastChannel.current) {
          console.log('📡 Broadcasting game-completed event', { leaderboard: users, maxRound })
          broadcastChannel.current.send({
            type: 'broadcast',
            event: 'game-completed',
            payload: {
              adminSessionId: adminSessionId.current,
              leaderboard: users,
              maxRound: maxRound
            }
          })
        }

        // Reload stats and users
        await loadStats()
        await loadUsers()

        // Show leaderboard dialog
        setShowLeaderboardDialog(true)
        toast.success(`🏆 Game completed after ${maxRound} rounds! Check the leaderboard.`)
      } else {
        toast.error('❌ No users found for leaderboard!')
      }
    } catch (error) {
      console.error('Error ending game:', error)
      toast.error('❌ Failed to end game!')
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
      // Keep bets - they will accumulate across rounds
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
      {/* Leaderboard Dialog */}
      <Dialog open={showLeaderboardDialog} onOpenChange={setShowLeaderboardDialog}>
        <DialogContent className="max-w-4xl bg-[#131722] border-[#2a2e39] text-white shadow-2xl">
          <DialogHeader className="border-b border-[#2a2e39] pb-4">
            <DialogTitle className="text-xl font-semibold text-white flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#f7931a] to-[#f59e0b] flex items-center justify-center shadow-lg">
                <span className="text-2xl">🏆</span>
              </div>
              <div>
                <div className="text-xl font-bold tracking-tight">Game Completed</div>
                <div className="text-sm font-normal text-[#787b86] mt-0.5">Final Standings After {maxRound} Rounds</div>
              </div>
            </DialogTitle>
          </DialogHeader>
          
          <ScrollArea className="max-h-[520px]">
            <div className="space-y-0 mt-2">
              {/* Header */}
              <div className="grid grid-cols-[60px_1fr_140px] gap-3 px-4 py-2 text-xs font-semibold text-[#787b86] border-b border-[#2a2e39] bg-[#1e222d]">
                <div>RANK</div>
                <div>TRADER</div>
                <div className="text-right">BALANCE</div>
              </div>
              
              {/* Leaderboard Items */}
              {leaderboard.map((user, index) => {
                const rankColors = [
                  { bg: 'bg-gradient-to-r from-[#f7931a]/5 to-transparent', border: 'border-l-[#f7931a]', text: 'text-[#f7931a]', rank: '🥇' },
                  { bg: 'bg-gradient-to-r from-[#c0c0c0]/5 to-transparent', border: 'border-l-[#c0c0c0]', text: 'text-[#c0c0c0]', rank: '🥈' },
                  { bg: 'bg-gradient-to-r from-[#cd7f32]/5 to-transparent', border: 'border-l-[#cd7f32]', text: 'text-[#cd7f32]', rank: '🥉' },
                ]
                const rankStyle = rankColors[index] || { bg: 'bg-[#1e222d]/30', border: 'border-l-[#2a2e39]', text: 'text-[#787b86]', rank: `${index + 1}` }
                
                return (
                  <div 
                    key={user.id} 
                    className={`grid grid-cols-[60px_1fr_140px] gap-3 px-4 py-3 border-l-2 ${rankStyle.border} ${rankStyle.bg} hover:bg-[#1e222d]/50 transition-colors border-b border-[#2a2e39]/50`}
                  >
                    <div className="flex items-center">
                      <div className={`text-lg font-bold ${rankStyle.text} tabular-nums`}>
                        {rankStyle.rank}
                      </div>
                    </div>
                    
                    <div className="flex items-center min-w-0">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-[#d1d4dc] truncate text-sm">{user.name}</div>
                        <div className="text-xs text-[#787b86] truncate font-mono">{user.fingerprint}</div>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-end">
                      <div className="text-right">
                        <div className={`text-base font-bold tabular-nums ${index < 3 ? rankStyle.text : 'text-[#2962ff]'}`}>
                          ${user.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className="text-[10px] text-[#787b86] uppercase tracking-wider mt-0.5">USD</div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </ScrollArea>

          <DialogFooter className="border-t border-[#2a2e39] pt-4 mt-4">
            <Button 
              onClick={() => setShowLeaderboardDialog(false)} 
              className="bg-[#2a2e39] hover:bg-[#363a45] text-[#d1d4dc] border-0 font-medium"
            >
              Close
            </Button>
            <Button 
              onClick={() => {
                setShowLeaderboardDialog(false)
                prepareForNewGame()
              }} 
              className="bg-[#2962ff] hover:bg-[#1e53e5] text-white font-semibold shadow-lg shadow-[#2962ff]/20"
            >
              Start New Game
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">Max Rounds (leave empty for unlimited)</label>
              <Input 
                type="number" 
                className="bg-[#1e293b] border-[#334155] text-white font-mono"
                placeholder="Unlimited"
                value={newGameConfig.maxRound || ''} 
                onChange={(e) => setNewGameConfig({...newGameConfig, maxRound: e.target.value ? parseInt(e.target.value) : null})}
              />
              <p className="text-xs text-[#64748b]">Game will end after this many rounds and show the leaderboard</p>
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

              {/* Compact Stats */}
              {currentRound && (
              <div className="grid gap-3 md:grid-cols-4">
                {[
                  { 
                    label: maxRound ? `Round (of ${maxRound})` : 'Round', 
                    value: `#${currentRound.round_number}`, 
                    sub: maxRound ? `${Math.round((currentRound.round_number / maxRound) * 100)}% complete` : undefined,
                    icon: RefreshCw,
                    color: maxRound && currentRound.round_number >= maxRound ? 'text-[#f59e0b]' : undefined
                  },
                  { label: 'Players', value: stats.activePlayers, icon: Users },
                  { label: 'Bets', value: stats.totalBets, icon: Database },
                  { label: 'Price', value: `$${currentPrice.toFixed(2)}`, sub: `${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}`, icon: TrendingUp, color: priceChange >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]' },
                ].map((stat, i) => (
                  <div key={i} className="bg-[#0b0f13] border border-[#1e293b] p-3 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                       <span className="text-[#94a3b8] text-[9px] uppercase font-bold tracking-wider">{stat.label}</span>
                       <stat.icon size={12} className="text-[#94a3b8]" />
                    </div>
                    <div className={`text-xl font-mono font-bold text-white`}>
                       {stat.value}
                    </div>
                    {stat.sub && (
                       <div className={`text-[10px] font-bold mt-0.5 ${stat.color}`}>{stat.sub}</div>
                    )}
                  </div>
                ))}
              </div>
              )}

               {/* Compact Round Info & Traders */}
              {currentRound && (
                <div className="grid gap-3 md:grid-cols-2">
                  {/* Round Info */}
                  <div className="bg-[#0b0f13] border border-[#1e293b] rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <RefreshCw className="h-3 w-3 animate-spin text-[#f59e0b]" />
                        <h3 className="font-bold text-white text-[10px] uppercase tracking-wider">Round Info</h3>
                      </div>
                      <Badge variant="outline" className="border-[#10b981] text-[#10b981] bg-[#10b981]/10 text-[9px] h-5">ACTIVE</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-[#1e293b]/50 p-2 rounded">
                        <div className="text-[#94a3b8] text-[9px] uppercase font-bold mb-1">Start</div>
                        <div className="text-sm font-mono font-bold text-white">${currentRound.start_price.toFixed(2)}</div>
                      </div>
                      <div className="bg-[#1e293b]/50 p-2 rounded">
                        <div className="text-[#94a3b8] text-[9px] uppercase font-bold mb-1">Current</div>
                        <div className={`text-sm font-mono font-bold ${currentPrice >= currentRound.start_price ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                          ${currentPrice.toFixed(2)}
                        </div>
                      </div>
                      <div className="bg-[#1e293b]/50 p-2 rounded">
                        <div className="text-[#94a3b8] text-[9px] uppercase font-bold mb-1">Time</div>
                        <div className={`text-sm font-mono font-bold flex items-center gap-1 ${countdown <= 5 ? 'text-[#ef4444] animate-pulse' : 'text-[#f59e0b]'}`}>
                          <Clock size={12} />
                          {countdown}s
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Active Traders */}
                  <div className="bg-[#0b0f13] border border-[#1e293b] rounded-lg overflow-hidden">
                    <div className="border-b border-[#1e293b] bg-[#1e293b]/30 px-4 py-2 flex items-center justify-between">
                      <h3 className="font-bold text-white text-[10px] uppercase tracking-wider">Traders</h3>
                      <Badge variant="outline" className="border-[#94a3b8] text-[#94a3b8] text-[9px] h-4 px-1.5">{users.length}</Badge>
                    </div>
                    <div className="px-3 py-2 flex items-center justify-between border-b border-[#1e293b]/50">
                      <div className="text-[#94a3b8] text-[8px] uppercase font-bold">User</div>
                      <div className="text-[#94a3b8] text-[8px] uppercase font-bold">Balance</div>
                    </div>
                    <ScrollArea className="h-[140px]">
                      <div className="px-3 pb-2 space-y-1">
                        {users.slice(0, 10).map((user) => {
                          // Find user's bet in current round only
                          const userBet = currentRound ? currentBets.find(bet => bet.user_id === user.id && bet.round_id === currentRound.id) : null
                          const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 1)
                          return (
                            <div key={user.id} className="flex items-center justify-between py-1.5 hover:bg-[#1e293b]/30 rounded px-2 transition-colors">
                              <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
                                <div className="relative shrink-0">
                                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold ${userBet ? 'bg-[#10b981]' : 'bg-[#334155]'}`}>
                                    {initials}
                                  </div>
                                  <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-[#10b981] rounded-full border-2 border-[#0b0f13]"></div>
                                </div>
                                <span className="text-white text-[11px] font-medium truncate">{user.name}</span>
                              </div>
                              {userBet && (
                                <div className={`flex items-center gap-1 shrink-0 mr-2 ${userBet.prediction === 'up' ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                                  {userBet.prediction === 'up' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                  <span className="text-[10px] font-bold">${userBet.bet_amount}</span>
                                </div>
                              )}
                              <span className="text-[#94a3b8] text-[10px] font-mono">${user.balance?.toLocaleString()}</span>
                            </div>
                          )
                        })}
                      </div>
                    </ScrollArea>
                  </div>
                </div>
              )}

              {/* Market Activity */}
              {isGameRunning && (
                <div className="bg-[#0b0f13] border border-[#1e293b] rounded-lg overflow-hidden">
                  <div className="border-b border-[#1e293b] bg-[#1e293b]/30 px-4 py-2 flex items-center justify-between">
                    <h3 className="font-bold text-white text-[10px] uppercase tracking-wider">Recent Activity</h3>
                    <Badge variant="outline" className="border-[#94a3b8] text-[#94a3b8] text-[8px] h-4 px-1">
                      {currentBets.length} trades
                    </Badge>
                  </div>
                  <ScrollArea className="h-[200px]">
                    <Table>
                      <TableHeader className="bg-[#1e293b]/50 sticky top-0">
                        <TableRow className="border-[#1e293b] hover:bg-transparent">
                          <TableHead className="text-[#94a3b8] text-[9px] uppercase font-bold h-8 py-1">Time</TableHead>
                          <TableHead className="text-[#94a3b8] text-[9px] uppercase font-bold h-8 py-1">Trader</TableHead>
                          <TableHead className="text-[#94a3b8] text-[9px] uppercase font-bold h-8 py-1">Type</TableHead>
                          <TableHead className="text-[#94a3b8] text-[9px] uppercase font-bold h-8 py-1 text-right">Amount</TableHead>
                          <TableHead className="text-[#94a3b8] text-[9px] uppercase font-bold h-8 py-1 text-right">Payout</TableHead>
                          <TableHead className="text-[#94a3b8] text-[9px] uppercase font-bold h-8 py-1 text-right">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {currentBets.map((bet) => {
                          const user = users.find(u => u.id === bet.user_id)
                          const userName = bet.users?.name || user?.name || 'Unknown'
                          const initials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 1)
                          return (
                            <TableRow key={bet.id} className="border-[#1e293b] hover:bg-[#1e293b]/30 h-8">
                              <TableCell className="py-1 text-[10px] font-mono text-[#94a3b8]">
                                {new Date(bet.created_at).toLocaleTimeString()}
                              </TableCell>
                              <TableCell className="py-1">
                                <div className="flex items-center gap-2">
                                  <div className="relative">
                                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center text-white text-[8px] font-bold">
                                      {initials}
                                    </div>
                                    <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-[#10b981] rounded-full border border-[#0b0f13]"></div>
                                  </div>
                                  <span className="text-[10px] text-white font-medium">{userName}</span>
                                </div>
                              </TableCell>
                              <TableCell className="py-1">
                                <span className={`text-[9px] font-bold px-2 py-1 rounded ${bet.prediction === 'up' ? 'bg-[#10b981]/20 text-[#10b981]' : 'bg-[#ef4444]/20 text-[#ef4444]'}`}>
                                  {bet.prediction === 'up' ? 'BUY / UP' : 'SELL / DOWN'}
                                </span>
                              </TableCell>
                              <TableCell className="py-1 text-[10px] font-mono text-right text-white">
                                ${bet.bet_amount.toLocaleString()}
                              </TableCell>
                              <TableCell className="py-1 text-[10px] font-mono font-bold text-right">
                                {bet.result === 'won' && (
                                  <span className="text-[#10b981]">+{bet.profit?.toFixed(0) || '0'}</span>
                                )}
                                {bet.result === 'lost' && (
                                  <span className="text-[#ef4444]">-{bet.bet_amount}</span>
                                )}
                                {bet.result === 'pending' && (
                                  <span className="text-[#94a3b8]">-</span>
                                )}
                              </TableCell>
                              <TableCell className="py-1 text-right">
                                {bet.result === 'won' && (
                                  <span className="text-[9px] font-bold px-2 py-1 rounded border border-[#10b981] text-[#10b981]">
                                    WIN
                                  </span>
                                )}
                                {bet.result === 'lost' && (
                                  <span className="text-[9px] font-bold px-2 py-1 rounded border border-[#ef4444] text-[#ef4444]">
                                    LOSS
                                  </span>
                                )}
                                {bet.result === 'pending' && (
                                  <span className="text-[9px] font-bold px-2 py-1 rounded border border-[#94a3b8] text-[#94a3b8]">
                                    PENDING
                                  </span>
                                )}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                        {currentBets.length === 0 && (
                          <TableRow className="border-[#1e293b]">
                            <TableCell colSpan={4} className="py-4 text-center text-[10px] text-[#94a3b8]">
                              No bets placed yet
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              )}

              {/* Compact Config */}
              {isGameRunning && (
                <div className="bg-[#0b0f13] border border-[#1e293b] rounded-lg p-3">
                  <h3 className="font-bold text-white mb-2 text-[9px] uppercase tracking-widest">Config</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {[
                        { label: 'Update', value: `${priceUpdateInterval}s` },
                        { label: 'Win Rate', value: `${(winRate*100).toFixed(0)}%` },
                        { label: 'Bet Range', value: `$${minBetAmount}-${maxBetAmount}` },
                        { label: 'Penalty', value: `$${noBetPenalty}` },
                      ].map((item, i) => (
                        <div key={i} className="bg-[#1e293b]/50 p-2 rounded border border-[#1e293b]">
                          <div className="text-[#94a3b8] text-[8px] uppercase font-bold mb-0.5">{item.label}</div>
                          <div className="font-mono text-xs text-white">{item.value}</div>
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
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">Max Rounds (empty = unlimited)</label>
                      <Input className="bg-[#1e293b] border-[#334155] text-white" type="number" placeholder="Unlimited" value={maxRound || ''} onChange={(e) => { setMaxRound(e.target.value ? parseInt(e.target.value) : null); setHasUnsavedChanges(true); }} />
                      <p className="text-xs text-[#64748b]">Game ends and shows leaderboard after this many rounds</p>
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

