import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { Play, Pause, TrendingUp, TrendingDown, RefreshCw, Settings, Users, Database, AlertTriangle, DollarSign, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

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
  const isInitialized = useRef(false)

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
            winRate: winRate // Gửi winRate đến clients
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
      // Delete user's bets first
      await supabase
        .from('bets')
        .delete()
        .eq('user_id', userId)

      // Delete user
      await supabase
        .from('users')
        .delete()
        .eq('id', userId)
      
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
    
    // Generate random price change (-2% to +2%)
    const changePercent = (Math.random() - 0.5) * 4
    const change = latestPrice * (changePercent / 100)
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
      const { data: newPriceData } = await supabase
        .from('gold_prices')
        .insert({
          price: price,
          change: change,
          timestamp: new Date().toISOString(),
        })
        .select()
        .single()

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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Warning Banner */}
        <div className="bg-yellow-500/20 border-2 border-yellow-500 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-3">
            <AlertTriangle className="text-yellow-400" size={24} />
            <div>
              <div className="font-bold text-yellow-400">IMPORTANT: Keep this page open for the game to function!</div>
              <div className="text-sm text-gray-300 mt-1">
                Admin panel is broadcasting game state to all players. If you close this page, players cannot continue.
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Admin Control Panel</h1>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-sm text-gray-300">Broadcasting Live</span>
            </div>
            <button
              onClick={() => setIsAutoMode(!isAutoMode)}
              className={`px-6 py-3 rounded-lg font-semibold transition flex items-center gap-2 ${
                isAutoMode
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {isAutoMode ? (
                <>
                  <Pause size={20} />
                  Stop Auto
                </>
              ) : (
                <>
                  <Play size={20} />
                  Start Auto
                </>
              )}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-6 mb-8">
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <div className="text-gray-400 text-sm mb-2">Total Rounds</div>
            <div className="text-3xl font-bold">{stats.totalRounds}</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <div className="text-gray-400 text-sm mb-2">Active Players</div>
            <div className="text-3xl font-bold">{stats.activePlayers}</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <div className="text-gray-400 text-sm mb-2">Total Bets</div>
            <div className="text-3xl font-bold">{stats.totalBets}</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setSelectedTab('control')}
            className={`px-6 py-3 rounded-lg font-semibold transition flex items-center gap-2 ${
              selectedTab === 'control'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            <Settings size={20} />
            Game Control
          </button>
          <button
            onClick={() => setSelectedTab('users')}
            className={`px-6 py-3 rounded-lg font-semibold transition flex items-center gap-2 ${
              selectedTab === 'users'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            <Users size={20} />
            User Management
          </button>
          <button
            onClick={() => setSelectedTab('data')}
            className={`px-6 py-3 rounded-lg font-semibold transition flex items-center gap-2 ${
              selectedTab === 'data'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            <Database size={20} />
            Data Management
          </button>
        </div>

        {/* Game Control Tab */}
        {selectedTab === 'control' && (
          <>
            {/* Game Settings */}
            <div className="bg-gradient-to-r from-purple-900/30 to-blue-900/30 rounded-lg p-6 border border-purple-500/30 mb-8">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Settings size={24} />
                System Configuration
              </h2>
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm text-gray-300 mb-2">
                    Round Duration (seconds)
                  </label>
                  <input
                    type="number"
                    value={roundDuration}
                    onChange={(e) => {
                      setRoundDuration(parseInt(e.target.value) || 15)
                      setHasUnsavedChanges(true)
                    }}
                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white"
                    min="5"
                    max="300"
                  />
                  <div className="text-xs text-gray-400 mt-1">Current: {roundDuration}s</div>
                </div>
                
                <div>
                  <label className="block text-sm text-gray-300 mb-2">
                    Price Update Interval (seconds)
                  </label>
                  <input
                    type="number"
                    value={priceUpdateInterval}
                    onChange={(e) => {
                      setPriceUpdateInterval(parseInt(e.target.value) || 1)
                      setHasUnsavedChanges(true)
                    }}
                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white"
                    min="1"
                    max="10"
                  />
                  <div className="text-xs text-gray-400 mt-1">Current: {priceUpdateInterval}s</div>
                </div>
                
                <div>
                  <label className="block text-sm text-gray-300 mb-2">
                    Win Rate (%)
                  </label>
                  <input
                    type="number"
                    value={winRate * 100}
                    onChange={(e) => {
                      setWinRate((parseFloat(e.target.value) || 95) / 100)
                      setHasUnsavedChanges(true)
                    }}
                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white"
                    min="50"
                    max="200"
                    step="5"
                  />
                  <div className="text-xs text-gray-400 mt-1">
                    Win: x{winRate.toFixed(2)} (Bet $100 → Receive ${(100 + 100 * winRate).toFixed(0)})
                  </div>
                </div>
              </div>
              <div className="mt-4 bg-yellow-500/10 border border-yellow-500/30 rounded p-3 text-sm text-yellow-200">
                Configuration changes will apply to the next round
              </div>
              
              {/* Apply Button */}
              <div className="mt-4">
                <button
                  onClick={applySettings}
                  disabled={!hasUnsavedChanges || isSaving}
                  className={`w-full py-3 rounded-lg font-bold transition ${
                    hasUnsavedChanges 
                      ? 'bg-green-600 hover:bg-green-700' 
                      : 'bg-gray-600 cursor-not-allowed'
                  } disabled:opacity-50`}
                >
                  {isSaving ? 'Applying...' : hasUnsavedChanges ? 'Apply Configuration' : 'Configuration Applied'}
                </button>
              </div>
            </div>

            {/* Current Round */}
            {currentRound && (
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-8">
                <h2 className="text-xl font-bold mb-4">Current Round</h2>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-gray-400 text-sm">Round Number</div>
                    <div className="text-2xl font-bold text-blue-400">#{currentRound.round_number}</div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-sm">Opening Price</div>
                    <div className="text-2xl font-bold">${currentRound.start_price.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-sm">Time Remaining</div>
                    <div className="text-2xl font-bold text-yellow-400">
                      {countdown}s
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Price Control */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h2 className="text-xl font-bold mb-6">Price Control</h2>

              {/* Auto Mode Settings */}
              {isAutoMode && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-6">
                  <div className="flex items-center gap-2">
                    <RefreshCw size={20} className="text-blue-400 animate-spin" />
                    <span className="font-semibold text-blue-400">
                      Auto mode enabled - Price updates every {priceUpdateInterval} seconds
                    </span>
                  </div>
                </div>
              )}

              {/* Manual Control */}
              <div className="space-y-6">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Current Price (USD)</label>
                  <div className="flex gap-4">
                    <input
                      type="number"
                      value={currentPrice}
                      onChange={(e) => setCurrentPrice(parseFloat(e.target.value))}
                      disabled={isAutoMode}
                      className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-xl font-bold disabled:opacity-50"
                      step="0.01"
                    />
                    <button
                      onClick={handlePriceIncrease}
                      disabled={isAutoMode}
                      className="bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed px-6 rounded-lg transition"
                    >
                      <TrendingUp size={24} />
                    </button>
                    <button
                      onClick={handlePriceDecrease}
                      disabled={isAutoMode}
                      className="bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed px-6 rounded-lg transition"
                    >
                      <TrendingDown size={24} />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">Price Change (USD)</label>
                  <input
                    type="number"
                    value={priceChange}
                    onChange={(e) => setPriceChange(parseFloat(e.target.value))}
                    disabled={isAutoMode}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 disabled:opacity-50"
                    step="0.01"
                  />
                </div>

                <button
                  onClick={handleManualUpdate}
                  disabled={isAutoMode}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed py-4 rounded-lg font-bold text-lg transition"
                >
                  Manual Update Price
                </button>
              </div>
            </div>

            {/* Instructions */}
            <div className="mt-8 bg-gray-800/50 rounded-lg p-6 border border-gray-700">
              <h3 className="font-bold mb-3">Instructions:</h3>
              <ul className="space-y-2 text-sm text-gray-300">
                <li>• <strong>Auto mode:</strong> Price changes randomly every {priceUpdateInterval} seconds and broadcasts in real-time to clients</li>
                <li>• <strong>Manual mode:</strong> You can adjust the price and update manually</li>
                <li>• Each betting round lasts <strong>{roundDuration} seconds</strong></li>
                <li>• Current reward rate: <strong>{(winRate * 100).toFixed(0)}%</strong> (Bet $100, win and receive ${(100 + 100 * winRate).toFixed(0)})</li>
                <li>• System automatically calculates results and pays rewards after {roundDuration} seconds</li>
                <li>• Price history is saved for real-time chart drawing</li>
              </ul>
            </div>
          </>
        )}

        {/* User Management Tab */}
        {selectedTab === 'users' && (
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <Users size={24} />
              User Management ({users.length} users)
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-3 px-4 text-gray-400 font-semibold">Name</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-semibold">Balance</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-semibold">Fingerprint</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-semibold">Created</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                      <td className="py-3 px-4 font-semibold">{user.name}</td>
                      <td className="py-3 px-4">
                        {editingUser === user.id ? (
                          <div className="flex gap-2">
                            <input
                              type="number"
                              value={editBalance}
                              onChange={(e) => setEditBalance(parseFloat(e.target.value))}
                              className="bg-gray-900 border border-gray-600 rounded px-2 py-1 w-32"
                              step="0.01"
                            />
                            <button
                              onClick={() => updateUserBalance(user.id, editBalance)}
                              className="bg-green-600 hover:bg-green-700 px-3 py-1 rounded text-sm"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingUser(null)}
                              className="bg-gray-600 hover:bg-gray-700 px-3 py-1 rounded text-sm"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <span className="flex items-center gap-2">
                            <DollarSign size={16} className="text-green-400" />
                            {user.balance.toFixed(2)}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-gray-400 text-sm font-mono">{user.fingerprint.substring(0, 16)}...</td>
                      <td className="py-3 px-4 text-gray-400 text-sm">{new Date(user.created_at).toLocaleString()}</td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2">
                          {editingUser !== user.id && (
                            <button
                              onClick={() => {
                                setEditingUser(user.id)
                                setEditBalance(user.balance)
                              }}
                              className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-sm"
                            >
                              Edit Balance
                            </button>
                          )}
                          <button
                            onClick={() => deleteUser(user.id)}
                            className="bg-red-600 hover:bg-red-700 px-3 py-1 rounded text-sm flex items-center gap-1"
                          >
                            <Trash2 size={14} />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {users.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  No users found
                </div>
              )}
            </div>
          </div>
        )}

        {/* Data Management Tab */}
        {selectedTab === 'data' && (
          <div className="space-y-6">
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <Database size={24} />
                Data Management
              </h2>
              
              <div className="space-y-4">
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                  <h3 className="font-bold mb-2">Clean Price History</h3>
                  <p className="text-sm text-gray-300 mb-3">
                    Remove all historical price data and reset to initial price (2000). Useful for clearing chart data.
                  </p>
                  <button
                    onClick={cleanPriceHistory}
                    className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg font-semibold transition"
                  >
                    Clean Price History
                  </button>
                </div>

                <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4">
                  <h3 className="font-bold mb-2">Clean Old Rounds</h3>
                  <p className="text-sm text-gray-300 mb-3">
                    Delete completed rounds older than 24 hours. Helps reduce database size.
                  </p>
                  <button
                    onClick={cleanOldRounds}
                    className="bg-purple-600 hover:bg-purple-700 px-6 py-2 rounded-lg font-semibold transition"
                  >
                    Clean Old Rounds
                  </button>
                </div>

                <div className="bg-red-500/10 border-2 border-red-500 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="text-red-400 mt-1" size={24} />
                    <div className="flex-1">
                      <h3 className="font-bold mb-2 text-red-400">DANGER ZONE: Reset All Data</h3>
                      <p className="text-sm text-gray-300 mb-3">
                        <strong>WARNING:</strong> This will permanently delete ALL data including:
                      </p>
                      <ul className="text-sm text-gray-300 mb-3 list-disc list-inside space-y-1">
                        <li>All users and their balances</li>
                        <li>All bets and betting history</li>
                        <li>All rounds (active and completed)</li>
                        <li>All price history and chart data</li>
                      </ul>
                      <p className="text-sm text-red-300 mb-3 font-semibold">
                        This action cannot be undone. Use only when you want to completely restart the system.
                      </p>
                      <button
                        onClick={resetAllData}
                        className="bg-red-600 hover:bg-red-700 px-6 py-2 rounded-lg font-bold transition flex items-center gap-2"
                      >
                        <Trash2 size={18} />
                        Reset All Data
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700">
              <h3 className="font-bold mb-3">Database Statistics</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Rounds:</span>
                  <span className="font-semibold">{stats.totalRounds}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Users:</span>
                  <span className="font-semibold">{stats.activePlayers}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Bets:</span>
                  <span className="font-semibold">{stats.totalBets}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Current Price:</span>
                  <span className="font-semibold">${currentPrice.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
