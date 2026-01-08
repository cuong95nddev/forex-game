import { useEffect } from 'react'
import { NameInput } from '../components/NameInput'
import TradingInterface from '../components/TradingInterface'
import { useStore } from '../store/useStore'
import { toast } from 'sonner'

export default function HomePage() {
  const { user, loading, loadUser, initializeUser, subscribeToGoldPrice, subscribeToBroadcast, subscribeToRounds, subscribeToUsers, subscribeToAdminPresence, updateUserPresence, isAdminOnline, loadOnlineUsers } = useStore()

  useEffect(() => {
    console.log('HomePage mounted, loading data...')
    loadUser()
    
    // Subscribe to real-time updates
    subscribeToGoldPrice()
    subscribeToBroadcast()
    subscribeToRounds()
    subscribeToAdminPresence()
    
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

  // Show waiting screen if admin is offline
  if (!isAdminOnline) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="text-center p-8 max-w-md">
          <div className="mb-6">
            <div className="relative inline-block">
              <div className="animate-pulse rounded-full h-24 w-24 bg-yellow-500/20 mx-auto mb-4 flex items-center justify-center">
                <svg className="w-12 h-12 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="absolute top-0 right-0 h-3 w-3 bg-red-500 rounded-full animate-ping"></div>
              <div className="absolute top-0 right-0 h-3 w-3 bg-red-500 rounded-full"></div>
            </div>
          </div>
          
          <h1 className="text-2xl font-bold text-white mb-3">
            Waiting for Server
          </h1>
          <p className="text-slate-400 mb-6">
            The admin server is not online yet. Please wait a moment...
          </p>
          
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Refresh Page
            </button>
          </div>
          
          <div className="mt-6 flex items-center justify-center gap-2 text-slate-500">
            <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        </div>
      </div>
    )
  }

  // Trading interface for existing users
  return <TradingInterface />
}
