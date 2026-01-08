import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, DollarSign, Clock, Target } from 'lucide-react'
import { useStore } from '../store/useStore'

export const TradingInterface: React.FC = () => {
  const { 
    user, 
    goldPrice, 
    currentRound, 
    userBet, 
    countdown, 
    recentBets,
    placeBet, 
    subscribeToGoldPrice, 
    subscribeToRounds,
    loadRecentBets 
  } = useStore()
  const [betAmount, setBetAmount] = useState('')

  useEffect(() => {
    subscribeToGoldPrice()
    subscribeToRounds()
    loadRecentBets()
  }, [subscribeToGoldPrice, subscribeToRounds, loadRecentBets])

  const handleBet = async (prediction: 'up' | 'down') => {
    const amount = parseFloat(betAmount)
    if (isNaN(amount) || amount <= 0) {
      alert('Vui lòng nhập số tiền hợp lệ!')
      return
    }

    const success = await placeBet(prediction, amount)
    if (success) {
      setBetAmount('')
    }
  }

  if (!user || !goldPrice) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Đang tải...</div>
      </div>
    )
  }

  const priceChangeColor = goldPrice.change >= 0 ? 'text-green-400' : 'text-red-400'
  const priceChangeIcon = goldPrice.change >= 0 ? TrendingUp : TrendingDown

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-gray-800 rounded-lg shadow-xl p-6 mb-6 border border-gray-700">
          <div className="flex justify-between items-center flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white mb-1">Game Vàng</h1>
              <p className="text-gray-400">Chào {user.name}!</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-gray-400 text-sm">Số dư</p>
                <p className="text-2xl font-bold text-green-400">
                  ${user.balance.toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Current Price & Countdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Price Display */}
          <div className="bg-gray-800 rounded-lg shadow-xl p-6 border border-gray-700">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-5 h-5 text-yellow-500" />
              <h3 className="text-lg font-semibold text-white">Giá Vàng Hiện Tại</h3>
            </div>
            <div className="flex items-end gap-3">
              <div className="text-4xl font-bold text-white">
                ${goldPrice.price.toFixed(2)}
              </div>
              <div className={`flex items-center gap-1 ${priceChangeColor} mb-2`}>
                {priceChangeIcon === TrendingUp ? (
                  <TrendingUp className="w-5 h-5" />
                ) : (
                  <TrendingDown className="w-5 h-5" />
                )}
                <span className="text-lg font-semibold">
                  ${Math.abs(goldPrice.change).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Countdown Timer */}
          <div className="bg-gray-800 rounded-lg shadow-xl p-6 border border-gray-700">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-5 h-5 text-blue-500" />
              <h3 className="text-lg font-semibold text-white">Thời Gian Còn Lại</h3>
            </div>
            <div className="flex items-center gap-4">
              <div className={`text-5xl font-bold ${countdown <= 5 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                {countdown}s
              </div>
              {currentRound && (
                <div className="text-gray-400">
                  <div className="text-sm">Vòng #{currentRound.round_number}</div>
                  <div className="text-xs">Giá bắt đầu: ${currentRound.start_price.toFixed(2)}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Betting Interface */}
        {!userBet ? (
          <div className="bg-gray-800 rounded-lg shadow-xl p-6 mb-6 border border-gray-700">
            <div className="flex items-center gap-2 mb-4">
              <Target className="w-5 h-5 text-purple-500" />
              <h3 className="text-lg font-semibold text-white">Đặt Cược</h3>
            </div>

            {countdown > 0 && currentRound ? (
              <>
                <div className="mb-4">
                  <label className="block text-gray-400 text-sm font-medium mb-2">
                    Số tiền cược (tối thiểu $100)
                  </label>
                  <input
                    type="number"
                    value={betAmount}
                    onChange={(e) => setBetAmount(e.target.value)}
                    placeholder="Nhập số tiền"
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
                    min="100"
                    step="100"
                  />
                  <div className="mt-2 flex gap-2">
                    {[100, 500, 1000, 5000].map((amount) => (
                      <button
                        key={amount}
                        onClick={() => setBetAmount(amount.toString())}
                        className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm"
                      >
                        ${amount}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => handleBet('up')}
                    className="flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-bold rounded-lg transition-all transform hover:scale-105 shadow-lg"
                  >
                    <TrendingUp className="w-6 h-6" />
                    <div className="text-left">
                      <div className="text-lg">TĂNG</div>
                      <div className="text-xs opacity-80">x2 nếu thắng</div>
                    </div>
                  </button>

                  <button
                    onClick={() => handleBet('down')}
                    className="flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold rounded-lg transition-all transform hover:scale-105 shadow-lg"
                  >
                    <TrendingDown className="w-6 h-6" />
                    <div className="text-left">
                      <div className="text-lg">GIẢM</div>
                      <div className="text-xs opacity-80">x2 nếu thắng</div>
                    </div>
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-gray-400">
                Hết thời gian đặt cược cho vòng này. Vui lòng đợi vòng tiếp theo!
              </div>
            )}
          </div>
        ) : (
          <div className="bg-gray-800 rounded-lg shadow-xl p-6 mb-6 border border-gray-700">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-white mb-4">Đã Đặt Cược</h3>
              <div className="flex items-center justify-center gap-4 mb-4">
                {userBet.prediction === 'up' ? (
                  <div className="flex items-center gap-2 text-green-400">
                    <TrendingUp className="w-8 h-8" />
                    <span className="text-2xl font-bold">TĂNG</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-red-400">
                    <TrendingDown className="w-8 h-8" />
                    <span className="text-2xl font-bold">GIẢM</span>
                  </div>
                )}
              </div>
              <div className="text-3xl font-bold text-white mb-2">
                ${userBet.bet_amount.toFixed(2)}
              </div>
              {userBet.result === 'pending' ? (
                <div className="text-gray-400">Đang chờ kết quả...</div>
              ) : userBet.result === 'won' ? (
                <div className="text-green-400 text-xl font-bold">
                  🎉 THẮNG! +${userBet.profit.toFixed(2)}
                </div>
              ) : (
                <div className="text-red-400 text-xl font-bold">
                  😔 THUA -${userBet.bet_amount.toFixed(2)}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Betting History */}
        <div className="bg-gray-800 rounded-lg shadow-xl p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Lịch Sử Cược</h3>
          {recentBets.length > 0 ? (
            <div className="space-y-2">
              {recentBets.map((bet) => (
                <div
                  key={bet.id}
                  className="flex items-center justify-between p-3 bg-gray-700 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {bet.prediction === 'up' ? (
                      <TrendingUp className="w-5 h-5 text-green-400" />
                    ) : (
                      <TrendingDown className="w-5 h-5 text-red-400" />
                    )}
                    <div>
                      <div className="text-white font-medium">
                        {bet.prediction === 'up' ? 'TĂNG' : 'GIẢM'} - ${bet.bet_amount.toFixed(2)}
                      </div>
                      <div className="text-xs text-gray-400">
                        {new Date(bet.created_at).toLocaleString('vi-VN')}
                      </div>
                    </div>
                  </div>
                  <div>
                    {bet.result === 'pending' ? (
                      <span className="text-yellow-400 text-sm">Chờ</span>
                    ) : bet.result === 'won' ? (
                      <span className="text-green-400 font-bold">
                        +${bet.profit.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-red-400 font-bold">
                        -${bet.bet_amount.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">
              Chưa có lịch sử cược
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
