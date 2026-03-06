import { useEffect } from 'react'
import { NameInput } from '../components/NameInput'
import TradingInterface from '../components/TradingInterface'
import { useStore } from '../store/useStore'
import { toast } from 'sonner'

export default function HomePage() {
  const { user, loading, loadUser, initializeUser, subscribeToGoldPrice, subscribeToBroadcast, subscribeToRounds, subscribeToUsers, updateUserPresence, loadOnlineUsers } = useStore()

  useEffect(() => {
    console.log('HomePage mounted, loading data...')
    loadUser()
    
    // Subscribe to real-time updates
    subscribeToGoldPrice()
    subscribeToBroadcast()
    subscribeToRounds()
    // Load online users periodically
    loadOnlineUsers()
    const onlineUsersInterval = setInterval(loadOnlineUsers, 1000) // Update every 1 second
    
    // Cleanup function to unsubscribe when component unmounts
    return () => {
      console.log('HomePage unmounting, cleaning up subscriptions...')
      clearInterval(onlineUsersInterval)
    }
  }, [])

  // Subscribe to user changes and update presence after user is loaded
  useEffect(() => {
    if (user) {
      console.log('User loaded, subscribing to user changes...')
      subscribeToUsers()
      updateUserPresence()
    }
  }, [user])

  const handleNameSubmit = async (name: string) => {
    try {
      await initializeUser(name)
    } catch (error: any) {
      console.error('Error creating user:', error)
      const errorMessage = error?.message || 'Unknown error'
      toast.error(`Error creating user!\n\nDetails: ${errorMessage}`)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-xl">Loading...</p>
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
