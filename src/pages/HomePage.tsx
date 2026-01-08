import { useEffect } from 'react'
import { NameInput } from '../components/NameInput'
import TradingInterface from '../components/TradingInterface'
import { useStore } from '../store/useStore'

export default function HomePage() {
  const { user, loading, loadUser, initializeUser, subscribeToGoldPrice, subscribeToBroadcast, subscribeToRounds } = useStore()

  useEffect(() => {
    console.log('HomePage mounted, loading data...')
    loadUser()
    
    // Subscribe to real-time updates
    subscribeToGoldPrice()
    subscribeToBroadcast()
    subscribeToRounds()
    
    // Cleanup function to unsubscribe when component unmounts
    return () => {
      console.log('HomePage unmounting, cleaning up subscriptions...')
    }
  }, [])

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

  // Name input for new users
  if (!user) {
    return <NameInput onSubmit={handleNameSubmit} />
  }

  // Trading interface for existing users
  return <TradingInterface />
}
