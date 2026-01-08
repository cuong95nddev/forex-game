import { useEffect } from 'react'
import { NameInput } from '../components/NameInput'
import TradingInterface from '../components/TradingInterface'
import { useStore } from '../store/useStore'
import { toast } from 'sonner'

export default function HomePage() {
  const { user, loading, loadUser, initializeUser, subscribeToGoldPrice, subscribeToBroadcast, subscribeToRounds, subscribeToUsers, subscribeToAdminPresence, updateUserPresence, isAdminOnline, loadOnlineUsers, subscribeToSkillUsage, subscribeToActiveEffects } = useStore()

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
      console.log('User loaded, subscribing to user changes and skills...')
      subscribeToUsers()
      subscribeToSkillUsage()
      subscribeToActiveEffects()
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
      <div className="min-h-screen flex items-center justify-center bg-[#0b0f13] p-6">
        <div className="text-center space-y-6 max-w-md w-full">
          <div className="relative">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-[#ef4444]/20 border-t-[#ef4444] mx-auto"></div>
            <svg className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-[#ef4444]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          
          <div>
            <h1 className="text-xl font-bold text-white uppercase tracking-wider mb-2">
              Waiting for Server
            </h1>
            <p className="text-[#94a3b8] text-sm">
              The admin server is not online yet
            </p>
            <p className="text-[#64748b] text-xs mt-2">
              Please wait a moment or refresh the page
            </p>
          </div>
          
          <div className="mt-8 bg-[#1e293b] rounded-lg border border-[#334155] p-6">
            <button
              onClick={() => window.location.reload()}
              className="w-full px-6 py-2 bg-[#ef4444] hover:bg-[#dc2626] text-white rounded-lg transition-colors text-xs uppercase tracking-wider font-bold"
            >
              Refresh Page
            </button>
          </div>

          <div className="flex justify-center gap-2">
            <div className="h-2 w-2 rounded-full bg-[#ef4444] animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="h-2 w-2 rounded-full bg-[#ef4444] animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="h-2 w-2 rounded-full bg-[#ef4444] animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        </div>
      </div>
    )
  }

  // Trading interface for existing users
  return <TradingInterface />
}
