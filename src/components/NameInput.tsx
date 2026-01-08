import { useState, useEffect } from 'react'
import { User, Coins, TrendingUp } from 'lucide-react'
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

  useEffect(() => {
    // Load default balance from settings
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
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim()) {
      onSubmit(name.trim())
    }
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
