import { useState, useEffect, useCallback } from 'react'
import { User, Coins, TrendingUp, Lock, Hourglass, RotateCw, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '../lib/supabase'

interface NameInputProps {
  onSubmit: (name: string) => void
}

export const NameInput: React.FC<NameInputProps> = ({ onSubmit }) => {
  const [name, setName] = useState('')
  const [defaultBalance, setDefaultBalance] = useState(10000)
  const [gameStarted, setGameStarted] = useState(false)
  const [checking, setChecking] = useState(true)

  const checkGameStatus = useCallback(async () => {
    setChecking(true)
    // Check if there's an active round or if countdown has started (countdown <= 15 means game is active)
    const { data: roundData, error } = await supabase
      .from('rounds')
      .select('*')
      .eq('status', 'active')
      .order('round_number', { ascending: false })
      .limit(1)
      .single()
    
    // Game is started if there's an active round (regardless of error, assuming no round = allow)
    const hasActiveRound = roundData && !error
    setGameStarted(!!hasActiveRound)
    setChecking(false)
  }, [])

  useEffect(() => {
    // Load default balance from settings and check if game is active
    const loadSettings = async () => {
      const { data } = await supabase
        .from('game_settings')
        .select('default_user_balance')
        .limit(1)
        .single()
      
      if (data?.default_user_balance) {
        setDefaultBalance(data.default_user_balance)
      }
    }
    
    loadSettings()
    checkGameStatus()
    
    // Subscribe to round changes
    const roundsChannel = supabase
      .channel('rounds-status-check')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rounds',
        },
        (payload) => {
          // Handle round changes immediately to prevent flashing
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const round = payload.new as any
            if (round) {
               if (round.status === 'active') {
                   setGameStarted(true)
               } else if (round.status === 'completed') {
                   // Round over, re-check to confirm allows new game start state
                   // Or just set to false if we trust this event entirely.
                   // Let's re-check to be safe as there might be another round queued immediately?
                   // Actually in this app, Admin creates rounds manually or auto.
                   // If auto, a new round might appear instantly.
                   // But if 'completed' event comes, we should update.
                   checkGameStatus() 
               }
            }
          } else if (payload.eventType === 'DELETE') {
            // If round is deleted, check if there are any other active rounds
            checkGameStatus()
          }
        }
      )
      .subscribe()
    
    return () => {
      roundsChannel.unsubscribe()
    }
  }, [checkGameStatus])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim() && !gameStarted) {
      onSubmit(name.trim())
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#0f172a]">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
             <div className="absolute inset-0 bg-[#f59e0b] blur-xl opacity-20 rounded-full animate-pulse"></div>
             <Loader2 className="w-12 h-12 text-[#f59e0b] animate-spin relative z-10" />
          </div>
          <p className="text-sm font-bold text-[#94a3b8] uppercase tracking-wider">Connecting to Exchange...</p>
        </div>
      </div>
    )
  }

  // Show locked screen if game already started
  if (gameStarted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#0b0f13]">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="relative">
            <div className="bg-[#ef4444]/10 p-6 rounded-full border-2 border-[#ef4444]/30 inline-flex mx-auto">
              <Hourglass className="w-12 h-12 text-[#ef4444] animate-[spin_3s_linear_infinite]" />
            </div>
          </div>
          
          <div>
            <h3 className="text-xl font-bold text-white uppercase tracking-wider mb-2">Game in Progress</h3>
            <p className="text-[#94a3b8] text-sm">
              A trading round is currently active
            </p>
            <p className="text-[#64748b] text-xs mt-2">
              Access is temporarily locked until the round completes
            </p>
          </div>

          <div className="mt-8 bg-[#1e293b] rounded-lg border border-[#334155] p-6">
            <Button
              onClick={() => checkGameStatus()}
              variant="outline"
              className="w-full border-[#334155] text-[#94a3b8] hover:text-white hover:bg-[#0f172a] h-10 text-xs uppercase tracking-wider font-bold"
            >
              <RotateCw className="w-3 h-3 mr-2" />
              Check Status
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#0b0f13]">
      <div className="max-w-md w-full">
         <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <div className="p-4 rounded-2xl bg-[#1e293b] border border-[#334155] shadow-xl">
                 <TrendingUp className="w-12 h-12 text-[#f59e0b]" />
              </div>
            </div>
            <h1 className="text-xl font-bold text-white mb-2 uppercase tracking-wider">Forex Trading</h1>
            <p className="text-[#94a3b8] text-sm">Enter the market and start trading</p>
         </div>

        <Card className="bg-[#1e293b] border-[#334155] shadow-2xl">
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="name" className="text-xs font-bold text-[#94a3b8] uppercase tracking-widest block">
                  Trader Name
                </label>
                <div className="relative">
                   <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748b]">
                      <User size={18} />
                   </span>
                   <Input
                     type="text"
                     id="name"
                     value={name}
                     onChange={(e) => setName(e.target.value)}
                     placeholder="Enter your name"
                     className="bg-[#0b0f13] border-[#334155] text-white pl-10 h-12 placeholder:text-[#334155] focus-visible:ring-1 focus-visible:ring-[#f59e0b] focus-visible:border-[#f59e0b]"
                     required
                     autoFocus
                     autoComplete="off"
                   />
                </div>
              </div>
              
              <Button
                type="submit"
                className="w-full h-12 bg-[#f59e0b] hover:bg-[#d97706] text-black font-bold text-sm uppercase tracking-wider rounded-md transition-all shadow-lg shadow-[#f59e0b]/20"
              >
                Start Trading
              </Button>
            </form>
            
            <div className="mt-6 pt-6 border-t border-[#334155]">
               <div className="bg-[#0f172a]/50 rounded-lg p-3 border border-[#334155]/50 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[#94a3b8] text-xs font-bold uppercase">
                     <Coins size={14} className="text-[#f59e0b]" />
                     Starting Capital
                  </div>
                  <span className="font-mono text-[#f59e0b] font-bold text-sm">
                     ${defaultBalance.toLocaleString()}
                  </span>
               </div>
            </div>
          </CardContent>
        </Card>
        
        <div className="text-center mt-6 text-[#64748b] text-xs">
           Forex Trading Game &copy; 2026
        </div>
      </div>
    </div>
  )
}
