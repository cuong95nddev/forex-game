import { useState, useEffect } from 'react'
import { Activity, Users, TrendingUp, Send, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'

export const AdminPanel: React.FC = () => {
  const [currentPrice, setCurrentPrice] = useState(2000)
  const [priceChange, setPriceChange] = useState(0)
  const [users, setUsers] = useState<any[]>([])
  const [isUpdating, setIsUpdating] = useState(false)
  const [autoUpdate, setAutoUpdate] = useState(false)
  const [updateInterval, setUpdateInterval] = useState(5)

  useEffect(() => {
    loadCurrentPrice()
    loadUsers()
  }, [])

  useEffect(() => {
    if (autoUpdate) {
      const interval = setInterval(() => {
        updatePriceRandomly()
      }, updateInterval * 1000)
      return () => clearInterval(interval)
    }
  }, [autoUpdate, updateInterval, currentPrice])

  const loadCurrentPrice = async () => {
    const { data } = await supabase
      .from('gold_prices')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(1)
      .single()

    if (data) {
      setCurrentPrice(data.price)
    }
  }

  const loadUsers = async () => {
    const { data } = await supabase
      .from('users')
      .select('*, positions(*)')
      .order('created_at', { ascending: false })

    if (data) {
      setUsers(data)
    }
  }

  const updatePrice = async (newPrice: number, change: number) => {
    setIsUpdating(true)
    try {
      const { error } = await supabase
        .from('gold_prices')
        .insert([{ price: newPrice, change }])

      if (!error) {
        setCurrentPrice(newPrice)
        setPriceChange(change)
      }
    } catch (error) {
      console.error('Error updating price:', error)
    } finally {
      setIsUpdating(false)
    }
  }

  const updatePriceRandomly = () => {
    // Random price change between -10 and +10
    const change = (Math.random() - 0.5) * 20
    const newPrice = Math.max(1000, currentPrice + change)
    updatePrice(newPrice, change)
  }

  const handleManualUpdate = () => {
    const newPrice = parseFloat(prompt('Nhập giá mới:', currentPrice.toString()) || currentPrice.toString())
    if (!isNaN(newPrice) && newPrice > 0) {
      const change = newPrice - currentPrice
      updatePrice(newPrice, change)
    }
  }

  const totalGold = users.reduce((sum, user) => {
    const position = user.positions?.[0]
    return sum + (position?.gold_quantity || 0)
  }, 0)

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-gray-900 to-gray-800 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-gray-800 rounded-lg shadow-xl p-6 mb-6 border border-purple-700">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">Admin Panel</h1>
              <p className="text-gray-400">Quản lý giá vàng và theo dõi người chơi</p>
            </div>
            <Activity className="w-12 h-12 text-purple-500" />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="bg-gray-800 rounded-lg shadow-xl p-6 border border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm mb-1">Giá vàng hiện tại</p>
                <p className="text-3xl font-bold text-yellow-500">${currentPrice.toFixed(2)}</p>
                <p className={`text-sm mt-1 ${priceChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}
                </p>
              </div>
              <TrendingUp className="w-10 h-10 text-yellow-500" />
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg shadow-xl p-6 border border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm mb-1">Tổng người chơi</p>
                <p className="text-3xl font-bold text-blue-500">{users.length}</p>
                <p className="text-sm text-gray-400 mt-1">Đang hoạt động</p>
              </div>
              <Users className="w-10 h-10 text-blue-500" />
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg shadow-xl p-6 border border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm mb-1">Tổng vàng</p>
                <p className="text-3xl font-bold text-green-500">{totalGold.toFixed(2)} oz</p>
                <p className="text-sm text-gray-400 mt-1">${(totalGold * currentPrice).toFixed(2)}</p>
              </div>
              <Activity className="w-10 h-10 text-green-500" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Price Control */}
          <div className="bg-gray-800 rounded-lg shadow-xl p-6 border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4">Điều khiển giá</h2>
            
            {/* Manual Update */}
            <div className="mb-6">
              <button
                onClick={handleManualUpdate}
                disabled={isUpdating}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-lg transition duration-200 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Send className="w-5 h-5" />
                Cập nhật giá thủ công
              </button>
            </div>

            {/* Random Update */}
            <div className="mb-6">
              <button
                onClick={updatePriceRandomly}
                disabled={isUpdating}
                className="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-3 px-4 rounded-lg transition duration-200 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <RefreshCw className="w-5 h-5" />
                Cập nhật ngẫu nhiên
              </button>
            </div>

            {/* Auto Update Toggle */}
            <div className="bg-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <label className="text-white font-semibold">Tự động cập nhật</label>
                <button
                  onClick={() => setAutoUpdate(!autoUpdate)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    autoUpdate ? 'bg-green-600' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      autoUpdate ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div>
                <label className="text-gray-400 text-sm mb-2 block">
                  Khoảng thời gian (giây)
                </label>
                <input
                  type="number"
                  value={updateInterval}
                  onChange={(e) => setUpdateInterval(parseInt(e.target.value) || 5)}
                  min="1"
                  max="60"
                  className="w-full px-4 py-2 bg-gray-600 border border-gray-500 rounded-lg text-white"
                />
              </div>
            </div>

            <div className="mt-4 p-3 bg-blue-900 bg-opacity-30 border border-blue-700 rounded-lg">
              <p className="text-blue-300 text-sm">
                💡 Giá sẽ thay đổi ngẫu nhiên trong khoảng -$10 đến +$10
              </p>
            </div>
          </div>

          {/* Users List */}
          <div className="bg-gray-800 rounded-lg shadow-xl p-6 border border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Danh sách người chơi</h2>
              <button
                onClick={loadUsers}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {users.map((user) => {
                const position = user.positions?.[0]
                const goldValue = (position?.gold_quantity || 0) * currentPrice
                const totalAssets = parseFloat(user.balance) + goldValue

                return (
                  <div key={user.id} className="bg-gray-700 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="text-white font-semibold">{user.name}</h3>
                        <p className="text-gray-400 text-xs">{user.fingerprint.substring(0, 12)}...</p>
                      </div>
                      <span className="text-green-500 font-bold">${totalAssets.toFixed(2)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-gray-400">Số dư</p>
                        <p className="text-white">${parseFloat(user.balance).toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Vàng</p>
                        <p className="text-yellow-500">
                          {(position?.gold_quantity || 0).toFixed(4)} oz
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}

              {users.length === 0 && (
                <div className="text-center text-gray-400 py-8">
                  Chưa có người chơi nào
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
