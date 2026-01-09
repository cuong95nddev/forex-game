import { useEffect, useState, useRef } from 'react'
import { TrendingUp, TrendingDown, Clock, DollarSign, Users, Target } from 'lucide-react'
import { useStore } from '../store/useStore'
import TradingChart from './TradingChart'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export default function TradingInterface() {
  const { 
    user, 
    goldPrice, 
    currentRound, 
    userBet, 
    countdown, 
    placeBet, 
    recentBets, 
    loadRecentBets,
    activeBets,
    loadActiveBets,
    priceHistory,
    loadPriceHistory,
    winRate,
    onlineUsers,
    onlineUsersList,
    loadOnlineUsers,
    allUsers,
    loadAllUsers,
    lastWinAmount,
    setLastWinAmount,
    lastLossAmount,
    setLastLossAmount,
    lastPenaltyAmount,
    setLastPenaltyAmount,
    isWaitingForNewGame,
    isGameCompleted,
    leaderboard,
    maxRound,
    userSkills,
    loadUserSkills,
    loadSkillDefinitions,
    activateSkill,
    subscribeToSkillSignals,
    incomingSkillEffect,
    clearIncomingSkillEffect,
    isFrozen,
    frozenUntilRound,
    checkFrozenStatus,
    subscribeToFrozenStatus
  } = useStore()
  
  const [betAmount, setBetAmount] = useState('100')
  const [chartPrices, setChartPrices] = useState<Array<{
    time: number
    value: number
  }>>([])
  const [priceFlash, setPriceFlash] = useState<'up' | 'down' | null>(null)
  const lastPriceRef = useRef<number | null>(null)
  const [balanceFlash, setBalanceFlash] = useState(false)
  const lastBalanceRef = useRef<number | null>(null)
  const [showTargetDialog, setShowTargetDialog] = useState(false)
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null)

  // Flash animation when price changes
  useEffect(() => {
    if (goldPrice && lastPriceRef.current !== null) {
      if (goldPrice.price > lastPriceRef.current) {
        setPriceFlash('up')
      } else if (goldPrice.price < lastPriceRef.current) {
        setPriceFlash('down')
      }
      
      const timer = setTimeout(() => setPriceFlash(null), 600)
      return () => clearTimeout(timer)
    }
    if (goldPrice) {
      lastPriceRef.current = goldPrice.price
    }
  }, [goldPrice?.price])

  // Flash animation when balance changes
  useEffect(() => {
    if (user && lastBalanceRef.current !== null && user.balance !== lastBalanceRef.current) {
      setBalanceFlash(true)
      const timer = setTimeout(() => setBalanceFlash(false), 1000)
      return () => clearTimeout(timer)
    }
    if (user) {
      lastBalanceRef.current = user.balance
    }
  }, [user?.balance])

  useEffect(() => {
    loadRecentBets()
    loadActiveBets()
    loadPriceHistory()
    loadOnlineUsers()
    loadAllUsers()
    loadUserSkills()
    loadSkillDefinitions()
    subscribeToSkillSignals()
    subscribeToFrozenStatus()
    checkFrozenStatus()
    
    // Refresh online users every 5 seconds
    const interval = setInterval(() => {
      loadOnlineUsers()
      loadAllUsers()
      loadActiveBets()
      loadUserSkills()
      checkFrozenStatus()
    }, 5000)
    
    return () => {
      clearInterval(interval)
    }
  }, [loadRecentBets, loadActiveBets, loadPriceHistory, loadOnlineUsers, loadAllUsers, loadUserSkills, loadSkillDefinitions, subscribeToSkillSignals, subscribeToFrozenStatus, checkFrozenStatus])

  useEffect(() => {
    // Convert price history to chart format
    if (priceHistory && priceHistory.length > 0) {
      const chartData = priceHistory.map(price => ({
        time: new Date(price.timestamp).getTime() / 1000,
        value: price.price
      }))
      setChartPrices(chartData)
    }
  }, [priceHistory])
  
  // Update chart in real-time as goldPrice changes
  useEffect(() => {
    if (goldPrice) {
      setChartPrices(prev => {
        const newPoint = {
          time: new Date(goldPrice.timestamp).getTime() / 1000,
          value: goldPrice.price
        }
        
        // Add new price point
        const updated = [...prev, newPoint]
        
        // Keep last 300 points (approx 10 mins) for better history context
        const maxPoints = 300
        if (updated.length > maxPoints) {
          return updated.slice(-maxPoints)
        }
        
        return updated
      })
    }
  }, [goldPrice])

  useEffect(() => {
    if (lastWinAmount !== null) {
       // Clear the win amount after 4 seconds to hide the animation
       const timer = setTimeout(() => {
          setLastWinAmount(null)
       }, 4000)
       return () => clearTimeout(timer)
    }
  }, [lastWinAmount, setLastWinAmount])

  useEffect(() => {
    if (lastLossAmount !== null) {
       // Clear the loss amount after 4 seconds to hide the animation
       const timer = setTimeout(() => {
          setLastLossAmount(null)
       }, 4000)
       return () => clearTimeout(timer)
    }
  }, [lastLossAmount, setLastLossAmount])

  useEffect(() => {
    if (lastPenaltyAmount !== null) {
       // Clear the penalty amount after 4 seconds to hide the animation
       const timer = setTimeout(() => {
          setLastPenaltyAmount(null)
       }, 4000)
       return () => clearTimeout(timer)
    }
  }, [lastPenaltyAmount, setLastPenaltyAmount])

  useEffect(() => {
    if (incomingSkillEffect !== null) {
       // If freezer skill, immediately check frozen status
       if (incomingSkillEffect.skill_id === 'freezer') {
          checkFrozenStatus()
       }
       
       // Clear the skill effect after 4 seconds to hide the animation
       const timer = setTimeout(() => {
          clearIncomingSkillEffect()
       }, 4000)
       return () => clearTimeout(timer)
    }
  }, [incomingSkillEffect, clearIncomingSkillEffect, checkFrozenStatus])

  const handleBet = async (prediction: 'up' | 'down') => {
    if (isFrozen) {
      toast.error(`🧊 You are frozen until end of round ${frozenUntilRound}!`)
      return
    }
    
    const amount = parseFloat(betAmount)
    if (isNaN(amount) || amount <= 0) {
      toast.error('Invalid amount!')
      return
    }
    
    if (!user || amount > user.balance) {
      toast.error('Insufficient balance!')
      return
    }

    const success = await placeBet(prediction, amount)
    if (success) {
      // Don't reset bet amount, keep it for fast trading
    }
  }

  if (!user || !goldPrice) {
    return (
      <div className="min-h-screen bg-[#0b0f13] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#f59e0b] mx-auto mb-4"></div>
          <p className="text-[#94a3b8]">Connecting to banana market... 🍌</p>
        </div>
      </div>
    )
  }

  // Show waiting state when admin is configuring new game or no active game
  if (isGameCompleted && leaderboard.length > 0 && maxRound) {
    return (
      <div className="min-h-screen bg-[#0b0f13] flex items-center justify-center p-4">
        <div className="max-w-5xl w-full">
          {/* Header Section */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-[#f7931a] to-[#f59e0b] mb-4 shadow-2xl shadow-[#f59e0b]/30">
              <span className="text-5xl">🏆</span>
            </div>
            <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">🍌 Banana Game Completed 🍌</h1>
            <p className="text-[#94a3b8] text-lg">Final banana standings after {maxRound} rounds</p>
          </div>
          
          {/* Leaderboard Container */}
          <div className="bg-[#1e293b] rounded-lg border border-[#334155] overflow-hidden shadow-2xl">
            {/* Leaderboard Header */}
            <div className="px-6 py-4 border-b border-[#334155] bg-[#1e293b]/50">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="text-[#f59e0b]">★</span>
                Final Standings
                <Badge className="ml-auto bg-[#2962ff] text-white border-0 text-xs font-semibold">
                  {leaderboard.length} Banana Traders
                </Badge>
              </h2>
            </div>
            
            <ScrollArea className="max-h-[540px]">
              {/* Table Header */}
              <div className="grid grid-cols-[80px_1fr_160px] gap-4 px-6 py-3 text-xs font-bold text-[#94a3b8] border-b border-[#334155] bg-[#1e293b] sticky top-0 z-10">
                <div>RANK</div>
                <div>BANANA TRADER</div>
                <div className="text-right">FINAL BALANCE</div>
              </div>
              
              {/* Leaderboard Items */}
              <div className="divide-y divide-[#334155]/50">
                {leaderboard.map((player, index) => {
                  const isCurrentUser = player.id === user?.id
                  const rankStyles = [
                    { bg: 'from-[#f7931a]/10 via-[#f7931a]/5', border: 'border-l-[#f7931a]', text: 'text-[#f7931a]', rank: '🥇', glow: 'shadow-[#f7931a]/10' },
                    { bg: 'from-[#c0c0c0]/10 via-[#c0c0c0]/5', border: 'border-l-[#c0c0c0]', text: 'text-[#c0c0c0]', rank: '🥈', glow: 'shadow-[#c0c0c0]/10' },
                    { bg: 'from-[#cd7f32]/10 via-[#cd7f32]/5', border: 'border-l-[#cd7f32]', text: 'text-[#cd7f32]', rank: '🥉', glow: 'shadow-[#cd7f32]/10' },
                  ]
                  const rankStyle = rankStyles[index] || { 
                    bg: 'from-transparent via-transparent', 
                    border: 'border-l-[#334155]', 
                    text: 'text-[#94a3b8]', 
                    rank: `${index + 1}`,
                    glow: ''
                  }
                  
                  return (
                    <div 
                      key={player.id} 
                      className={`grid grid-cols-[80px_1fr_160px] gap-4 px-6 py-4 border-l-[3px] ${rankStyle.border} bg-gradient-to-r ${rankStyle.bg} to-transparent hover:bg-[#334155]/20 transition-all ${isCurrentUser ? 'ring-1 ring-[#2962ff]/30' : ''} ${rankStyle.glow ? `shadow-lg ${rankStyle.glow}` : ''}`}
                    >
                      <div className="flex items-center">
                        <div className={`text-xl font-bold ${rankStyle.text} tabular-nums flex items-center gap-2`}>
                          <span>{rankStyle.rank}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center min-w-0">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`font-bold text-[15px] truncate ${
                              isCurrentUser ? 'text-[#2962ff]' : 'text-[#e2e8f0]'
                            }`}>
                              {player.name}
                            </span>
                            {isCurrentUser && (
                              <Badge className="bg-[#2962ff] text-white text-[10px] px-1.5 py-0 h-4 font-bold">
                                YOU
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-[#94a3b8] truncate font-mono">{player.fingerprint}</div>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-end">
                        <div className="text-right">
                          <div className={`text-lg font-bold tabular-nums ${
                            index === 0 ? 'text-[#f7931a]' : 
                            index === 1 ? 'text-[#c0c0c0]' : 
                            index === 2 ? 'text-[#cd7f32]' : 
                            isCurrentUser ? 'text-[#2962ff]' : 'text-[#e2e8f0]'
                          }`}>
                            🍌{player.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <div className="text-[10px] text-[#94a3b8] uppercase tracking-wider">BANANAS</div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          </div>
          
          {/* Footer Message */}
          <div className="text-center mt-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#1e293b] border border-[#334155] text-[#94a3b8] text-sm">
              <div className="w-2 h-2 rounded-full bg-[#f59e0b] animate-pulse"></div>
              Waiting for admin to start a new game...
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (isWaitingForNewGame || !currentRound) {
    return (
      <div className="min-h-screen bg-[#0b0f13] flex items-center justify-center p-6">
        <div className="text-center space-y-6 max-w-2xl w-full px-6">
          <div className="relative">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-[#f59e0b]/20 border-t-[#f59e0b] mx-auto"></div>
            <Clock className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 h-6 w-6 text-[#f59e0b]" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white uppercase tracking-wider mb-2">Please wait...</h2>
            <p className="text-[#94a3b8] text-sm">
              {isWaitingForNewGame ? 'Admin is preparing new game' : 'Waiting for game to start'}
            </p>
            <p className="text-[#64748b] text-xs mt-2">Game will start shortly</p>
          </div>
          
          {/* Online Users List */}
          <div className="mt-8 bg-[#1e293b] rounded-lg border border-[#334155] overflow-hidden">
            <div className="flex items-center gap-2 p-4 border-b border-[#334155] bg-[#1e293b]/50">
              <Users className="h-5 w-5 text-[#f59e0b]" />
              <h3 className="text-lg font-bold text-white">
                Players Online
              </h3>
              <Badge variant="outline" className="text-xs h-5 border-[#334155] text-[#94a3b8] ml-auto">
                {onlineUsersList.length}
              </Badge>
            </div>
            
            {onlineUsersList.length > 0 ? (
              <ScrollArea className="max-h-[400px]">
                <Table>
                  <TableHeader className="bg-[#1e293b]/50 sticky top-0 z-10 backdrop-blur-sm">
                    <TableRow className="hover:bg-transparent border-b border-[#334155]">
                      <TableHead className="h-10 text-xs font-bold text-[#94a3b8] w-[60%]">USER</TableHead>
                      <TableHead className="h-10 text-xs font-bold text-[#94a3b8] text-right">BALANCE</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {onlineUsersList.map((onlineUser) => (
                      <TableRow key={onlineUser.id} className="hover:bg-[#1e293b]/50 border-b border-[#334155]/50">
                        <TableCell className="py-3 font-medium text-sm">
                          <div className="flex items-center gap-3">
                            <div className="relative shrink-0">
                              <Avatar className="h-8 w-8 border border-[#334155]">
                                <AvatarFallback className="text-xs bg-[#1e293b] text-[#94a3b8]">
                                  {onlineUser.name?.substring(0, 1).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-[#10b981] rounded-full border border-[#1e293b]" />
                            </div>
                            <span className={`${onlineUser.id === user?.id ? "text-[#f59e0b]" : "text-[#cbd5e1]"} truncate`}>
                              {onlineUser.name}
                              {onlineUser.id === user?.id && (
                                <span className="ml-2 text-xs text-[#f59e0b]/70">(You)</span>
                              )}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="py-3 text-right font-mono text-sm text-[#94a3b8]">
                          🍌{onlineUser.balance?.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            ) : (
              <div className="text-center py-12">
                <Users className="h-12 w-12 text-[#334155] mx-auto mb-2" />
                <p className="text-[#64748b]">No banana traders online yet 🍌</p>
              </div>
            )}
          </div>
          
          <div className="flex justify-center gap-2">
            <div className="h-2 w-2 rounded-full bg-[#f59e0b] animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="h-2 w-2 rounded-full bg-[#f59e0b] animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="h-2 w-2 rounded-full bg-[#f59e0b] animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        </div>
      </div>
    )
  }

  const priceChange = goldPrice?.change || 0
  const priceChangePercent = goldPrice ? ((priceChange / goldPrice.price) * 100).toFixed(2) : '0.00'
  const isPositive = priceChange >= 0
  const quickAmounts = [100, 500, 1000, 5000, 10000, 50000]

  return (
    <div className="min-h-screen bg-[#0b0f13] text-foreground flex flex-col font-sans relative overflow-hidden">
      
      {/* WIN ANIMATION OVERLAY */}
      {lastWinAmount !== null && (
         <div className="absolute inset-0 z-[100] flex items-center justify-center pointer-events-none">
            <div className="flex flex-col items-center overlay-animate">
               <div className="text-6xl font-black text-[#10b981] drop-shadow-[0_0_15px_rgba(16,185,129,0.5)] mb-2 overlay-glow">
                  +🍌{lastWinAmount.toLocaleString()}
               </div>
               <div className="text-2xl font-bold text-white uppercase tracking-widest bg-[#10b981]/20 px-6 py-2 rounded-full border border-[#10b981]/50 backdrop-blur-md overlay-pulse">
                  🎉 BANANA WIN! 🎉
               </div>
            </div>
         </div>
      )}

      {/* LOSS ANIMATION OVERLAY */}
      {lastLossAmount !== null && (
         <div className="absolute inset-0 z-[100] flex items-center justify-center pointer-events-none">
            <div className="flex flex-col items-center overlay-animate overlay-shake">
               <div className="text-6xl font-black text-[#ef4444] drop-shadow-[0_0_15px_rgba(239,68,68,0.5)] mb-2 overlay-glow">
                  -🍌{lastLossAmount.toLocaleString()}
               </div>
               <div className="text-2xl font-bold text-white uppercase tracking-widest bg-[#ef4444]/20 px-6 py-2 rounded-full border border-[#ef4444]/50 backdrop-blur-md overlay-pulse">
                  😢 BANANAS SLIPPED! 😢
               </div>
            </div>
         </div>
      )}

      {/* PENALTY ANIMATION OVERLAY */}
      {lastPenaltyAmount !== null && (
         <div className="absolute inset-0 z-[100] flex items-center justify-center pointer-events-none">
            <div className="flex flex-col items-center overlay-animate overlay-shake">
               <div className="text-6xl font-black text-[#f97316] drop-shadow-[0_0_15px_rgba(249,115,22,0.5)] mb-2 overlay-glow">
                  🔥-🍌{lastPenaltyAmount.toLocaleString()}
               </div>
               <div className="text-2xl font-bold text-white uppercase tracking-widest bg-[#f97316]/20 px-6 py-2 rounded-full border border-[#f97316]/50 backdrop-blur-md overlay-pulse">
                  🔥 NO BET PENALTY! 🔥
               </div>
            </div>
         </div>
      )}

      {/* SKILL NOTIFICATION OVERLAY */}
      {incomingSkillEffect && (
         <div className="absolute inset-0 z-[100] flex items-center justify-center pointer-events-none">
            <div className="flex flex-col items-center overlay-animate">
               {incomingSkillEffect.skill_id === 'freezer' ? (
                 // Freezer skill
                 <>
                   {incomingSkillEffect.signal_type === 'skill_success' ? (
                     // You froze someone
                     <>
                       <div className="text-6xl font-black text-[#3b82f6] drop-shadow-[0_0_15px_rgba(59,130,246,0.5)] mb-2 overlay-glow">
                         🧊
                       </div>
                       <div className="text-2xl font-bold text-white uppercase tracking-widest bg-[#3b82f6]/20 px-6 py-2 rounded-full border border-[#3b82f6]/50 backdrop-blur-md overlay-pulse">
                         ❄️ FREEZE SUCCESS! ❄️
                       </div>
                     </>
                   ) : (
                     // You got frozen
                     <>
                       <div className="text-6xl font-black text-[#3b82f6] drop-shadow-[0_0_15px_rgba(59,130,246,0.5)] mb-2 overlay-glow overlay-shake">
                         🧊🧊🧊
                       </div>
                       <div className="text-2xl font-bold text-white uppercase tracking-widest bg-[#3b82f6]/20 px-6 py-2 rounded-full border border-[#3b82f6]/50 backdrop-blur-md overlay-pulse">
                         ❄️ YOU'VE BEEN FROZEN! ❄️
                       </div>
                     </>
                   )}
                 </>
               ) : incomingSkillEffect.signal_type === 'skill_success' ? (
                 // Success - You stole bananas
                 <>
                   <div className="text-6xl font-black text-[#10b981] drop-shadow-[0_0_15px_rgba(16,185,129,0.5)] mb-2 overlay-glow">
                     +🍌{incomingSkillEffect.amount?.toLocaleString()}
                   </div>
                   <div className="text-2xl font-bold text-white uppercase tracking-widest bg-[#10b981]/20 px-6 py-2 rounded-full border border-[#10b981]/50 backdrop-blur-md overlay-pulse">
                     💰 HEIST SUCCESS! 💰
                   </div>
                 </>
               ) : (
                 // Victim - Someone stole from you
                 <>
                   <div className="text-6xl font-black text-[#ef4444] drop-shadow-[0_0_15px_rgba(239,68,68,0.5)] mb-2 overlay-glow overlay-shake">
                     -🍌{incomingSkillEffect.amount?.toLocaleString()}
                   </div>
                   <div className="text-2xl font-bold text-white uppercase tracking-widest bg-[#ef4444]/20 px-6 py-2 rounded-full border border-[#ef4444]/50 backdrop-blur-md overlay-pulse">
                     🚨 YOU'VE BEEN ROBBED! 🚨
                   </div>
                 </>
               )}
            </div>
         </div>
      )}
      
      {/* PROFESSIONAL HEADER */}
      <header className="h-14 border-b border-[#1e293b] bg-[#0f172a] flex items-center px-4 justify-between sticky top-0 z-50">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#f59e0b] to-[#b45309] flex items-center justify-center shadow-lg">
              <DollarSign size={18} className="text-white font-bold" />
            </div>
            <span className="text-xl font-bold tracking-tight text-white">🍌 BANANA<span className="text-[#f59e0b]">TRADE</span></span>
          </div>
          
          <div className="hidden md:flex items-center gap-4 border-l border-[#1e293b] pl-6 text-sm">
            <div className="flex flex-col">
              <span className="text-[#94a3b8] text-[10px] uppercase font-bold tracking-wider">Fruit</span>
              <span className="font-bold text-white flex items-center gap-1">
                🍌 BNN/USD <span className="bg-[#f59e0b] text-black text-[10px] px-1 rounded font-extrabold">BANANA</span>
              </span>
            </div>
            
            <div className="flex flex-col min-w-[100px]">
              <span className="text-[#94a3b8] text-[10px] uppercase font-bold tracking-wider">Price</span>
              <span className={`font-mono font-bold text-base transition-colors duration-200 ${
                  priceFlash === 'up' ? 'text-[#10b981]' : 
                  priceFlash === 'down' ? 'text-[#ef4444]' : 'text-white'
              }`}>
                {goldPrice?.price.toFixed(2)}
              </span>
            </div>
            
            <div className="flex flex-col">
              <span className="text-[#94a3b8] text-[10px] uppercase font-bold tracking-wider">Change</span>
              <div className={`flex items-center text-xs font-bold ${isPositive ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                {isPositive ? <TrendingUp size={12} className="mr-1"/> : <TrendingDown size={12} className="mr-1"/>}
                {isPositive ? '+' : ''}{priceChange.toFixed(2)} ({isPositive ? '+' : ''}{priceChangePercent}%)
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className={`hidden md:flex flex-col items-end mr-4 transition-transform duration-200 ${balanceFlash ? 'scale-105' : ''}`}>
            <span className="text-[#94a3b8] text-[10px] uppercase font-bold tracking-wider">🍌 Banana Wallet</span>
            <div className="text-[#f59e0b] font-mono font-bold text-lg flex items-center gap-1">
              🍌{user.balance.toLocaleString()}
            </div>
          </div>
          
          <div className="h-8 w-[1px] bg-[#1e293b] hidden md:block"></div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-[#1e293b] px-3 py-1 rounded-full border border-[#334155]">
              <Users size={14} className="text-[#94a3b8]" />
              <span className="text-xs font-bold text-[#94a3b8]">{onlineUsers}</span>
            </div>
            <Avatar className="h-9 w-9 border-2 border-[#1e293b]">
              <AvatarFallback className="bg-[#1e293b] text-[#f59e0b] font-bold">
                {user.name[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>
      </header>

      {/* MAIN LAYOUT GRID */}
      <div className="flex-1 flex flex-col overflow-hidden">
        
        {/* Top Section - Trading Area */}
        <div className="flex-1 flex overflow-hidden">
        
        {/* LEFT COLUMN: Chart & History */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-[#1e293b]">
          
          {/* Chart Section - Takes available height */}
          <div className="flex-1 relative bg-[#0b0f13]">
             {/* Chart Overlay Info */}
             <div className="absolute top-4 left-4 z-10 flex gap-4 pointer-events-none">
                <div className="bg-[#1e293b]/80 backdrop-blur-sm border border-[#334155] rounded-md px-3 py-2">
                   <div className="text-[10px] text-[#94a3b8] uppercase font-bold">Round ID</div>
                   <div className="text-white font-mono font-bold">#{currentRound?.round_number || '---'}</div>
                </div>
                <div className="bg-[#1e293b]/80 backdrop-blur-sm border border-[#334155] rounded-md px-3 py-2">
                   <div className="text-[10px] text-[#94a3b8] uppercase font-bold">Time Left</div>
                   <div className={`font-mono font-bold text-lg flex items-center gap-2 ${
                     countdown <= 5 ? 'text-[#ef4444] animate-pulse' : 'text-[#f59e0b]'
                   }`}>
                     <Clock size={16} />
                     {countdown}s
                   </div>
                </div>
             </div>
             
             <TradingChart prices={chartPrices} />
          </div>

          {/* Bottom Tabs: Positions / History */}
          <div className="h-[300px] bg-[#0f172a] border-t border-[#1e293b] flex flex-col">
            <Tabs defaultValue="positions" className="w-full flex flex-col h-full">
              <div className="px-4 border-b border-[#1e293b] flex items-center justify-between bg-[#1e293b]/30">
                <TabsList className="bg-transparent h-10 p-0">
                  <TabsTrigger value="positions" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-[#f59e0b] data-[state=active]:text-[#f59e0b] rounded-none px-4 h-full border-b-2 border-transparent text-[#94a3b8] font-bold text-xs uppercase tracking-wider">
                    🍌 Recent Banana Trades
                  </TabsTrigger>
                  <TabsTrigger value="market" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-[#f59e0b] data-[state=active]:text-[#f59e0b] rounded-none px-4 h-full border-b-2 border-transparent text-[#94a3b8] font-bold text-xs uppercase tracking-wider">
                    🍌 Banana Market Activity
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="positions" className="flex-1 p-0 m-0 overflow-hidden">
                <ScrollArea className="h-full w-full">
                  <Table>
                    <TableHeader className="bg-[#0f172a] sticky top-0 z-10">
                      <TableRow className="hover:bg-transparent border-b border-[#1e293b]">
                        <TableHead className="text-[#94a3b8] text-[10px] uppercase h-8">Time</TableHead>
                        <TableHead className="text-[#94a3b8] text-[10px] uppercase h-8">Type</TableHead>
                        <TableHead className="text-[#94a3b8] text-[10px] uppercase h-8 text-right">Amount</TableHead>
                        <TableHead className="text-[#94a3b8] text-[10px] uppercase h-8 text-right">Payout</TableHead>
                        <TableHead className="text-[#94a3b8] text-[10px] uppercase h-8 text-right">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                        {recentBets.filter(b => b.user_id === user.id).slice(0, 20).map((bet) => (
                           <TableRow key={bet.id} className="border-[#1e293b] hover:bg-[#1e293b]/50 transition-colors">
                              <TableCell className="py-2 text-xs font-mono text-[#94a3b8]">
                                {new Date(bet.created_at).toLocaleTimeString()}
                              </TableCell>
                              <TableCell className="py-2">
                                <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                                  bet.prediction === 'up' ? 'bg-[#10b981]/20 text-[#10b981]' : 'bg-[#ef4444]/20 text-[#ef4444]'
                                }`}>
                                  {bet.prediction === 'up' ? '🍌 RIPER' : '🍌 GREENER'}
                                </span>
                              </TableCell>
                              <TableCell className="py-2 text-right text-xs font-mono font-medium">
                                🍌{bet.bet_amount.toLocaleString()}
                              </TableCell>
                              <TableCell className="py-2 text-right text-xs font-mono font-medium">
                                {bet.result === 'won' ? (
                                  <span className="text-[#10b981]">+{bet.profit.toLocaleString()}</span>
                                ) : bet.result === 'lost' ? (
                                  <span className="text-[#ef4444]">-{bet.bet_amount.toLocaleString()}</span>
                                ) : (
                                  <span className="text-[#94a3b8]">-</span>
                                )}
                              </TableCell>
                              <TableCell className="py-2 text-right">
                                {bet.result === 'pending' ? (
                                  <Badge variant="outline" className="border-[#f59e0b] text-[#f59e0b] text-[10px] py-0 h-5">PENDING</Badge>
                                ) : bet.result === 'won' ? (
                                  <Badge variant="outline" className="border-[#10b981] bg-[#10b981]/10 text-[#10b981] text-[10px] py-0 h-5">WIN</Badge>
                                ) : (
                                  <Badge variant="outline" className="border-[#ef4444] bg-[#ef4444]/10 text-[#ef4444] text-[10px] py-0 h-5">LOSS</Badge>
                                )}
                              </TableCell>
                           </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="market" className="flex-1 p-0 m-0 overflow-hidden">
                 <ScrollArea className="h-full w-full">
                  <Table>
                    <TableHeader className="bg-[#0f172a] sticky top-0 z-10">
                      <TableRow className="hover:bg-transparent border-b border-[#1e293b]">
                        <TableHead className="text-[#94a3b8] text-[10px] uppercase h-8">Time</TableHead>
                        <TableHead className="text-[#94a3b8] text-[10px] uppercase h-8">User</TableHead>
                        <TableHead className="text-[#94a3b8] text-[10px] uppercase h-8">Side</TableHead>
                        <TableHead className="text-[#94a3b8] text-[10px] uppercase h-8 text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentBets.slice(0, 20).map((bet) => (
                        <TableRow key={bet.id} className="border-[#1e293b] hover:bg-[#1e293b]/50">
                          <TableCell className="py-2 text-xs font-mono text-[#94a3b8]">
                            {new Date(bet.created_at).toLocaleTimeString()}
                          </TableCell>
                          <TableCell className="py-2 text-xs text-[#e2e8f0]">
                            User {bet.user_id.slice(0,4)}
                          </TableCell>
                          <TableCell className="py-2">
                             <span className={`text-[10px] font-bold ${
                                bet.prediction === 'up' ? 'text-[#10b981]' : 'text-[#ef4444]'
                             }`}>
                                {bet.prediction === 'up' ? '🍌 RIPER' : '🍌 GREENER'}
                             </span>
                          </TableCell>
                          <TableCell className="py-2 text-right text-xs font-mono text-[#e2e8f0]">
                            🍌{bet.bet_amount.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* MIDDLE COLUMN: User Leaderboard */}
        <div className="w-[240px] bg-[#0f172a] border-l border-[#1e293b] flex flex-col z-10">
          {/* Traders Section - Top Half */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="p-3 border-b border-[#1e293b] bg-[#1e293b]/20 flex items-center justify-between">
              <h2 className="text-xs font-bold text-white uppercase tracking-widest">🍌 Banana Traders</h2>
              <Badge variant="outline" className="text-[10px] h-5 border-[#334155] text-[#94a3b8]">
                {allUsers?.length || 0}
              </Badge>
            </div>
            
            <ScrollArea className="flex-1">
              <Table>
                  <TableHeader className="bg-[#1e293b]/50 sticky top-0 z-10 backdrop-blur-sm">
                    <TableRow className="hover:bg-transparent border-b border-[#1e293b]">
                        <TableHead className="h-8 text-[10px] font-bold text-[#94a3b8] w-[60%]">USER</TableHead>
                        <TableHead className="h-8 text-[10px] font-bold text-[#94a3b8] text-right">BALANCE</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allUsers?.map((u) => {
                        const userActiveBet = activeBets.find(b => b.user_id === u.id)
                        const isOnline = onlineUsersList.some(onlineUser => onlineUser.id === u.id)
                        return (
                        <TableRow key={u.id} className="hover:bg-[#1e293b]/50 border-b border-[#1e293b]/50 h-10">
                          <TableCell className="py-1 font-medium text-xs">
                              <div className="flex items-center justify-between pr-2">
                                  <div className="flex items-center gap-2 overflow-hidden">
                                    <div className="relative shrink-0">
                                        <Avatar className="h-5 w-5 border border-[#334155]">
                                          <AvatarFallback className="text-[9px] bg-[#1e293b] text-[#94a3b8]">
                                              {u.name?.substring(0, 1).toUpperCase()}
                                          </AvatarFallback>
                                        </Avatar>
                                        {isOnline && (
                                          <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-[#10b981] rounded-full border border-[#0f172a]" />
                                        )}
                                    </div>
                                    <span className={`${u.id === user?.id ? "text-[#f59e0b]" : "text-[#cbd5e1]"} truncate`}>
                                        {u.name}
                                    </span>
                                  </div>
                                  {userActiveBet && (
                                    <div className={`flex items-center gap-1 shrink-0 ${userActiveBet.prediction === 'up' ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                                        {userActiveBet.prediction === 'up' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                        <span className="text-[10px] font-bold">🍌{userActiveBet.bet_amount}</span>
                                    </div>
                                  )}
                              </div>
                          </TableCell>
                          <TableCell className="py-1 text-right font-mono text-xs text-[#94a3b8]">
                              🍌{u.balance?.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      )})}
                  </TableBody>
              </Table>
            </ScrollArea>
          </div>

          {/* Skills Section - Bottom Half */}
          <div className="flex-1 flex flex-col border-t-2 border-[#334155] min-h-0">
            <div className="p-3 border-b border-[#1e293b] bg-[#1e293b]/20 flex items-center justify-between">
              <h2 className="text-xs font-bold text-white uppercase tracking-widest">⚡ Skills</h2>
              <Badge variant="outline" className="text-[10px] h-5 border-[#334155] text-[#94a3b8]">
                {userSkills.length}
              </Badge>
            </div>
            
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-2">
                {userSkills.length === 0 ? (
                  <div className="p-4 text-center">
                    <p className="text-xs text-[#94a3b8]">No skills yet</p>
                  </div>
                ) : (
                  userSkills.map((skill) => {
                    const skillDef = skill.skill_definitions
                    const hasQuantity = skill.quantity > 0

                    return (
                      <div
                        key={skill.id}
                        className={`p-3 rounded-lg border ${
                          !hasQuantity
                            ? 'bg-[#1e293b]/30 border-[#334155] opacity-50'
                            : 'bg-[#1e293b]/50 border-[#334155] hover:border-[#f59e0b] cursor-pointer'
                        } transition-all`}
                        onClick={() => {
                          if (hasQuantity && skillDef) {
                            if (skillDef.id === 'steal_money' || skillDef.id === 'freezer') {
                              setSelectedSkillId(skillDef.id)
                              setShowTargetDialog(true)
                            } else {
                              activateSkill(skillDef.id)
                            }
                          }
                        }}
                      >
                        <div className="flex items-start justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-2xl">{skillDef?.icon || '⚡'}</span>
                            <div>
                              <h3 className="text-xs font-bold text-white">{skillDef?.name || 'Unknown'}</h3>
                              {!hasQuantity && (
                                <p className="text-[9px] text-[#ef4444]">No uses left</p>
                              )}
                            </div>
                          </div>
                          <Badge variant="outline" className="text-[9px] h-4 border-[#334155] text-[#94a3b8]">
                            x{skill.quantity}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-[#94a3b8] mt-1">{skillDef?.description || ''}</p>
                      </div>
                    )
                  })
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* RIGHT COLUMN: Trading Panel */}
        <div className="w-[320px] bg-[#0f172a] border-l border-[#1e293b] flex flex-col z-20 shadow-xl">
           
           <div className="p-4 border-b border-[#1e293b] bg-[#1e293b]/20">
              <h2 className="text-sm font-bold text-white uppercase tracking-widest mb-1">🍌 Trade Bananas</h2>
              <div className="text-[10px] text-[#94a3b8] flex justify-between">
                <span>Banana Wallet</span>
                <span className="text-[#f59e0b] font-mono">🍌 {user.balance.toLocaleString()}</span>
              </div>
           </div>

           <div className="p-4 flex-1 overflow-y-auto">
              {/* Amount Input */}
              <div className="space-y-4 mb-6">
                 <div>
                    <label className="text-[11px] font-bold text-[#94a3b8] uppercase mb-1.5 block">Banana Amount</label>
                    <div className="relative">
                       <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]">🍌</span>
                       <Input 
                          type="number" 
                          value={betAmount || ''}
                          onChange={(e) => setBetAmount(e.target.value)}
                          className="bg-[#0b0f13] border-[#334155] text-white pl-7 font-mono font-bold text-lg h-12 focus-visible:ring-1 focus-visible:ring-[#f59e0b] focus-visible:border-[#f59e0b]"
                          placeholder="0.00"
                        />
                    </div>
                 </div>

                 <div className="grid grid-cols-4 gap-2">
                    {quickAmounts.map(amt => (
                       <button
                          key={amt}
                          onClick={() => setBetAmount(amt.toString())}
                          className="bg-[#1e293b] hover:bg-[#334155] text-[#94a3b8] hover:text-white text-xs font-bold py-1.5 rounded transition-colors border border-[#334155]"
                       >
                          {amt >= 1000 ? `${amt/1000}k` : amt}
                       </button>
                    ))}
                 </div>
              </div>

              {/* Profit Info */}
              <div className="bg-[#1e293b]/50 rounded-lg p-3 border border-[#334155] mb-6">
                 <div className="flex justify-between text-xs mb-1">
                    <span className="text-[#94a3b8]">Payout</span>
                    <span className="text-[#10b981] font-bold">{(1 + winRate) * 100}%</span>
                 </div>
                 <div className="flex justify-between text-xs">
                    <span className="text-[#94a3b8]">Banana Profit</span>
                    <span className="text-[#10b981] font-bold">+🍌 {(parseFloat(betAmount || '0') * winRate).toLocaleString()}</span>
                 </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3">
                 <Button
                    onClick={() => handleBet('up')}
                    disabled={!!userBet || !currentRound || countdown < 3 || isFrozen}
                    className="w-full h-14 bg-[#10b981] hover:bg-[#059669] text-white font-bold text-lg rounded-md shadow-[0_4px_0_0_#065f46] active:shadow-none active:translate-y-[4px] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                 >
                    <div className="flex items-center gap-2">
                       <TrendingUp className="stroke-[3px]" />
                       <span>🍌 RIPER</span>
                    </div>
                 </Button>

                 <Button
                    onClick={() => handleBet('down')}
                    disabled={!!userBet || !currentRound || countdown < 3 || isFrozen}
                    className="w-full h-14 bg-[#ef4444] hover:bg-[#b91c1c] text-white font-bold text-lg rounded-md shadow-[0_4px_0_0_#991b1b] active:shadow-none active:translate-y-[4px] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                 >
                    <div className="flex items-center gap-2">
                       <TrendingDown className="stroke-[3px]" />
                       <span>🍌 GREENER</span>
                    </div>
                 </Button>
              </div>
              
              {/* Status Message */}
               <div className="mt-6 text-center">
                  {isFrozen ? (
                     <div className="bg-[#3b82f6]/10 border border-[#3b82f6] rounded-lg p-4 animate-in fade-in zoom-in duration-300">
                        <div className="text-[10px] text-[#3b82f6] uppercase font-bold mb-1">🧊 FROZEN</div>
                        <div className="text-xs text-white font-medium">
                           You cannot bet until end of round {frozenUntilRound}
                        </div>
                     </div>
                  ) : userBet ? (
                     <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-4 animate-in fade-in zoom-in duration-300">
                        <div className="text-[10px] text-[#94a3b8] uppercase font-bold mb-1">Current Banana Bet</div>
                        <div className="flex items-center justify-center gap-2 text-sm font-bold text-white">
                           {userBet.prediction === 'up' 
                              ? <span className="text-[#10b981] flex items-center gap-1"><TrendingUp size={14}/> 🍌 RIPER</span> 
                              : <span className="text-[#ef4444] flex items-center gap-1"><TrendingDown size={14}/> 🍌 GREENER</span>
                           }
                           <span className="text-[#94a3b8]">|</span>
                           <span>🍌 {userBet.bet_amount}</span>
                        </div>
                     </div>
                  ) : countdown < 3 && countdown > 0 ? (
                    <div className="text-xs text-[#f59e0b] font-bold bg-[#f59e0b]/10 p-2 rounded border border-[#f59e0b]/30">
                       ⚠ Locked
                    </div>
                  ) : null}
               </div>

           </div>

           {/* Footer of Panel */}
           <div className="mt-auto border-t border-[#1e293b] p-4 bg-[#1e293b]/20">
               <div className="flex items-center justify-between text-[10px] text-[#64748b]">
                  <span>Server Time</span>
                  <span className="font-mono">{new Date().toLocaleTimeString()}</span>
               </div>
           </div>
        </div>
        </div>
        
      </div>

      {/* Target Selection Dialog */}
      <Dialog open={showTargetDialog} onOpenChange={setShowTargetDialog}>
        <DialogContent className="bg-[#0f172a] border-[#334155] text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#f59e0b]">
              <Target className="w-5 h-5" />
              Select Target
            </DialogTitle>
            <DialogDescription className="text-[#94a3b8]">
              {selectedSkillId === 'steal_money' 
                ? 'Choose a trader to steal bananas from'
                : selectedSkillId === 'freezer'
                ? 'Choose a trader to freeze'
                : 'Choose a target for your skill'}
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-[400px] mt-4">
            <div className="space-y-2">
              {allUsers
                .filter(u => u.id !== user?.id) // Can't target yourself
                .map((targetUser) => (
                  <div
                    key={targetUser.id}
                    className="p-3 rounded-lg border border-[#334155] bg-[#1e293b]/50 hover:border-[#f59e0b] cursor-pointer transition-all"
                    onClick={async () => {
                      if (selectedSkillId) {
                        const success = await activateSkill(selectedSkillId, targetUser.id)
                        if (success) {
                          setShowTargetDialog(false)
                          setSelectedSkillId(null)
                        }
                      }
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8 border border-[#334155]">
                          <AvatarFallback className="text-xs bg-[#1e293b] text-[#94a3b8]">
                            {targetUser.name?.substring(0, 1).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium text-white">{targetUser.name}</p>
                          <p className="text-xs text-[#94a3b8] font-mono">🍌 {targetUser.balance.toLocaleString()}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs border-[#334155] text-[#94a3b8]">
                        Select
                      </Badge>
                    </div>
                  </div>
                ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  )
}
