import { useEffect } from 'react'
import AdminPanel from '../components/AdminPanel'
import { useStore } from '../store/useStore'

export default function AdminPage() {
  const { subscribeToGoldPrice, subscribeToBroadcast, subscribeToRounds } = useStore()

  useEffect(() => {
    console.log('AdminPage mounted, subscribing to real-time updates...')
    
    // Subscribe to real-time updates
    subscribeToGoldPrice()
    subscribeToBroadcast()
    subscribeToRounds()
    
    // Cleanup function to unsubscribe when component unmounts
    return () => {
      console.log('AdminPage unmounting, cleaning up subscriptions...')
    }
  }, [])

  return <AdminPanel />
}
