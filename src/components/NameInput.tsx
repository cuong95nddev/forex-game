import { useState } from 'react'
import { User } from 'lucide-react'

interface NameInputProps {
  onSubmit: (name: string) => void
}

export const NameInput: React.FC<NameInputProps> = ({ onSubmit }) => {
  const [name, setName] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim()) {
      onSubmit(name.trim())
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-lg shadow-2xl p-8 max-w-md w-full border border-gray-700">
        <div className="flex justify-center mb-6">
          <div className="bg-yellow-500 p-4 rounded-full">
            <User className="w-12 h-12 text-gray-900" />
          </div>
        </div>
        
        <h1 className="text-3xl font-bold text-center mb-2 text-white">
          Chào mừng đến Game Vàng
        </h1>
        
        <p className="text-gray-400 text-center mb-8">
          Nhập tên của bạn để bắt đầu giao dịch
        </p>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
              Tên của bạn
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-white placeholder-gray-400"
              placeholder="Nhập tên..."
              required
              autoFocus
            />
          </div>
          
          <button
            type="submit"
            className="w-full bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-bold py-3 px-4 rounded-lg transition duration-200 transform hover:scale-105"
          >
            Bắt đầu chơi
          </button>
        </form>
        
        <div className="mt-6 p-4 bg-gray-700 rounded-lg">
          <p className="text-sm text-gray-300">
            💰 Số dư ban đầu: <span className="font-bold text-yellow-500">$10,000</span>
          </p>
        </div>
      </div>
    </div>
  )
}
