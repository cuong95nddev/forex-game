import { useEffect } from 'react'
import { NameInput } from '../components/NameInput'
import TradingInterface from '../components/TradingInterface'
import { useStore } from '../store/useStore'
import { toast } from 'sonner'

export default function HomePage() {
  const { user, loading, loadUser, initializeUser, subscribeToGoldPrice, subscribeToBroadcast, subscribeToRounds, subscribeToUsers } = useStore()

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

  // Subscribe to user changes after user is loaded
  useEffect(() => {
    if (user) {
      console.log('User loaded, subscribing to user changes...')
      subscribeToUsers()
    }
  }, [user])

  const handleNameSubmit = async (name: string) => {
    try {
      await initializeUser(name)
    } catch (error: any) {
      console.error('Error creating user:', error)
      const errorMessage = error?.message || 'Unknown error'
      toast.error(`Có lỗi xảy ra khi tạo người dùng!\n\nChi tiết: ${errorMessage}`)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-xl">Đang tải...</p>
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
