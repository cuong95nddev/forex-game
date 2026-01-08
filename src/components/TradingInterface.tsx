import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, Clock, DollarSign, Users } from 'lucide-react'
import { useStore } from '../store/useStore'
import TradingChart from './TradingChart'

export default function TradingInterface() {
  const { 
    user, 
    goldPrice, 
    currentRound, 
    userBet, 
    countdown, 
    placeBet, 
    recentBets, 
    loadRecentBets 
  } = useStore()
  
  const [betAmount, setBetAmount] = useState('100')
  const [chartPrices, setChartPrices] = useState<Array<{
    time: number
    value: number
  }>>([])

  useEffect(() => {
    loadRecentBets()
  }, [loadRecentBets])

  useEffect(() => {
    // Generate chart data
    if (goldPrice) {
      const now = Math.floor(Date.now() / 1000)
      const basePrice = goldPrice.price
      const variation = basePrice * 0.01
      
      // Generate last 50 data points
      const newChartPrices = []
      for (let i = 50; i >= 0; i--) {
        const time = now - (i * 15)
        const value = basePrice + (Math.random() - 0.5) * variation
        
        newChartPrices.push({ time, value })
      }
      
      setChartPrices(newChartPrices)
    }
  }, [goldPrice])

  // Show loading state if no user or goldPrice
  if (!user || !goldPrice) {
    return (
      <div className="min-h-screen bg-[#0a0e27] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-white text-xl">Đang tải dữ liệu...</p>
        </div>
      </div>
    )
  }

  const handleBet = async (prediction: 'up' | 'down') => {
    const amount = parseFloat(betAmount)
    if (isNaN(amount) || amount <= 0) {
      alert('Số tiền không hợp lệ!')
      return
    }
    
    if (!user || amount > user.balance) {
      alert('Số dư không đủ!')
      return
    }

    const success = await placeBet(prediction, amount)
    if (success) {
      setBetAmount('100')
    }
  }

  if (!user || !goldPrice) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-yellow-500 mx-auto mb-4"></div>
          <p className="text-white text-xl">Đang tải dữ liệu...</p>
          {!user && <p className="text-gray-400 mt-2">Đang tải thông tin người dùng...</p>}
          {!goldPrice && <p className="text-gray-400 mt-2">Đang tải giá vàng...</p>}
        </div>
      </div>
    )
  }

  const priceChange = goldPrice?.change || 0
  const priceChangePercent = goldPrice ? ((priceChange / goldPrice.price) * 100).toFixed(2) : '0.00'
  const isPositive = priceChange >= 0

  const quickAmounts = [100, 500, 1000, 5000]
  return (    <div className="min-h-screen bg-[#0a0e27] text-white">
      {/* Top Bar */}
      <div className="bg-[#13182b] border-b border-gray-800 px-6 py-3">
        <div className="flex justify-between items-center max-w-[1800px] mx-auto">
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-bold">
              <span className="text-blue-500">GOLD</span> TRADE
              <span className="ml-2 px-2 py-1 bg-blue-600 text-xs rounded">LIVE</span>
            </h1>
            <div className="flex items-center gap-2 text-sm">
              <Users size={16} className="text-gray-400" />
              <span className="text-gray-400">Online:</span>
              <span className="text-green-400 font-semibold">2,456</span>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-xs text-gray-400">Tài khoản</div>
              <div className="text-lg font-bold flex items-center gap-1">
                <DollarSign size={18} className="text-yellow-500" />
                {user?.balance.toLocaleString()} ₫
              </div>
            </div>
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center font-bold">
              {user?.name[0].toUpperCase()}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1800px] mx-auto p-6">
        <div className="grid grid-cols-12 gap-6">
          {/* Main Chart Area */}
          <div className="col-span-9">
            {/* Price Header */}
            <div className="bg-[#13182b] rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-gray-400 mb-1">XAU/USD - Gold Spot</div>
                  <div className="flex items-center gap-4">
                    <div className="text-3xl font-bold">
                      ${goldPrice?.price.toLocaleString() || '0.00'}
                    </div>
                    <div className={`flex items-center gap-1 px-3 py-1 rounded ${
                      isPositive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {isPositive ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                      <span className="font-semibold">
                        {isPositive ? '+' : ''}{priceChange.toFixed(2)} ({isPositive ? '+' : ''}{priceChangePercent}%)
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className="text-sm text-gray-400 mb-1">Thời gian vòng</div>
                  <div className="flex items-center gap-2 text-2xl font-bold">
                    <Clock size={24} className="text-blue-500" />
                    <span className={countdown <= 5 ? 'text-red-500 animate-pulse' : 'text-blue-400'}>
                      {countdown}s
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Chart */}
            <div className="bg-[#13182b] rounded-lg p-4">
              <TradingChart prices={chartPrices} />
            </div>

            {/* Recent Bets Table */}
            <div className="bg-[#13182b] rounded-lg p-4 mt-4">
              <h3 className="text-lg font-semibold mb-4">Lệnh gần đây</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-700">
                      <th className="text-left py-2">Thời gian</th>
                      <th className="text-left py-2">Người chơi</th>
                      <th className="text-left py-2">Dự đoán</th>
                      <th className="text-right py-2">Số tiền</th>
                      <th className="text-right py-2">Kết quả</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentBets.slice(0, 10).map((bet) => (
                      <tr key={bet.id} className="border-b border-gray-800">
                        <td className="py-2">
                          {new Date(bet.created_at).toLocaleTimeString('vi-VN')}
                        </td>
                        <td className="py-2">User-{bet.user_id.slice(0, 8)}</td>
                        <td className="py-2">
                          <span className={`px-2 py-1 rounded text-xs ${
                            bet.prediction === 'up' 
                              ? 'bg-green-500/20 text-green-400' 
                              : 'bg-red-500/20 text-red-400'
                          }`}>
                            {bet.prediction === 'up' ? '↑ TĂNG' : '↓ GIẢM'}
                          </span>
                        </td>
                        <td className="text-right py-2">${bet.bet_amount.toLocaleString()}</td>
                        <td className="text-right py-2">
                          {bet.result === 'pending' ? (
                            <span className="text-gray-400">Chờ</span>
                          ) : bet.result === 'won' ? (
                            <span className="text-green-400 font-semibold">+${bet.profit.toLocaleString()}</span>
                          ) : (
                            <span className="text-red-400 font-semibold">-${bet.bet_amount.toLocaleString()}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Trading Panel */}
          <div className="col-span-3">
            <div className="bg-[#13182b] rounded-lg p-6 sticky top-6">
              <h2 className="text-xl font-bold mb-6 text-center">ĐẶT LỆNH</h2>
              
              {/* Current Round Info */}
              {currentRound && (
                <div className="bg-[#0a0e27] rounded-lg p-4 mb-6">
                  <div className="text-center">
                    <div className="text-sm text-gray-400 mb-2">Vòng hiện tại</div>
                    <div className="text-3xl font-bold text-blue-400">#{currentRound.round_number}</div>
                    <div className="text-sm text-gray-400 mt-2">
                      Giá mở cửa: ${currentRound.start_price.toFixed(2)}
                    </div>
                  </div>
                </div>
              )}

              {userBet ? (
                <div className="space-y-4">
                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                    <div className="text-center">
                      <div className="text-sm text-gray-400 mb-2">Lệnh của bạn</div>
                      <div className={`text-2xl font-bold mb-2 ${
                        userBet.prediction === 'up' ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {userBet.prediction === 'up' ? '↑ TĂNG' : '↓ GIẢM'}
                      </div>
                      <div className="text-lg font-semibold">
                        ${userBet.bet_amount.toLocaleString()}
                      </div>
                      <div className="text-xs text-gray-400 mt-2">
                        Chờ kết quả vòng này...
                      </div>
                    </div>
                  </div>
                  <div className="text-center text-sm text-gray-400">
                    Mỗi vòng chỉ được đặt 1 lần
                  </div>
                </div>
              ) : countdown > 0 ? (
                <div className="space-y-4">
                  {/* Bet Amount */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Số tiền cược</label>
                    <input
                      type="number"
                      value={betAmount}
                      onChange={(e) => setBetAmount(e.target.value)}
                      className="w-full bg-[#0a0e27] border border-gray-700 rounded-lg px-4 py-3 text-lg font-semibold focus:border-blue-500 focus:outline-none"
                      placeholder="Nhập số tiền"
                    />
                  </div>

                  {/* Quick Amount Buttons */}
                  <div className="grid grid-cols-2 gap-2">
                    {quickAmounts.map((amount) => (
                      <button
                        key={amount}
                        onClick={() => setBetAmount(amount.toString())}
                        className="bg-[#0a0e27] hover:bg-gray-700 border border-gray-700 rounded-lg py-2 text-sm font-semibold transition"
                      >
                        ${amount}
                      </button>
                    ))}
                  </div>

                  {/* Bet Buttons */}
                  <div className="grid grid-cols-2 gap-3 mt-6">
                    <button
                      onClick={() => handleBet('up')}
                      disabled={!currentRound || countdown <= 0}
                      className="bg-gradient-to-br from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg py-4 font-bold text-lg transition flex flex-col items-center gap-1 shadow-lg hover:shadow-green-500/50"
                    >
                      <TrendingUp size={24} />
                      <span>TĂNG</span>
                      <span className="text-xs opacity-80">x1.95</span>
                    </button>
                    
                    <button
                      onClick={() => handleBet('down')}
                      disabled={!currentRound || countdown <= 0}
                      className="bg-gradient-to-br from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg py-4 font-bold text-lg transition flex flex-col items-center gap-1 shadow-lg hover:shadow-red-500/50"
                    >
                      <TrendingDown size={24} />
                      <span>GIẢM</span>
                      <span className="text-xs opacity-80">x1.95</span>
                    </button>
                  </div>

                  <div className="text-xs text-center text-gray-400 mt-4">
                    Đặt lệnh trước khi hết thời gian
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="text-yellow-500 mb-2">⏳</div>
                  <div className="text-gray-400">Đang chờ vòng mới...</div>
                </div>
              )}

              {/* Info */}
              <div className="mt-6 pt-6 border-t border-gray-700">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Mỗi vòng:</span>
                    <span className="font-semibold">15 giây</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Thắng:</span>
                    <span className="font-semibold text-green-400">x1.95 tiền cược</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Thua:</span>
                    <span className="font-semibold text-red-400">Mất tiền cược</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
