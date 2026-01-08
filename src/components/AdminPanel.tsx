import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { Play, Pause, TrendingUp, TrendingDown, RefreshCw, Settings, Users, Database, AlertTriangle, LayoutDashboard, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'

export default function AdminPanel() {
  const [currentPrice, setCurrentPrice] = useState(2000)
  const [priceChange, setPriceChange] = useState(0)
  const [isAutoMode, setIsAutoMode] = useState(true)
  const [currentRound, setCurrentRound] = useState<any>(null)
  const [countdown, setCountdown] = useState(15)
  
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

  console.log('🆔 Admin session ID:', adminSessionId.current)

  useEffect(() => {
    // Prevent double initialization (React StrictMode)
    if (isInitialized.current) {
      console.log('⚠️ AdminPanel already initialized, skipping')
      return
    }
    isInitialized.current = true
    
    console.log('🔄 AdminPanel initializing...')
    
    const initialize = async () => {
      // Setup broadcast channel
      console.log('📡 Setting up broadcast channel...')
      broadcastChannel.current = supabase.channel('game-state')
      await broadcastChannel.current.subscribe()
      
      await loadSettings()
      await loadCurrentPrice()
      await loadCurrentRound()
      await loadStats()
      await loadUsers()
      
      // Auto-start first round if none exists
      const { data: activeRound } = await supabase
        .from('rounds')
        .select('*')
        .eq('status', 'active')
        .single()
      
      if (!activeRound) {
        console.log('No active round, starting first round...')
        await startNewRound(currentPrice)
      }
      // Note: Don't call startCountdownTimer here - loadCurrentRound already handles it
      
      console.log('✅ AdminPanel initialization complete')
    }
    
    initialize()

    return () => {
      console.log('🧹 AdminPanel unmounting, cleaning up...')
      if (countdownInterval.current) {
        console.log('🧹 Clearing countdown interval on unmount')
        clearInterval(countdownInterval.current)
      }
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

  // Effect to handle auto mode changes - pause/resume countdown
  useEffect(() => {
    if (!isAutoMode) {
      // Pause countdown when auto mode is OFF
      if (countdownInterval.current) {
        console.log('⏸️ Auto mode OFF - Pausing countdown at:', countdown)
        pausedCountdown.current = countdown
        pausedRound.current = currentRound
        clearInterval(countdownInterval.current)
        countdownInterval.current = null
        countdownTimerId.current = null
      }
    } else {
      // Resume countdown when auto mode is ON
      if (pausedCountdown.current !== null && pausedRound.current) {
        console.log('▶️ Auto mode ON - Resuming countdown from:', pausedCountdown.current)
        const round = pausedRound.current
        const remainingTime = pausedCountdown.current
        pausedCountdown.current = null
        pausedRound.current = null
        
        // Resume countdown with remaining time
        resumeCountdownTimer(round, remainingTime)
      } else if (currentRound && !countdownInterval.current) {
        // If there's a current round but no timer running, start fresh
        console.log('▶️ Auto mode ON - Starting fresh countdown for current round')
        startCountdownTimer(currentRound)
      }
    }
  }, [isAutoMode])

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>

    if (isAutoMode) {
      interval = setInterval(() => {
        handleAutoUpdatePrice()
      }, priceUpdateInterval * 1000) // Sử dụng priceUpdateInterval
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [isAutoMode, currentPrice, priceUpdateInterval])

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
      console.error('Error loading settings:', error)
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
      toast.success('✅ Đã lưu cấu hình thành công!')
    } catch (error) {
      console.error('Error saving settings:', error)
      toast.error('❌ Lỗi khi lưu cấu hình!')
    } finally {
      setIsSaving(false)
    }
  }

  const applySettings = async () => {
    if (!confirm('Áp dụng cấu hình mới sẽ kết thúc vòng hiện tại và bắt đầu vòng mới. Bạn có chắc chắn?')) {
      return
    }

    setIsSaving(true)
    try {
      // Save settings first
      await saveSettings()

      // Complete current round if exists
      if (currentRound) {
        await completeRound(currentRound)
      }

      // Settings will be applied automatically on next round
      toast.success('✅ Đã áp dụng cấu hình! Vòng mới sẽ bắt đầu với cấu hình mới.')
    } catch (error) {
      console.error('Error applying settings:', error)
      toast.error('❌ Lỗi khi áp dụng cấu hình!')
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
        console.warn('⚠️ Invalid price detected:', data.price, '- Resetting to 2000')
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
      console.log('No price data, creating initial price...')
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
      console.log('🧹 Clearing existing countdown interval:', countdownTimerId.current)
      clearInterval(countdownInterval.current)
      countdownInterval.current = null
      countdownTimerId.current = null
    }
    
    countdownTimerId.current = timerId
    
    // Calculate new start time based on remaining seconds
    const fixedDuration = roundDuration
    const startTime = Date.now() - ((fixedDuration - remainingSeconds) * 1000)
    
    console.log('▶️ Resuming countdown timer:', timerId, 'for round:', round.round_number, 'from:', remainingSeconds, 'seconds')
    
    const updateCountdown = () => {
      // Check if this timer is still the active one
      if (countdownTimerId.current !== timerId) {
        console.log('⚠️ Timer', timerId, 'is stale, stopping')
        return
      }
      
      const now = Date.now()
      const elapsed = Math.floor((now - startTime) / 1000)
      const remaining = Math.max(0, fixedDuration - elapsed)
      
      setCountdown(remaining)
      console.log('📡 [' + adminSessionId.current.slice(-6) + '] Broadcasting countdown:', remaining)
      
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
        console.log('⏹️ Timer', timerId, 'completed, clearing interval')
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
      console.log('🧹 Clearing existing countdown interval:', countdownTimerId.current)
      clearInterval(countdownInterval.current)
      countdownInterval.current = null
      countdownTimerId.current = null
    }
    
    countdownTimerId.current = timerId
    
    const startTime = new Date(round.start_time).getTime()
    // Capture the duration at the start of the round - don't use reactive state
    const fixedDuration = roundDuration
    
    console.log('🚀 Starting countdown timer:', timerId, 'for round:', round.round_number, 'duration:', fixedDuration)
    
    const updateCountdown = () => {
      // Check if this timer is still the active one
      if (countdownTimerId.current !== timerId) {
        console.log('⚠️ Timer', timerId, 'is stale, stopping')
        return
      }
      
      const now = Date.now()
      const elapsed = Math.floor((now - startTime) / 1000)
      const remaining = Math.max(0, fixedDuration - elapsed)
      
      setCountdown(remaining)
      console.log('📡 [' + adminSessionId.current.slice(-6) + '] Broadcasting countdown:', remaining)
      
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
        console.log('⏹️ Timer', timerId, 'completed, clearing interval')
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
    
    if (data) {
      startCountdownTimer(data)
    }
  }

  const loadStats = async () => {
    const { count: roundCount } = await supabase
      .from('rounds')
      .select('*', { count: 'exact', head: true })

    const { count: betCount } = await supabase
      .from('bets')
      .select('*', { count: 'exact', head: true })

    const { count: userCount } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })

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
      console.error('Error updating user balance:', error)
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
      console.error('Error deleting user:', error)
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
      console.error('Error cleaning price history:', error)
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
      console.error('Error resetting data:', error)
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
      console.error('Error cleaning old rounds:', error)
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
        console.warn('⚠️ Invalid end price:', endPrice, '- Using 2000 instead')
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
            
            console.log(`💸 Applied penalty of $${noBetPenalty} to user ${user.name} for not betting`)
          }

          if (usersWithoutBets.length > 0) {
            console.log(`💸 Penalized ${usersWithoutBets.length} users who didn't bet`)
            toast.info(`💸 Penalized ${usersWithoutBets.length} users ($${noBetPenalty} each) for not betting`)
          }
        }
      }

      // Start new round
      await startNewRound(endPrice)
    } catch (error) {
      console.error('Error completing round:', error)
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
      console.warn('⚠️ Invalid price in ref:', latestPrice, '- Resetting to 2000')
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
      console.error('Error updating price:', error)
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
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 gap-1.5 hidden sm:flex">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              Broadcasting Live
            </Badge>
            <Button
              onClick={() => setIsAutoMode(!isAutoMode)}
              size="sm"
              variant={isAutoMode ? "default" : "outline"}
              className={`${
                isAutoMode 
                  ? 'bg-gradient-to-r from-primary to-emerald-600 hover:from-primary/90 hover:to-emerald-600/90' 
                  : ''
              }`}
            >
              {isAutoMode ? <Play size={16} className="mr-2" /> : <Pause size={16} className="mr-2" />}
              {isAutoMode ? 'Auto: ON' : 'Auto: OFF'}
            </Button>
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

              {/* Stats Grid */}
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

              {/* Price Control Section */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                  <Card className="col-span-4">
                    <CardHeader>
                      <CardTitle>Price Control</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {isAutoMode ? (
                        <div className="flex flex-col items-center justify-center p-8 text-center space-y-4 bg-muted/30 rounded-lg border-2 border-dashed">
                          <RefreshCw className="h-10 w-10 animate-spin text-primary" />
                          <div>
                            <h3 className="font-semibold">Auto Mode Enabled</h3>
                            <p className="text-sm text-muted-foreground">Price updates automatically every {priceUpdateInterval} seconds</p>
                          </div>
                          <Button variant="outline" onClick={() => setIsAutoMode(false)}>Switch to Manual</Button>
                        </div>
                      ) : (
                        <div className="space-y-6">
                          <div className="flex gap-4">
                             <Button 
                               onClick={handlePriceIncrease}
                               className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white h-24 text-lg font-bold"
                             >
                                <TrendingUp className="mr-2 h-6 w-6" /> UP
                             </Button>
                             <Button 
                               onClick={handlePriceDecrease}
                               className="flex-1 bg-rose-500 hover:bg-rose-600 text-white h-24 text-lg font-bold"
                             >
                                <TrendingDown className="mr-2 h-6 w-6" /> DOWN
                             </Button>
                          </div>
                           <div className="grid gap-4">
                              <div className="grid gap-2">
                                <label className="text-sm font-medium">Manual Price Set</label>
                                <div className="flex gap-2">
                                  <Input 
                                    type="number" 
                                    value={currentPrice} 
                                    onChange={(e) => setCurrentPrice(parseFloat(e.target.value))}
                                  />
                                   <Button onClick={handleManualUpdate}>Update</Button>
                                </div>
                              </div>
                           </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                   <Card className="col-span-3">
                     <CardHeader>
                       <CardTitle>Live Feed</CardTitle>
                     </CardHeader>
                     <CardContent>
                        <ul className="space-y-2 text-sm">
                           <li>• Round Duration: <span className="font-mono bg-muted px-1 rounded">{roundDuration}s</span></li>
                           <li>• Win Rate: <span className="font-mono bg-muted px-1 rounded">{winRate*100}%</span></li>
                           <li>• Min Bet: <span className="font-mono bg-muted px-1 rounded">${minBetAmount}</span></li>
                           <li>• Max Bet: <span className="font-mono bg-muted px-1 rounded">${maxBetAmount}</span></li>
                        </ul>
                     </CardContent>
                   </Card>
              </div>
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
                    <Button onClick={applySettings} disabled={!hasUnsavedChanges || isSaving} size="lg" className="w-full sm:w-auto">
                      {isSaving ? 'Saving...' : 'Save Configuration'}
                    </Button>
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
  )
}

