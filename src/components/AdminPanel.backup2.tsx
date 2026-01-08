import { useState, useEffect } from 'react'
import { Activity, Users, TrendingUp, Play, Clock } from 'lucide-react'
import { supabase } from '../lib/supabase'

export const AdminPanel: React.FC = () => {
  const [currentPrice, setCurrentPrice] = useState(2000)
  const [currentRound, setCurrentRound] = useState<any>(null)
  const [users, setUsers] = useState<any[]>([])
  const [isUpdating, setIsUpdating] = useState(false)
  const [autoMode, setAutoMode] = useState(false)
  const [countdown, setCountdown] = useState(15)

  useEffect(() => {
    loadCurrentPrice()
    loadCurrentRound()
    loadUsers()
  }, [])

  useEffect(() => {
    if (autoMode && currentRound) {
      const interval = setInterval(() => {
        const startTime = new Date(currentRound.start_time).getTime()
        const now = Date.now()
        const elapsed = Math.floor((now - startTime) / 1000)
        const remaining = Math.max(0, 15 - elapsed)
        setCountdown(remaining)

        if (remaining === 0) {
          // Auto complete round and start new one
          completeRoundAndStartNew()
        }
      }, 1000)

      return () => clearInterval(interval)
    }
  }, [autoMode, currentRound])

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
      const startTime = new Date(data.start_time).getTime()
      const now = Date.now()
      const elapsed = Math.floor((now - startTime) / 1000)
      const remaining = Math.max(0, 15 - elapsed)
      setCountdown(remaining)
    }
  }

  const loadUsers = async () => {
    const { data } = await supabase
      .from('users')
      .select('*')
      .order('balance', { ascending: false })

    if (data) {
      setUsers(data)
    }
  }

  const startNewRound = async () => {
    setIsUpdating(true)
    try {
      // Get the latest round number
      const { data: lastRound } = await supabase
        .from('rounds')
        .select('round_number')
        .order('round_number', { ascending: false })
        .limit(1)
        .single()

      const nextRoundNumber = (lastRound?.round_number || 0) + 1

      // Get current price
      const { data: priceData } = await supabase
        .from('gold_prices')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(1)
        .single()

      const startPrice = priceData?.price || currentPrice

      // Create new round
      const { data: newRound, error } = await supabase
        .from('rounds')
        .insert([{
          round_number: nextRoundNumber,
          start_price: startPrice,
          status: 'active'
        }])
        .select()
        .single()

      if (!error && newRound) {
        setCurrentRound(newRound)
        setCountdown(15)
        alert(`Vòng ${nextRoundNumber} đã bắt đầu! Giá bắt đầu: $${startPrice.toFixed(2)}`)
      }
    } catch (error) {
      console.error('Error starting round:', error)
    } finally {
      setIsUpdating(false)
    }
  }

  const completeRoundAndStartNew = async () => {
    if (!currentRound) return

    setIsUpdating(true)
    try {
      // Generate new price with random change
      const change = (Math.random() - 0.5) * 20
      const newPrice = Math.max(1000, currentPrice + change)

      // Insert new price
      await supabase
        .from('gold_prices')
        .insert([{ price: newPrice, change }])

      // Update current round status and end price
      await supabase
        .from('rounds')
        .update({
          end_price: newPrice,
          end_time: new Date().toISOString(),
          status: 'completed'
        })
        .eq('id', currentRound.id)

      // Calculate bet results
      const { data: bets } = await supabase
        .from('bets')
        .select('*')
        .eq('round_id', currentRound.id)
        .eq('result', 'pending')

      if (bets) {
        for (const bet of bets) {
          const priceIncreased = newPrice > currentRound.start_price
          const won = (bet.prediction === 'up' && priceIncreased) || 
                      (bet.prediction === 'down' && !priceIncreased)

          const result = won ? 'won' : 'lost'
          const profit = won ? bet.bet_amount : 0

          // Update bet result
          await supabase
            .from('bets')
            .update({ result, profit })
            .eq('id', bet.id)

          // Update user balance if won
          if (won) {
            const { data: userData } = await supabase
              .from('users')
              .select('balance')
              .eq('id', bet.user_id)
              .single()

            if (userData) {
              await supabase
                .from('users')
                .update({ balance: userData.balance + bet.bet_amount + profit })
                .eq('id', bet.user_id)
            }
          }
        }
      }

      setCurrentPrice(newPrice)

      // Start new round automatically if autoMode is on
      if (autoMode) {
        setTimeout(() => {
          startNewRound()
        }, 1000)
      } else {
        setCurrentRound(null)
      }

      await loadUsers()
    } catch (error) {
      console.error('Error completing round:', error)
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-gray-900 to-gray-800 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-gray-800 rounded-lg shadow-xl p-6 mb-6 border border-purple-700">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">Admin Panel</h1>
              <p className="text-gray-400">Quản lý vòng chơi và theo dõi người chơi</p>
            </div>
            <Activity className="w-12 h-12 text-purple-500" />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Current Price */}
          <div className="bg-gray-800 rounded-lg shadow-xl p-6 border border-purple-700">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-6 h-6 text-yellow-500" />
              <h2 className="text-xl font-bold text-white">Giá Vàng Hiện Tại</h2>
            </div>
            <div className="text-5xl font-bold text-yellow-500 mb-2">
              ${currentPrice.toFixed(2)}
            </div>
          </div>

          {/* Current Round */}
          <div className="bg-gray-800 rounded-lg shadow-xl p-6 border border-purple-700">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-6 h-6 text-blue-500" />
              <h2 className="text-xl font-bold text-white">Vòng Hiện Tại</h2>
            </div>
            {currentRound ? (
              <div>
                <div className="text-3xl font-bold text-white mb-2">
                  Vòng #{currentRound.round_number}
                </div>
                <div className="text-gray-400 mb-2">
                  Giá bắt đầu: ${currentRound.start_price.toFixed(2)}
                </div>
                <div className={`text-5xl font-bold ${countdown <= 5 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                  {countdown}s
                </div>
              </div>
            ) : (
              <div className="text-gray-400 text-lg">Chưa có vòng nào đang chạy</div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="bg-gray-800 rounded-lg shadow-xl p-6 mb-6 border border-purple-700">
          <h2 className="text-xl font-bold text-white mb-4">Điều Khiển</h2>
          
          <div className="flex items-center gap-4 mb-4">
            <label className="flex items-center gap-2 text-white cursor-pointer">
              <input
                type="checkbox"
                checked={autoMode}
                onChange={(e) => setAutoMode(e.target.checked)}
                className="w-5 h-5"
              />
              <span>Chế độ tự động (15s/vòng)</span>
            </label>
          </div>

          <div className="flex gap-4">
            {!currentRound && (
              <button
                onClick={startNewRound}
                disabled={isUpdating}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-bold rounded-lg transition-all disabled:opacity-50"
              >
                <Play className="w-5 h-5" />
                Bắt Đầu Vòng Mới
              </button>
            )}
            
            {currentRound && !autoMode && (
              <button
                onClick={completeRoundAndStartNew}
                disabled={isUpdating}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold rounded-lg transition-all disabled:opacity-50"
              >
                <Play className="w-5 h-5" />
                Kết Thúc Vòng & Bắt Đầu Vòng Mới
              </button>
            )}
          </div>
        </div>

        {/* Users List */}
        <div className="bg-gray-800 rounded-lg shadow-xl p-6 border border-purple-700">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-6 h-6 text-blue-500" />
            <h2 className="text-xl font-bold text-white">Người Chơi ({users.length})</h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Tên</th>
                  <th className="text-right py-3 px-4 text-gray-400 font-medium">Số Dư</th>
                  <th className="text-right py-3 px-4 text-gray-400 font-medium">Ngày Tham Gia</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-gray-700 hover:bg-gray-750">
                    <td className="py-3 px-4 text-white">{user.name}</td>
                    <td className="py-3 px-4 text-right">
                      <span className={`font-bold ${user.balance >= 10000 ? 'text-green-400' : user.balance < 5000 ? 'text-red-400' : 'text-yellow-400'}`}>
                        ${user.balance.toFixed(2)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-gray-400 text-sm">
                      {new Date(user.created_at).toLocaleString('vi-VN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
