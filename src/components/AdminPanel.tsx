import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { Play, Pause, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react'

export default function AdminPanel() {
  const [currentPrice, setCurrentPrice] = useState(2000)
  const [priceChange, setPriceChange] = useState(0)
  const [isAutoMode, setIsAutoMode] = useState(true)
  const [currentRound, setCurrentRound] = useState<any>(null)
  const [countdown, setCountdown] = useState(15)
  const [stats, setStats] = useState({
    totalRounds: 0,
    activePlayers: 0,
    totalBets: 0,
  })
  const broadcastChannel = useRef<any>(null)
  const countdownInterval = useRef<any>(null)
  const currentPriceRef = useRef(2000)
  const priceChangeRef = useRef(0)

  useEffect(() => {
    const initialize = async () => {
      // Setup broadcast channel
      broadcastChannel.current = supabase.channel('game-state')
      await broadcastChannel.current.subscribe()
      
      await loadCurrentPrice()
      await loadCurrentRound()
      await loadStats()
      
      // Auto-start first round if none exists
      const { data: activeRound } = await supabase
        .from('rounds')
        .select('*')
        .eq('status', 'active')
        .single()
      
      if (!activeRound) {
        console.log('No active round, starting first round...')
        await startNewRound(currentPrice)
      } else {
        // Start countdown for existing round
        startCountdownTimer(activeRound)
      }
    }
    
    initialize()
    
    const statsInterval = setInterval(() => {
      loadStats()
    }, 3000)

    return () => {
      clearInterval(statsInterval)
      if (countdownInterval.current) clearInterval(countdownInterval.current)
      if (broadcastChannel.current) broadcastChannel.current.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>

    if (isAutoMode) {
      interval = setInterval(() => {
        handleAutoUpdatePrice()
      }, 1000) // Update mỗi 1 giây
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [isAutoMode, currentPrice])

  const loadCurrentPrice = async () => {
    const { data } = await supabase
      .from('gold_prices')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(1)
      .single()

    if (data) {
      setCurrentPrice(data.price)
      setPriceChange(data.change)
      currentPriceRef.current = data.price
      priceChangeRef.current = data.change
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
    if (countdownInterval.current) clearInterval(countdownInterval.current)
    
    const startTime = new Date(round.start_time).getTime()
    const updateCountdown = () => {
      const now = Date.now()
      const elapsed = Math.floor((now - startTime) / 1000)
      const remaining = Math.max(0, 15 - elapsed)
      
      setCountdown(remaining)
      
      // Broadcast game state to all clients
      if (broadcastChannel.current) {
        const latestPrice = currentPriceRef.current
        const change = latestPrice - round.start_price
        broadcastChannel.current.send({
          type: 'broadcast',
          event: 'game-state',
          payload: {
            countdown: remaining,
            currentRound: round,
            goldPrice: { price: latestPrice, change: change, timestamp: new Date().toISOString() }
          }
        })
      }
      
      if (remaining === 0) {
        clearInterval(countdownInterval.current)
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

      const endPrice = latestPrice.price

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
          const profit = userWon ? bet.bet_amount * 0.95 : 0
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
    // Generate random price change (-2% to +2%)
    const changePercent = (Math.random() - 0.5) * 4
    const change = currentPrice * (changePercent / 100)
    const newPrice = currentPrice + change

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

      // Broadcast price update with full price data
      if (broadcastChannel.current && currentRound) {
        broadcastChannel.current.send({
          type: 'broadcast',
          event: 'game-state',
          payload: {
            countdown,
            currentRound,
            goldPrice: newPriceData || { price, change, timestamp: new Date().toISOString() }
          }
        })
      }

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
      <div className="max-w-6xl mx-auto">
        {/* Warning Banner */}
        <div className="bg-yellow-500/20 border-2 border-yellow-500 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="text-2xl">⚠️</div>
            <div>
              <div className="font-bold text-yellow-400">QUAN TRỌNG: Trang này phải được mở để game hoạt động!</div>
              <div className="text-sm text-gray-300 mt-1">
                Admin panel đang phát sóng trực tiếp trạng thái game đến tất cả người chơi. Nếu đóng trang này, người chơi sẽ không thể tiếp tục chơi.
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
                  Dừng Auto
                </>
              ) : (
                <>
                  <Play size={20} />
                  Bật Auto
                </>
              )}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-6 mb-8">
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <div className="text-gray-400 text-sm mb-2">Tổng vòng</div>
            <div className="text-3xl font-bold">{stats.totalRounds}</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <div className="text-gray-400 text-sm mb-2">Người chơi</div>
            <div className="text-3xl font-bold">{stats.activePlayers}</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <div className="text-gray-400 text-sm mb-2">Tổng lệnh</div>
            <div className="text-3xl font-bold">{stats.totalBets}</div>
          </div>
        </div>

        {/* Current Round */}
        {currentRound && (
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-8">
            <h2 className="text-xl font-bold mb-4">Vòng hiện tại</h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-gray-400 text-sm">Số vòng</div>
                <div className="text-2xl font-bold text-blue-400">#{currentRound.round_number}</div>
              </div>
              <div>
                <div className="text-gray-400 text-sm">Giá mở cửa</div>
                <div className="text-2xl font-bold">${currentRound.start_price.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-gray-400 text-sm">Thời gian còn lại</div>
                <div className="text-2xl font-bold text-yellow-400">
                  {countdown}s
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Price Control */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl font-bold mb-6">Điều khiển giá</h2>

          {/* Auto Mode Settings */}
          {isAutoMode && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-6">
              <div className="flex items-center gap-2">
                <RefreshCw size={20} className="text-blue-400 animate-spin" />
                <span className="font-semibold text-blue-400">Chế độ tự động đang bật - Cập nhật giá mỗi 1 giây</span>
              </div>
            </div>
          )}

          {/* Manual Control */}
          <div className="space-y-6">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Giá hiện tại (USD)</label>
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
              <label className="block text-sm text-gray-400 mb-2">Thay đổi (USD)</label>
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
              Cập nhật giá thủ công
            </button>
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-8 bg-gray-800/50 rounded-lg p-6 border border-gray-700">
          <h3 className="font-bold mb-3">Hướng dẫn:</h3>
          <ul className="space-y-2 text-sm text-gray-300">
            <li>• <strong>Chế độ tự động:</strong> Giá sẽ tự động thay đổi ngẫu nhiên MỖI 1 GIÂY và phát real-time đến clients</li>
            <li>• <strong>Chế độ thủ công:</strong> Bạn có thể điều chỉnh giá và cập nhật bằng tay</li>
            <li>• Mỗi vòng betting kéo dài 15 giây</li>
            <li>• Hệ thống tự động tính toán kết quả và trả thưởng khi hết 15 giây</li>
            <li>• Lịch sử giá được lưu để vẽ biểu đồ real-time</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
