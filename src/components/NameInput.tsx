import { useState, useEffect } from 'react'
import { User, Coins, TrendingUp, Lock } from 'lucide-react'
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
    
    const checkGameStatus = async () => {
      // Check if there's an active round or if countdown has started (countdown <= 15 means game is active)
      const { data: roundData, error } = await supabase
        .from('rounds')
        .select('*')
        .eq('status', 'active')
        .order('round_number', { ascending: false })
        .limit(1)
        .single()
      
      // Game is started if there's an active round (regardless of error)
      const hasActiveRound = roundData && !error
      setGameStarted(!!hasActiveRound)
      setChecking(false)
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
            // If a new round is inserted or updated and it's active, set gameStarted immediately
            const round = payload.new as any
            if (round && round.status === 'active') {
              setGameStarted(true)
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
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim() && !gameStarted) {
      onSubmit(name.trim())
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#0f172a]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-[#f59e0b] mx-auto mb-4"></div>
          <p className="text-xl text-white">Checking game status...</p>
        </div>
      </div>
    )
  }

  // Show locked screen if game already started
  if (gameStarted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#0f172a]">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <div className="p-4 rounded-2xl bg-[#1e293b] border border-[#334155] shadow-xl">
                <Lock className="w-12 h-12 text-red-500" />
              </div>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">Game in Progress</h1>
            <p className="text-[#94a3b8]">Cannot join while a round is active</p>
          </div>

          <Card className="bg-[#1e293b] border-[#334155] shadow-2xl">
            <CardContent className="pt-6">
              <div className="text-center py-8">
                <div className="mb-4">
                  <div className="inline-block p-4 rounded-full bg-red-500/10 border border-red-500/20">
                    <Lock className="w-8 h-8 text-red-500" />
                  </div>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Joining Disabled</h3>
                <p className="text-[#94a3b8] mb-6">
                  A trading round is currently active. Please wait for the current round to end before joining.
                </p>
                <Button
                  onClick={() => window.location.reload()}
                  className="w-full h-12 bg-[#334155] hover:bg-[#475569] text-white font-bold text-lg rounded-md transition-all"
                >
                  Refresh Page
                </Button>
              </div>
            </CardContent>
          </Card>
          
          <div className="text-center mt-6 text-[#64748b] text-xs">
            Wait for the round to complete, then refresh to join
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#0f172a]">
      <div className="max-w-md w-full">
         <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <div className="p-4 rounded-2xl bg-[#1e293b] border border-[#334155] shadow-xl">
                 <TrendingUp className="w-12 h-12 text-[#f59e0b]" />
              </div>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">FOREX TRADING</h1>
            <p className="text-[#94a3b8]">Enter the market and start trading</p>
         </div>

        <Card className="bg-[#1e293b] border-[#334155] shadow-2xl">
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="name" className="text-xs font-bold text-[#94a3b8] uppercase tracking-wider block">
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
                     placeholder="ENTER YOUR NAME"
                     className="bg-[#0b0f13] border-[#334155] text-white pl-10 h-12 font-bold placeholder:text-[#334155] focus-visible:ring-1 focus-visible:ring-[#f59e0b] focus-visible:border-[#f59e0b]"
                     required
                     autoFocus
                     autoComplete="off"
                   />
                </div>
              </div>
              
              <Button
                type="submit"
                className="w-full h-12 bg-[#f59e0b] hover:bg-[#d97706] text-black font-bold text-lg rounded-md transition-all shadow-lg shadow-[#f59e0b]/20"
              >
                START TRADING
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
