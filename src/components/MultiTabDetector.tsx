import { useEffect, useState, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'

const STORAGE_KEY_PREFIX = 'forex-game-tab-id'
const HEARTBEAT_INTERVAL = 1000 // 1 second
const TAB_TIMEOUT = 2000 // 2 seconds - reduced for faster refresh detection
const LOCK_TIMEOUT = 500 // 500ms for acquiring lock - increased to handle refresh delays

export function MultiTabDetector() {
  const location = useLocation()
  const [showWarning, setShowWarning] = useState(false)
  const [tabId] = useState(() => `${Date.now()}-${Math.random().toString(36).substring(7)}`)
  const [isMainTab, setIsMainTab] = useState(false)
  const blockingOverlayRef = useRef<HTMLDivElement>(null)
  
  // Don't run the detector on admin pages
  if (location.pathname.startsWith('/admin')) {
    return null
  }
  
  // Create a storage key based on the current route
  const storageKey = `${STORAGE_KEY_PREFIX}-${location.pathname}`

  // Add a full-page blocking overlay when warning is shown
  useEffect(() => {
    if (showWarning) {
      // Add styles to body to prevent any interaction
      document.body.style.overflow = 'hidden'
      document.body.style.pointerEvents = 'none'
      
      // Create a persistent overlay
      const overlay = document.createElement('div')
      overlay.id = 'tab-blocker-overlay'
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        z-index: 9998;
        pointer-events: auto;
      `
      document.body.appendChild(overlay)
      
      // Monitor and recreate overlay if removed
      const observer = new MutationObserver((mutations) => {
        if (!document.getElementById('tab-blocker-overlay')) {
          document.body.appendChild(overlay)
        }
      })
      
      observer.observe(document.body, {
        childList: true,
        subtree: false
      })
      
      return () => {
        observer.disconnect()
        document.body.style.overflow = ''
        document.body.style.pointerEvents = ''
        const existingOverlay = document.getElementById('tab-blocker-overlay')
        if (existingOverlay) {
          existingOverlay.remove()
        }
      }
    }
  }, [showWarning])

  useEffect(() => {
    let heartbeatInterval: NodeJS.Timeout | null = null
    let isUnmounting = false

    // Try to acquire the lock and become the main tab
    const tryAcquireLock = async () => {
      const lockStart = Date.now()
      
      // Wait a bit to see if there's already an active tab
      await new Promise(resolve => setTimeout(resolve, LOCK_TIMEOUT))
      
      const stored = localStorage.getItem(storageKey)
      if (stored) {
        try {
          const { id, timestamp } = JSON.parse(stored)
          const now = Date.now()
          
          // If there's a recent heartbeat from another tab
          if (id !== tabId && now - timestamp < TAB_TIMEOUT) {
            // Double-check: wait a bit more and verify the other tab is still active
            await new Promise(resolve => setTimeout(resolve, 300))
            const recheck = localStorage.getItem(storageKey)
            if (recheck) {
              const recheckData = JSON.parse(recheck)
              // If the timestamp hasn't updated, the other tab might be dead/refreshing
              if (recheckData.timestamp === timestamp) {
                // Claim the lock since the other tab isn't updating
                localStorage.setItem(
                  storageKey,
                  JSON.stringify({ id: tabId, timestamp: Date.now() })
                )
                setIsMainTab(true)
                return true
              }
              // If it's still recent and updating, then it's a real other tab
              if (recheckData.id !== tabId && Date.now() - recheckData.timestamp < TAB_TIMEOUT) {
                setShowWarning(true)
                setIsMainTab(false)
                return false
              }
            }
          }
        } catch (e) {
          // Invalid data, clear it
          localStorage.removeItem(storageKey)
        }
      }
      
      // No active tab found, claim it
      localStorage.setItem(
        storageKey,
        JSON.stringify({ id: tabId, timestamp: Date.now() })
      )
      setIsMainTab(true)
      return true
    }

    // Update heartbeat for this tab
    const updateHeartbeat = () => {
      if (!showWarning && isMainTab) {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ id: tabId, timestamp: Date.now() })
        )
      }
    }

    // Check if another tab became active
    const checkForOtherTabs = () => {
      const stored = localStorage.getItem(storageKey)
      if (stored) {
        try {
          const { id, timestamp } = JSON.parse(stored)
          const now = Date.now()
          
          // If there's a recent heartbeat from another tab
          if (id !== tabId && now - timestamp < TAB_TIMEOUT) {
            if (isMainTab) {
              // We were the main tab but another tab took over
              setIsMainTab(false)
              setShowWarning(true)
            }
            return true
          }
        } catch (e) {
          // Invalid data
        }
      }
      return false
    }

    // Initialize
    const init = async () => {
      const acquired = await tryAcquireLock()
      
      if (acquired && !isUnmounting) {
        // Set up heartbeat interval
        heartbeatInterval = setInterval(() => {
          if (checkForOtherTabs()) {
            if (heartbeatInterval) clearInterval(heartbeatInterval)
            return
          }
          updateHeartbeat()
        }, HEARTBEAT_INTERVAL)
      }
    }

    // Listen for storage changes from other tabs
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === storageKey && e.newValue) {
        try {
          const { id, timestamp } = JSON.parse(e.newValue)
          const now = Date.now()
          if (id !== tabId && now - timestamp < TAB_TIMEOUT) {
            setShowWarning(true)
            setIsMainTab(false)
            if (heartbeatInterval) {
              clearInterval(heartbeatInterval)
              heartbeatInterval = null
            }
          }
        } catch (e) {
          // Ignore invalid data
        }
      }
    }

    window.addEventListener('storage', handleStorageChange)
    init()

    // Clean up on unmount
    return () => {
      isUnmounting = true
      if (heartbeatInterval) clearInterval(heartbeatInterval)
      window.removeEventListener('storage', handleStorageChange)
      
      // Only clear if this tab owns the heartbeat
      if (isMainTab) {
        const stored = localStorage.getItem(storageKey)
        if (stored) {
          try {
            const { id } = JSON.parse(stored)
            if (id === tabId) {
              localStorage.removeItem(storageKey)
            }
          } catch (e) {
            // Ignore
          }
        }
      }
    }
  }, [tabId, showWarning, isMainTab, storageKey, location.pathname])

  // Prevent any interaction with the page if warning is shown
  useEffect(() => {
    if (showWarning) {
      const preventInteraction = (e: Event) => {
        e.preventDefault()
        e.stopPropagation()
        return false
      }
      
      // Block various events
      const events = ['click', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'keydown', 'keyup']
      events.forEach(event => {
        document.addEventListener(event, preventInteraction, true)
      })
      
      return () => {
        events.forEach(event => {
          document.removeEventListener(event, preventInteraction, true)
        })
      }
    }
  }, [showWarning])

  if (!showWarning) return null

  return (
    <>
      {/* Fallback blocking overlay - just blocks interaction, no text */}
      <div
        ref={blockingOverlayRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          zIndex: 9998,
          pointerEvents: 'auto'
        }}
      />
      
      <Dialog open={true} onOpenChange={() => {}}>
        <DialogContent 
          className="sm:max-w-md" 
          onInteractOutside={(e) => e.preventDefault()}
          style={{ zIndex: 9999 }}
        >
          <DialogHeader>
            <DialogTitle>Multiple Tabs Detected</DialogTitle>
            <DialogDescription className="pt-4">
              This page is already open in another tab. Only one tab per page is allowed. Please close this tab.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center pt-4">
            <button
              onClick={() => window.close()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Close This Tab
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
