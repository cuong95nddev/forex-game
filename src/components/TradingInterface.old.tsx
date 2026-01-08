import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, DollarSign, Coins, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { useStore } from '../store/useStore'

export const TradingInterface: React.FC = () => {
  const { user, goldPrice, position, executeTrade, subscribeToGoldPrice } = useStore()
  const [tradeAmount, setTradeAmount] = useState('')
  const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy')

  useEffect(() => {
    const unsubscribe = subscribeToGoldPrice()
    return unsubscribe
  }, [subscribeToGoldPrice])

  const handleTrade = async () => {
    const amount = parseFloat(tradeAmount)
    if (isNaN(amount) || amount <= 0) {
      alert('Vui lòng nhập số tiền hợp lệ!')
      return
    }

    const success = await executeTrade(tradeType, amount)
    if (success) {
      setTradeAmount('')
      alert(`${tradeType === 'buy' ? 'Mua' : 'Bán'} thành công!`)
    }
  }

  if (!user || !goldPrice) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Đang tải...</div>
      </div>
    )
  }

  const goldQuantity = position?.gold_quantity || 0
  const goldValue = goldQuantity * goldPrice.price
  const profitLoss = position ? (goldPrice.price - position.average_price) * goldQuantity : 0
  const profitLossPercent = position && position.average_price > 0
    ? ((goldPrice.price - position.average_price) / position.average_price) * 100
    : 0

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-gray-800 rounded-lg shadow-xl p-6 mb-6 border border-gray-700">
          <div className="flex justify-between items-center flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white mb-1">Giao dịch Vàng</h1>
              <p className="text-gray-400">Xin chào, {user.name}</p>
            </div>
            <div className="flex gap-4">
              <div className="bg-gray-700 px-6 py-3 rounded-lg">
                <p className="text-gray-400 text-sm">Số dư</p>
                <p className="text-2xl font-bold text-yellow-500">${user.balance.toFixed(2)}</p>
              </div>
              <div className="bg-gray-700 px-6 py-3 rounded-lg">
                <p className="text-gray-400 text-sm">Tổng tài sản</p>
                <p className="text-2xl font-bold text-green-500">
                  ${(user.balance + goldValue).toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Gold Price Chart */}
          <div className="lg:col-span-2 bg-gray-800 rounded-lg shadow-xl p-6 border border-gray-700">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Coins className="w-8 h-8 text-yellow-500" />
                <div>
                  <h2 className="text-xl font-bold text-white">XAU/USD</h2>
                  <p className="text-gray-400 text-sm">Vàng</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-white">${goldPrice.price.toFixed(2)}</p>
                <div className={`flex items-center gap-1 ${goldPrice.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {goldPrice.change >= 0 ? (
                    <TrendingUp className="w-4 h-4" />
                  ) : (
                    <TrendingDown className="w-4 h-4" />
                  )}
                  <span className="font-semibold">
                    {goldPrice.change >= 0 ? '+' : ''}{goldPrice.change.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Position Info */}
            <div className="bg-gray-700 rounded-lg p-4 mb-4">
              <h3 className="text-white font-semibold mb-3">Vị thế hiện tại</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-400 text-sm">Số lượng vàng</p>
                  <p className="text-white font-bold">{goldQuantity.toFixed(6)} oz</p>
                </div>
                <div>
                  <p className="text-gray-400 text-sm">Giá trị</p>
                  <p className="text-white font-bold">${goldValue.toFixed(2)}</p>
                </div>
                {position && position.average_price > 0 && (
                  <>
                    <div>
                      <p className="text-gray-400 text-sm">Giá trung bình</p>
                      <p className="text-white font-bold">${position.average_price.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-sm">Lãi/Lỗ</p>
                      <p className={`font-bold ${profitLoss >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        ${profitLoss.toFixed(2)} ({profitLossPercent.toFixed(2)}%)
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Trading Panel */}
          <div className="bg-gray-800 rounded-lg shadow-xl p-6 border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4">Giao dịch</h2>
            
            {/* Buy/Sell Toggle */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setTradeType('buy')}
                className={`flex-1 py-3 px-4 rounded-lg font-semibold transition duration-200 ${
                  tradeType === 'buy'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                <ArrowUpRight className="w-5 h-5 inline mr-2" />
                Mua
              </button>
              <button
                onClick={() => setTradeType('sell')}
                className={`flex-1 py-3 px-4 rounded-lg font-semibold transition duration-200 ${
                  tradeType === 'sell'
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                <ArrowDownRight className="w-5 h-5 inline mr-2" />
                Bán
              </button>
            </div>

            {/* Amount Input */}
            <div className="mb-4">
              <label className="block text-gray-400 text-sm mb-2">Số tiền (USD)</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="number"
                  value={tradeAmount}
                  onChange={(e) => setTradeAmount(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-white"
                  placeholder="0.00"
                  step="0.01"
                />
              </div>
              {tradeAmount && goldPrice && (
                <p className="text-gray-400 text-sm mt-2">
                  ≈ {(parseFloat(tradeAmount) / goldPrice.price).toFixed(6)} oz
                </p>
              )}
            </div>

            {/* Quick Amount Buttons */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[100, 500, 1000, 5000].map((amount) => (
                <button
                  key={amount}
                  onClick={() => setTradeAmount(amount.toString())}
                  className="py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition duration-200"
                >
                  ${amount}
                </button>
              ))}
            </div>

            {/* Execute Button */}
            <button
              onClick={handleTrade}
              className={`w-full py-4 rounded-lg font-bold text-white transition duration-200 transform hover:scale-105 ${
                tradeType === 'buy'
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {tradeType === 'buy' ? 'Mua vàng' : 'Bán vàng'}
            </button>

            {/* Info */}
            <div className="mt-4 p-3 bg-gray-700 rounded-lg">
              <p className="text-gray-400 text-xs">
                💡 Giá hiện tại: ${goldPrice.price.toFixed(2)}/oz
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
