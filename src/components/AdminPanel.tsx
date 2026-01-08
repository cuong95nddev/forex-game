import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { Play, Pause, TrendingUp, TrendingDown, RefreshCw, Settings, Users, Database, AlertTriangle, DollarSign, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  const [selectedTab, setSelectedTab] = useState<'control' | 'users' | 'data'>('control')
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
      if (selectedTab === 'users') {
        loadUsers()
      }
    }, 3000)
    
    return () => clearInterval(statsInterval)
  }, [selectedTab])

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
    <div className="min-h-screen p-8 bg-background">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Warning Banner */}
        <Alert className="bg-gradient-to-r from-[#f59e0b]/15 to-[#f59e0b]/10 border-2 border-[#f59e0b]/40 shadow-lg">
          <AlertTriangle className="h-6 w-6 text-[#f59e0b]" />
          <AlertDescription className="ml-2">
            <div className="font-extrabold text-[#f59e0b] text-lg">⚠️ QUAN TRỌNG: Giữ trang này mở để game hoạt động!</div>
            <div className="text-sm mt-1.5 text-muted-foreground font-medium">
              Bảng điều khiển đang phát sóng trạng thái game đến tất cả người chơi. Nếu đóng trang này, người chơi sẽ không thể tiếp tục.
            </div>
          </AlertDescription>
        </Alert>

        {/* Header */}
        <Card className="bg-gradient-to-br from-card via-card/95 to-card/90 border-2 border-[#f59e0b]/30 shadow-2xl glow-gold">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-4xl flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#f59e0b] via-[#d97706] to-[#b45309] flex items-center justify-center text-white shadow-2xl glow-gold">
                    <Settings size={36} />
                  </div>
                  <div>
                    <div className="bg-gradient-to-r from-[#f59e0b] to-[#fbbf24] bg-clip-text text-transparent font-extrabold">
                      Admin Control Panel
                    </div>
                    <CardDescription className="mt-1 text-base font-semibold">Quản lý cài đặt game, người dùng và dữ liệu</CardDescription>
                  </div>
                </CardTitle>
              </div>
              <div className="flex items-center gap-4">
                <Badge variant="outline" className="bg-primary/15 text-primary border-primary/40 px-4 py-2.5 shadow-lg">
                  <div className="w-2.5 h-2.5 bg-primary rounded-full animate-pulse mr-2"></div>
                  <span className="font-bold">Broadcasting Live</span>
                </Badge>
                <Button
                  onClick={() => setIsAutoMode(!isAutoMode)}
                  size="lg"
                  className={`font-bold px-6 py-6 shadow-xl border-2 ${
                    isAutoMode 
                      ? 'bg-gradient-to-br from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 border-primary/50 glow-green' 
                      : 'bg-gradient-to-br from-muted to-muted/80 border-border'
                  }`}
                >
                  {isAutoMode ? <Play size={22} className="mr-2" /> : <Pause size={22} className="mr-2" />}
                  {isAutoMode ? 'Chế độ Tự động: BẬT' : 'Chế độ Tự động: TẮT'}
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-6">
          <Card className="bg-gradient-to-br from-card to-card/80 border-2 border-primary/30 shadow-xl hover:shadow-2xl transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-3">
                <CardDescription className="uppercase text-xs tracking-widest font-bold">Tổng Số Vòng</CardDescription>
                <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                  <RefreshCw size={20} className="text-primary" />
                </div>
              </div>
              <div className="text-5xl font-extrabold text-primary drop-shadow-[0_0_10px_rgba(16,185,129,0.3)]">
                {stats.totalRounds}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-card to-card/80 border-2 border-[#f59e0b]/30 shadow-xl hover:shadow-2xl transition-shadow glow-gold">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-3">
                <CardDescription className="uppercase text-xs tracking-widest font-bold">Người Chơi Online</CardDescription>
                <div className="w-10 h-10 rounded-lg bg-[#f59e0b]/20 flex items-center justify-center">
                  <Users size={20} className="text-[#f59e0b]" />
                </div>
              </div>
              <div className="text-5xl font-extrabold bg-gradient-to-r from-[#f59e0b] to-[#fbbf24] bg-clip-text text-transparent">
                {stats.activePlayers}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-card to-card/80 border-2 border-destructive/30 shadow-xl hover:shadow-2xl transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-3">
                <CardDescription className="uppercase text-xs tracking-widest font-bold">Tổng Lệnh Đặt</CardDescription>
                <div className="w-10 h-10 rounded-lg bg-destructive/20 flex items-center justify-center">
                  <Database size={20} className="text-destructive" />
                </div>
              </div>
              <div className="text-5xl font-extrabold text-destructive drop-shadow-[0_0_10px_rgba(239,68,68,0.3)]">
                {stats.totalBets}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={selectedTab} onValueChange={(value) => setSelectedTab(value as any)} className="space-y-6">
          <TabsList className="bg-card/80 p-1.5 border-2 border-border/50 shadow-lg">
            <TabsTrigger 
              value="control" 
              className="flex items-center gap-2 data-[state=active]:bg-gradient-to-br data-[state=active]:from-primary data-[state=active]:to-primary/80 data-[state=active]:text-white data-[state=active]:shadow-lg font-semibold"
            >
              <Settings size={18} />
              Điều Khiển Game
            </TabsTrigger>
            <TabsTrigger 
              value="users" 
              className="flex items-center gap-2 data-[state=active]:bg-gradient-to-br data-[state=active]:from-[#f59e0b] data-[state=active]:to-[#d97706] data-[state=active]:text-white data-[state=active]:shadow-lg font-semibold"
            >
              <Users size={18} />
              Quản Lý Người Dùng
            </TabsTrigger>
            <TabsTrigger 
              value="data" 
              className="flex items-center gap-2 data-[state=active]:bg-gradient-to-br data-[state=active]:from-destructive data-[state=active]:to-destructive/80 data-[state=active]:text-white data-[state=active]:shadow-lg font-semibold"
            >
              <Database size={18} />
              Quản Lý Dữ Liệu
            </TabsTrigger>
          </TabsList>

          {/* Game Control Tab */}
          <TabsContent value="control" className="space-y-6">
            {/* Game Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings size={24} />
                  System Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Round Duration (seconds)</label>
                    <Input
                      type="number"
                      value={roundDuration}
                      onChange={(e) => {
                        setRoundDuration(parseInt(e.target.value) || 15)
                        setHasUnsavedChanges(true)
                      }}
                      min={5}
                      max={300}
                    />
                    <p className="text-xs text-muted-foreground">Current: {roundDuration}s</p>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Price Update Interval (seconds)</label>
                    <Input
                      type="number"
                      value={priceUpdateInterval}
                      onChange={(e) => {
                        setPriceUpdateInterval(parseInt(e.target.value) || 1)
                        setHasUnsavedChanges(true)
                      }}
                      min={1}
                      max={10}
                    />
                    <p className="text-xs text-muted-foreground">Current: {priceUpdateInterval}s</p>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Win Rate (%)</label>
                    <Input
                      type="number"
                      value={winRate * 100}
                      onChange={(e) => {
                        setWinRate((parseFloat(e.target.value) || 95) / 100)
                        setHasUnsavedChanges(true)
                      }}
                      min={50}
                      max={200}
                      step={5}
                    />
                    <p className="text-xs text-muted-foreground">
                      Win: x{winRate.toFixed(2)} (Bet $100 → Receive ${(100 + 100 * winRate).toFixed(0)})
                    </p>
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-6 pt-4 border-t">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Default User Balance ($)</label>
                    <Input
                      type="number"
                      value={defaultUserBalance}
                      onChange={(e) => {
                        setDefaultUserBalance(parseFloat(e.target.value) || 10000)
                        setHasUnsavedChanges(true)
                      }}
                      min={100}
                      max={1000000}
                      step={1000}
                    />
                    <p className="text-xs text-muted-foreground">New users start with ${defaultUserBalance.toLocaleString()}</p>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Minimum Bet ($)</label>
                    <Input
                      type="number"
                      value={minBetAmount}
                      onChange={(e) => {
                        setMinBetAmount(parseFloat(e.target.value) || 10)
                        setHasUnsavedChanges(true)
                      }}
                      min={1}
                      max={1000}
                    />
                    <p className="text-xs text-muted-foreground">Min bet: ${minBetAmount}</p>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Maximum Bet ($)</label>
                    <Input
                      type="number"
                      value={maxBetAmount}
                      onChange={(e) => {
                        setMaxBetAmount(parseFloat(e.target.value) || 50000)
                        setHasUnsavedChanges(true)
                      }}
                      min={100}
                      max={10000000}
                      step={1000}
                    />
                    <p className="text-xs text-muted-foreground">Max bet: ${maxBetAmount.toLocaleString()}</p>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium">No Bet Penalty ($)</label>
                    <Input
                      type="number"
                      value={noBetPenalty}
                      onChange={(e) => {
                        setNoBetPenalty(parseFloat(e.target.value) || 0)
                        setHasUnsavedChanges(true)
                      }}
                      min={0}
                      max={10000}
                      step={10}
                    />
                    <p className="text-xs text-muted-foreground">
                      {noBetPenalty > 0 
                        ? `Users who don't bet will lose $${noBetPenalty.toLocaleString()}`
                        : 'No penalty (disabled)'
                      }
                    </p>
                  </div>
                </div>
                
                <Alert>
                  <AlertDescription>
                    Configuration changes will apply to the next round
                  </AlertDescription>
                </Alert>
                
                <Button
                  onClick={applySettings}
                  disabled={!hasUnsavedChanges || isSaving}
                  size="lg"
                  className="w-full"
                  variant={hasUnsavedChanges ? "default" : "outline"}
                >
                  {isSaving ? 'Applying...' : hasUnsavedChanges ? 'Apply Configuration' : 'Configuration Applied'}
                </Button>
              </CardContent>
            </Card>

            {/* Current Round */}
            {currentRound && (
              <Card className="bg-gradient-to-br from-primary/20 to-primary/5 border-2 border-primary/50 shadow-2xl glow-green">
                <CardHeader>
                  <CardTitle className="text-primary text-2xl font-extrabold flex items-center gap-2">
                    <RefreshCw size={28} className="animate-spin" />
                    Vòng Hiện Tại
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-6">
                    <div className="bg-card/50 p-4 rounded-xl border border-primary/30">
                      <CardDescription className="mb-2 uppercase text-xs tracking-widest font-bold text-primary">Số Vòng</CardDescription>
                      <div className="text-4xl font-extrabold text-primary drop-shadow-[0_0_10px_rgba(16,185,129,0.3)]">
                        #{currentRound.round_number}
                      </div>
                    </div>
                    <div className="bg-card/50 p-4 rounded-xl border border-border/50">
                      <CardDescription className="mb-2 uppercase text-xs tracking-widest font-bold">Giá Mở Cửa</CardDescription>
                      <div className="text-4xl font-extrabold">${currentRound.start_price.toFixed(2)}</div>
                    </div>
                    <div className="bg-card/50 p-4 rounded-xl border border-border/50">
                      <CardDescription className="mb-2 uppercase text-xs tracking-widest font-bold text-primary">Thời Gian Còn Lại</CardDescription>
                      <div className={`text-4xl font-extrabold ${
                        countdown <= 5 ? 'text-destructive animate-pulse' : 'text-primary'
                      }`}>
                        {countdown}s
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Price Control */}
            <Card>
              <CardHeader>
                <CardTitle>Price Control</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Auto Mode Settings */}
                {isAutoMode && (
                  <Alert>
                    <RefreshCw size={20} className="animate-spin" />
                    <AlertDescription className="ml-2 font-semibold">
                      Auto mode enabled - Price updates every {priceUpdateInterval} seconds
                    </AlertDescription>
                  </Alert>
                )}

                {/* Manual Control */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Current Price (USD)</label>
                    <div className="flex gap-4">
                      <Input
                        type="number"
                        value={currentPrice}
                        onChange={(e) => setCurrentPrice(parseFloat(e.target.value))}
                        disabled={isAutoMode}
                        className="text-xl font-bold"
                        step={0.01}
                      />
                      <Button
                        onClick={handlePriceIncrease}
                        disabled={isAutoMode}
                        size="lg"
                        className="bg-gradient-to-br from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white font-bold shadow-xl glow-green"
                      >
                        <TrendingUp size={24} />
                      </Button>
                      <Button
                        onClick={handlePriceDecrease}
                        disabled={isAutoMode}
                        size="lg"
                        className="bg-gradient-to-br from-[#ef4444] to-[#dc2626] hover:from-[#dc2626] hover:to-[#b91c1c] text-white font-bold shadow-xl glow-red"
                      >
                        <TrendingDown size={24} />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Price Change (USD)</label>
                    <Input
                      type="number"
                      value={priceChange}
                      onChange={(e) => setPriceChange(parseFloat(e.target.value))}
                      disabled={isAutoMode}
                      step={0.01}
                    />
                  </div>

                  <Button
                    onClick={handleManualUpdate}
                    disabled={isAutoMode}
                    size="lg"
                    className="w-full"
                  >
                    Manual Update Price
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Instructions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Instructions</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• <strong className="font-semibold">Auto mode:</strong> Price changes randomly every {priceUpdateInterval} seconds and broadcasts in real-time to clients</li>
                  <li>• <strong className="font-semibold">Manual mode:</strong> You can adjust the price and update manually</li>
                  <li>• Each betting round lasts <strong className="font-semibold">{roundDuration} seconds</strong></li>
                  <li>• Current reward rate: <strong className="font-semibold">{(winRate * 100).toFixed(0)}%</strong> (Bet $100, win and receive ${(100 + 100 * winRate).toFixed(0)})</li>
                  <li>• System automatically calculates results and pays rewards after {roundDuration} seconds</li>
                  <li>• Price history is saved for real-time chart drawing</li>
                </ul>
              </CardContent>
            </Card>
          </TabsContent>

          {/* User Management Tab */}
          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users size={24} />
                  User Management ({users.length} users)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Balance</TableHead>
                        <TableHead>Fingerprint</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell className="font-semibold">{user.name}</TableCell>
                          <TableCell>
                            {editingUser === user.id ? (
                              <div className="flex gap-2">
                                <Input
                                  type="number"
                                  value={editBalance}
                                  onChange={(e) => setEditBalance(parseFloat(e.target.value))}
                                  className="w-32"
                                  step={0.01}
                                />
                                <Button
                                  onClick={() => updateUserBalance(user.id, editBalance)}
                                  size="sm"
                                >
                                  Save
                                </Button>
                                <Button
                                  onClick={() => setEditingUser(null)}
                                  size="sm"
                                  variant="outline"
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <Badge variant="outline">
                                <DollarSign size={14} className="mr-1" />
                                {user.balance.toFixed(2)}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-sm text-muted-foreground">
                            {user.fingerprint.substring(0, 16)}...
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(user.created_at).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              {editingUser !== user.id && (
                                <Button
                                  onClick={() => {
                                    setEditingUser(user.id)
                                    setEditBalance(user.balance)
                                  }}
                                  size="sm"
                                >
                                  Edit Balance
                                </Button>
                              )}
                              <Button
                                onClick={() => deleteUser(user.id)}
                                size="sm"
                                variant="destructive"
                              >
                                <Trash2 size={14} className="mr-1" />
                                Delete
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {users.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      No users found
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Data Management Tab */}
          <TabsContent value="data" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database size={24} />
                  Data Management
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Card>
                  <CardContent className="p-4">
                    <h3 className="font-bold mb-2">Clean Price History</h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      Remove all historical price data and reset to initial price (2000). Useful for clearing chart data.
                    </p>
                    <Button
                      onClick={cleanPriceHistory}
                    >
                      Clean Price History
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <h3 className="font-bold mb-2">Clean Old Rounds</h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      Delete completed rounds older than 24 hours. Helps reduce database size.
                    </p>
                    <Button
                      onClick={cleanOldRounds}
                    >
                      Clean Old Rounds
                    </Button>
                  </CardContent>
                </Card>

                <Card className="border-2 border-destructive/50 bg-destructive/5">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="text-destructive mt-1" size={28} />
                      <div className="flex-1">
                        <h3 className="font-bold mb-2 text-destructive text-lg">DANGER ZONE: Reset All Data</h3>
                        <p className="text-sm text-muted-foreground mb-3">
                          <strong>WARNING:</strong> This will permanently delete ALL data including:
                        </p>
                        <ul className="text-sm text-muted-foreground mb-3 list-disc list-inside space-y-1">
                          <li>All users and their balances</li>
                          <li>All bets and betting history</li>
                          <li>All rounds (active and completed)</li>
                          <li>All price history and chart data</li>
                        </ul>
                        <p className="text-sm mb-3 font-semibold text-destructive">
                          This action cannot be undone. Use only when you want to completely restart the system.
                        </p>
                        <Button
                          onClick={resetAllData}
                          variant="destructive"
                          className="flex items-center gap-2"
                        >
                          <Trash2 size={18} />
                          Reset All Data
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Database Statistics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Rounds:</span>
                    <Badge variant="outline">{stats.totalRounds}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Users:</span>
                    <Badge variant="outline">{stats.activePlayers}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Bets:</span>
                    <Badge variant="outline">{stats.totalBets}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Current Price:</span>
                    <Badge variant="outline">${currentPrice.toFixed(2)}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

