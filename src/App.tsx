import { useEffect, useState } from 'react'
import { NameInput } from './components/NameInput'
import TradingInterface from './components/TradingInterface'
import AdminPanel from './components/AdminPanel'
import { useStore } from './store/useStore'

function App() {
  const { user, loading, loadUser, initializeUser, subscribeToGoldPrice, subscribeToRounds } = useStore()
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    console.log('App mounted, loading data...')
    loadUser()
    
    // Subscribe to real-time updates
    subscribeToGoldPrice()
    subscribeToRounds()
    
    // Check if admin mode is enabled via URL
    const params = new URLSearchParams(window.location.search)
    setIsAdmin(params.get('admin') === 'true')
  }, [loadUser, subscribeToGoldPrice, subscribeToRounds])

  console.log('App render:', { user, loading, isAdmin })

  const handleNameSubmit = async (name: string) => {
    try {
      await initializeUser(name)
    } catch (error: any) {
      console.error('Error creating user:', error)
      const errorMessage = error?.message || 'Unknown error'
      alert(`Có lỗi xảy ra khi tạo người dùng!\n\nChi tiết: ${errorMessage}`)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-yellow-500 mx-auto mb-4"></div>
          <p className="text-white text-xl">Đang tải...</p>
        </div>
      </div>
    )
  }

  // Admin panel
  if (isAdmin) {
    return <AdminPanel />
  }

  // Name input for new users
  if (!user) {
    return <NameInput onSubmit={handleNameSubmit} />
  }

  // Trading interface for existing users
  return <TradingInterface />
}

export default App
