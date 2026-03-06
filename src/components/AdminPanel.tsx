import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import * as adminApi from '../lib/adminApi'
import { Play, Pause, TrendingUp, TrendingDown, RefreshCw, Settings, Users, Database, AlertTriangle, LayoutDashboard, LogOut, Clock, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

export default function AdminPanel() {
  const [currentPrice, setCurrentPrice] = useState(2000)
  const [priceChange, setPriceChange] = useState(0)
  const [currentRound, setCurrentRound] = useState<any>(null)
  const [countdown, setCountdown] = useState(15)
  const [showStartDialog, setShowStartDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showDeleteUserDialog, setShowDeleteUserDialog] = useState(false)
  const [userToDelete, setUserToDelete] = useState<string | null>(null)
  const [showCleanPricesDialog, setShowCleanPricesDialog] = useState(false)
  const [showResetAllDialog, setShowResetAllDialog] = useState(false)
  const [showCleanRoundsDialog, setShowCleanRoundsDialog] = useState(false)
  const [isGameRunning, setIsGameRunning] = useState(false)
  const [isWaitingForConfig, setIsWaitingForConfig] = useState(false)
  const [newGameConfig, setNewGameConfig] = useState({
    roundDuration: 15,
    priceUpdateInterval: 1,
    winRate: 95,
    defaultUserBalance: 10000,
    minBetAmount: 10,
    maxBetAmount: 50000,
    noBetPenalty: 0,
    maxRound: null as number | null
  })

  // Settings
  const [roundDuration, setRoundDuration] = useState(15)
  const [priceUpdateInterval, setPriceUpdateInterval] = useState(1)
  const [winRate, setWinRate] = useState(0.95)
  const [defaultUserBalance, setDefaultUserBalance] = useState(10000)
  const [minBetAmount, setMinBetAmount] = useState(10)
  const [maxBetAmount, setMaxBetAmount] = useState(50000)
  const [noBetPenalty, setNoBetPenalty] = useState(0)
  const [maxRound, setMaxRound] = useState<number | null>(null)
  const [gameStatus, setGameStatus] = useState<'running' | 'completed'>('running')
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showLeaderboardDialog, setShowLeaderboardDialog] = useState(false)
  const [leaderboard, setLeaderboard] = useState<any[]>([])

  const [stats, setStats] = useState({
    totalRounds: 0,
    activePlayers: 0,
    totalBets: 0,
  })

  const [users, setUsers] = useState<any[]>([])
  const [currentBets, setCurrentBets] = useState<any[]>([])
  const [activeView, setActiveView] = useState<'dashboard' | 'users' | 'settings' | 'data'>('dashboard')
  const [editingUser, setEditingUser] = useState<string | null>(null)
  const [editBalance, setEditBalance] = useState<number>(0)

  const broadcastChannel = useRef<any>(null)
  const isInitialized = useRef(false)

  useEffect(() => {
    if (isInitialized.current) return
    isInitialized.current = true

    const initialize = async () => {
      // Subscribe to broadcast channel (read-only, for real-time countdown/price)
      broadcastChannel.current = supabase.channel('game-state-admin-listen')
      broadcastChannel.current
        .on('broadcast', { event: 'game-state' }, (payload: any) => {
          const data = payload.payload
          if (data.countdown !== undefined) setCountdown(data.countdown)
          if (data.currentRound !== undefined) setCurrentRound(data.currentRound)
          if (data.goldPrice) {
            setCurrentPrice(data.goldPrice.price)
            setPriceChange(data.goldPrice.change)
          }
          if (data.isWaiting) setIsWaitingForConfig(true)
        })
        .on('broadcast', { event: 'game-completed' }, (payload: any) => {
          const data = payload.payload
          if (data.leaderboard) {
            setLeaderboard(data.leaderboard)
            setShowLeaderboardDialog(true)
            setIsGameRunning(false)
            setCurrentRound(null)
          }
        })
        .subscribe()

      await loadStatus()
      await loadSettings()
    }

    initialize()

    return () => {
      if (broadcastChannel.current) broadcastChannel.current.unsubscribe()
      isInitialized.current = false
    }
  }, [])

  // Poll game status every 3 seconds for stats/users/bets
  useEffect(() => {
    const interval = setInterval(loadStatus, 3000)
    return () => clearInterval(interval)
  }, [])

  const loadStatus = async () => {
    try {
      const data = await adminApi.getGameStatus()
      setIsGameRunning(data.isRunning)
      setCurrentRound(data.currentRound)
      setCurrentPrice(data.currentPrice)
      setPriceChange(data.priceChange)
      setCountdown(data.countdown)
      setStats(data.stats)
      setUsers(data.users)
      setCurrentBets(data.bets)
    } catch {
      // API not available yet
    }
  }

  const loadSettings = async () => {
    try {
      const data = await adminApi.getSettings()
      if (data) {
        setRoundDuration(data.round_duration)
        setPriceUpdateInterval(data.price_update_interval)
        setWinRate(data.win_rate)
        setDefaultUserBalance(data.default_user_balance || 10000)
        setMinBetAmount(data.min_bet_amount || 10)
        setMaxBetAmount(data.max_bet_amount || 50000)
        setNoBetPenalty(data.no_bet_penalty || 0)
        setMaxRound(data.max_round || null)
        setGameStatus(data.game_status || 'running')
        setHasUnsavedChanges(false)
      }
    } catch {
      // API not available yet
    }
  }

  const saveSettings = async () => {
    setIsSaving(true)
    try {
      await adminApi.updateSettings({
        round_duration: roundDuration,
        price_update_interval: priceUpdateInterval,
        win_rate: winRate,
        default_user_balance: defaultUserBalance,
        min_bet_amount: minBetAmount,
        max_bet_amount: maxBetAmount,
        no_bet_penalty: noBetPenalty,
        max_round: maxRound,
        game_status: gameStatus,
      })
      setHasUnsavedChanges(false)
      toast.success('Settings saved successfully!')
    } catch {
      toast.error('Error saving settings!')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteCurrentGame = async () => {
    try {
      await adminApi.deleteGame()
      setIsGameRunning(false)
      setCurrentRound(null)
      setCountdown(0)
      setIsWaitingForConfig(false)
      toast.success('Current game deleted successfully')
    } catch {
      toast.error('Failed to delete current game!')
    }
  }

  const handlePrepareForNewGame = async () => {
    try {
      await adminApi.prepareNewGame()
      setIsGameRunning(false)
      setCurrentRound(null)
      setIsWaitingForConfig(true)
      setShowLeaderboardDialog(false)
      setLeaderboard([])
      setGameStatus('running')
      setShowStartDialog(true)
      toast.info('Game paused. Configure new game settings.')
    } catch {
      toast.error('Failed to prepare for new game!')
    }
  }

  const handleStartNewGameSession = async () => {
    setIsSaving(true)
    try {
      await adminApi.startGame(newGameConfig)
      await loadSettings()
      setCurrentPrice(2000)
      setPriceChange(0)
      setIsWaitingForConfig(false)
      setShowLeaderboardDialog(false)
      setLeaderboard([])
      setGameStatus('running')
      setIsGameRunning(true)
      setShowStartDialog(false)
      toast.success('New game session started! Round 1 is now active.')
    } catch {
      toast.error('Failed to start new game session!')
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggleGame = async () => {
    try {
      if (isGameRunning) {
        await adminApi.stopGame()
        setIsGameRunning(false)
      } else {
        await adminApi.resumeGame()
        setIsGameRunning(true)
      }
    } catch {
      toast.error('Failed to toggle game state!')
    }
  }

  const handleUpdateUserBalance = async (userId: string, newBalance: number) => {
    try {
      await adminApi.updateUserBalance(userId, newBalance)
      await loadStatus()
      setEditingUser(null)
      toast.success('Balance updated successfully')
    } catch {
      toast.error('Failed to update balance')
    }
  }

  const handleDeleteUser = async (userId: string) => {
    try {
      await adminApi.deleteUser(userId)
      await loadStatus()
      toast.success('User deleted successfully')
    } catch {
      toast.error('Failed to delete user')
    }
  }

  const handleCleanPriceHistory = async () => {
    try {
      await adminApi.cleanPriceHistory()
      setCurrentPrice(2000)
      setPriceChange(0)
      toast.success('Price history cleaned successfully')
    } catch {
      toast.error('Failed to clean price history')
    }
  }

  const handleResetAllData = async () => {
    try {
      setIsGameRunning(false)
      setIsWaitingForConfig(false)
      await adminApi.resetAllData()
      setCurrentPrice(2000)
      setPriceChange(0)
      setCurrentRound(null)
      setCountdown(roundDuration)
      await loadStatus()
      toast.success('All data has been reset successfully.')
    } catch {
      toast.error('Failed to reset data')
    }
  }

  const handleCleanOldRounds = async () => {
    try {
      await adminApi.cleanOldRounds()
      await loadStatus()
      toast.success('Old rounds cleaned successfully')
    } catch {
      toast.error('Failed to clean old rounds')
    }
  }

  return (
    <div className="flex h-screen bg-[#0b0f13] text-white font-sans overflow-hidden select-none">
      {/* Leaderboard Dialog */}
      <Dialog open={showLeaderboardDialog} onOpenChange={setShowLeaderboardDialog}>
        <DialogContent className="max-w-4xl bg-[#1e293b] border-[#334155] text-white shadow-2xl">
          <DialogHeader className="border-b border-[#334155] pb-4">
            <DialogTitle className="text-xl font-semibold text-white flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#f7931a] to-[#f59e0b] flex items-center justify-center shadow-lg">
                <span className="text-2xl">🏆</span>
              </div>
              <div>
                <div className="text-xl font-bold tracking-tight">Game Completed</div>
                <div className="text-sm font-normal text-[#94a3b8] mt-0.5">Final Standings After {maxRound} Rounds</div>
              </div>
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[520px]">
            <div className="space-y-0 mt-2">
              <div className="grid grid-cols-[60px_1fr_140px] gap-3 px-4 py-2 text-xs font-semibold text-[#94a3b8] border-b border-[#334155] bg-[#1e293b]/50">
                <div>RANK</div>
                <div>TRADER</div>
                <div className="text-right">BALANCE</div>
              </div>

              {leaderboard.map((user, index) => {
                const rankColors = [
                  { bg: 'bg-gradient-to-r from-[#f7931a]/5 to-transparent', border: 'border-l-[#f7931a]', text: 'text-[#f7931a]', rank: '🥇' },
                  { bg: 'bg-gradient-to-r from-[#c0c0c0]/5 to-transparent', border: 'border-l-[#c0c0c0]', text: 'text-[#c0c0c0]', rank: '🥈' },
                  { bg: 'bg-gradient-to-r from-[#cd7f32]/5 to-transparent', border: 'border-l-[#cd7f32]', text: 'text-[#cd7f32]', rank: '🥉' },
                ]
                const rankStyle = rankColors[index] || { bg: 'bg-transparent', border: 'border-l-[#334155]', text: 'text-[#94a3b8]', rank: `${index + 1}` }

                return (
                  <div
                    key={user.id}
                    className={`grid grid-cols-[60px_1fr_140px] gap-3 px-4 py-3 border-l-2 ${rankStyle.border} ${rankStyle.bg} hover:bg-[#334155]/20 transition-colors border-b border-[#334155]/50`}
                  >
                    <div className="flex items-center">
                      <div className={`text-lg font-bold ${rankStyle.text} tabular-nums`}>
                        {rankStyle.rank}
                      </div>
                    </div>
                    <div className="flex items-center min-w-0">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-[#e2e8f0] truncate text-sm">{user.name}</div>
                        <div className="text-xs text-[#94a3b8] truncate font-mono">{user.fingerprint}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-end">
                      <div className="text-right">
                        <div className={`text-base font-bold tabular-nums ${index < 3 ? rankStyle.text : 'text-[#2962ff]'}`}>
                          ${user.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className="text-[10px] text-[#94a3b8] uppercase tracking-wider mt-0.5">USD</div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </ScrollArea>

          <DialogFooter className="border-t border-[#334155] pt-4 mt-4">
            <Button onClick={() => setShowLeaderboardDialog(false)} className="bg-[#334155] hover:bg-[#475569] text-[#e2e8f0] border-0 font-medium">Close</Button>
            <Button onClick={() => { setShowLeaderboardDialog(false); handlePrepareForNewGame() }} className="bg-[#2962ff] hover:bg-[#1e53e5] text-white font-semibold shadow-lg shadow-[#2962ff]/20">Start New Game</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Start New Game Dialog */}
      <Dialog open={showStartDialog} onOpenChange={setShowStartDialog}>
        <DialogContent className="max-w-2xl bg-[#0b0f13] border-[#1e293b] text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Start New Game Session</DialogTitle>
            <DialogDescription className="text-[#94a3b8]">Configure your game settings. This will reset all game data and start from Round 1.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">Round Duration (s)</label>
                <Input type="number" className="bg-[#1e293b] border-[#334155] text-white font-mono" value={newGameConfig.roundDuration} onChange={(e) => setNewGameConfig({...newGameConfig, roundDuration: parseInt(e.target.value) || 15})} />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">Price Update (s)</label>
                <Input type="number" className="bg-[#1e293b] border-[#334155] text-white font-mono" value={newGameConfig.priceUpdateInterval} onChange={(e) => setNewGameConfig({...newGameConfig, priceUpdateInterval: parseInt(e.target.value) || 1})} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">Win Rate (%)</label>
                <Input type="number" className="bg-[#1e293b] border-[#334155] text-white font-mono" value={newGameConfig.winRate} onChange={(e) => setNewGameConfig({...newGameConfig, winRate: parseInt(e.target.value) || 95})} />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">Default Balance ($)</label>
                <Input type="number" className="bg-[#1e293b] border-[#334155] text-white font-mono" value={newGameConfig.defaultUserBalance} onChange={(e) => setNewGameConfig({...newGameConfig, defaultUserBalance: parseInt(e.target.value) || 10000})} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">Min Bet ($)</label>
                <Input type="number" className="bg-[#1e293b] border-[#334155] text-white font-mono" value={newGameConfig.minBetAmount} onChange={(e) => setNewGameConfig({...newGameConfig, minBetAmount: parseInt(e.target.value) || 10})} />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">Max Bet ($)</label>
                <Input type="number" className="bg-[#1e293b] border-[#334155] text-white font-mono" value={newGameConfig.maxBetAmount} onChange={(e) => setNewGameConfig({...newGameConfig, maxBetAmount: parseInt(e.target.value) || 50000})} />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">Penalty ($)</label>
                <Input type="number" className="bg-[#1e293b] border-[#334155] text-white font-mono" value={newGameConfig.noBetPenalty} onChange={(e) => setNewGameConfig({...newGameConfig, noBetPenalty: parseInt(e.target.value) || 0})} />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">Max Rounds (leave empty for unlimited)</label>
              <Input type="number" className="bg-[#1e293b] border-[#334155] text-white font-mono" placeholder="Unlimited" value={newGameConfig.maxRound || ''} onChange={(e) => setNewGameConfig({...newGameConfig, maxRound: e.target.value ? parseInt(e.target.value) : null})} />
              <p className="text-xs text-[#64748b]">Game will end after this many rounds and show the leaderboard</p>
            </div>

            <Alert className="mt-2 bg-[#ef4444]/10 border-[#ef4444]/20 text-[#ef4444]">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>Starting a new game will reset all user balances and delete all bets, rounds, and price history.</AlertDescription>
            </Alert>
          </div>

          <DialogFooter>
            <Button variant="outline" className="border-[#334155] text-[#94a3b8] hover:bg-[#1e293b] hover:text-white" onClick={() => setShowStartDialog(false)} disabled={isSaving}>Cancel</Button>
            <Button onClick={handleStartNewGameSession} disabled={isSaving} className="bg-[#10b981] hover:bg-[#059669] text-white font-bold">
              {isSaving ? 'Starting...' : 'Start New Game'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sidebar */}
      <aside className="w-[240px] bg-[#0b0f13] border-r border-[#1e293b] flex flex-col hidden sm:flex z-50">
        <div className="h-14 flex items-center px-6 border-b border-[#1e293b]">
          <div className="flex items-center gap-2 font-bold text-white">
            <div className="w-8 h-8 rounded bg-[#f59e0b] flex items-center justify-center text-black shadow-lg shadow-[#f59e0b]/20">
              <Settings size={18} />
            </div>
            <span className="tracking-wider text-sm">ADMIN PANEL</span>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {[
            { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
            { id: 'users', icon: Users, label: 'Users' },
            { id: 'settings', icon: Settings, label: 'Settings' },
            { id: 'data', icon: Database, label: 'Data' }
          ].map((item) => (
            <Button
              key={item.id}
              variant="ghost"
              className={`w-full justify-start gap-3 h-10 ${activeView === item.id ? 'bg-[#1e293b] text-[#f59e0b] border-r-2 border-[#f59e0b]' : 'text-[#94a3b8] hover:bg-[#1e293b]/50 hover:text-white'}`}
              onClick={() => setActiveView(item.id as any)}
            >
              <item.icon size={18} />
              <span className="font-medium text-xs uppercase tracking-wider">{item.label}</span>
            </Button>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-[#0b0f13] border-b border-[#1e293b] flex items-center px-6 justify-between shrink-0">
          <div className="flex items-center gap-2">
            <h1 className="font-bold text-xs uppercase tracking-widest text-white">{activeView}</h1>
          </div>

          <div className="flex items-center gap-3">
            {isWaitingForConfig && (
              <Badge variant="outline" className="bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/20 gap-1.5 animate-pulse">
                <Clock size={12} />
                WAITING FOR CONFIG
              </Badge>
            )}
            {isGameRunning && (
              <Badge variant="outline" className="bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20 gap-1.5 hidden sm:flex">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10b981] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#10b981]"></span>
                </span>
                SERVER RUNNING
              </Badge>
            )}

            <div className="h-6 w-[1px] bg-[#1e293b] mx-2"></div>

            <Button onClick={handlePrepareForNewGame} size="sm" className="bg-[#f59e0b] hover:bg-[#d97706] text-black font-bold text-xs">
              <Play size={14} className="mr-2" />
              NEW GAME
            </Button>

            {currentRound && (
              <>
                <Button onClick={handleToggleGame} size="sm" variant="outline" className="border-[#334155] text-[#94a3b8] hover:text-white hover:bg-[#1e293b]">
                  {isGameRunning ? <Pause size={14} className="mr-2" /> : <Play size={14} className="mr-2" />}
                  {isGameRunning ? 'PAUSE' : 'RESUME'}
                </Button>
                <Button onClick={() => setShowDeleteDialog(true)} size="sm" variant="outline" className="border-[#ef4444]/30 text-[#ef4444] hover:bg-[#ef4444]/10 hover:text-[#ef4444]">
                  <Trash2 size={14} className="mr-2" />
                  DELETE
                </Button>
              </>
            )}
          </div>
        </header>

        <ScrollArea className="flex-1 bg-[#0b0f13]">
          <div className="p-6 space-y-6">

          {/* Dashboard View */}
          {activeView === 'dashboard' && (
            <div className="space-y-6">
              {/* No Active Game State */}
              {!currentRound && !isGameRunning && !isWaitingForConfig && (
                <div className="border border-dashed border-[#1e293b] rounded-xl bg-[#0b0f13]/50 p-12 flex flex-col items-center justify-center text-center">
                    <div className="rounded-full bg-[#1e293b] p-4 mb-4">
                      <Clock className="h-8 w-8 text-[#94a3b8]" />
                    </div>
                    <h3 className="text-sm font-bold mb-2 text-white uppercase tracking-wider">No Active Game</h3>
                    <p className="text-[#94a3b8] mb-6 max-w-sm text-xs">Start a new game session to begin trading rounds and broadcasts.</p>
                    <Button onClick={handlePrepareForNewGame} className="bg-[#10b981] hover:bg-[#059669] text-white text-xs font-bold uppercase tracking-wider">Initialize Game System</Button>
                </div>
              )}

              {/* Compact Stats */}
              {currentRound && (
              <div className="grid gap-3 md:grid-cols-4">
                {[
                  {
                    label: maxRound ? `Round (of ${maxRound})` : 'Round',
                    value: `#${currentRound.round_number}`,
                    sub: maxRound ? `${Math.round((currentRound.round_number / maxRound) * 100)}% complete` : undefined,
                    icon: RefreshCw,
                    color: maxRound && currentRound.round_number >= maxRound ? 'text-[#f59e0b]' : undefined
                  },
                  { label: 'Players', value: stats.activePlayers, icon: Users },
                  { label: 'Bets', value: stats.totalBets, icon: Database },
                  { label: 'Price', value: `$${currentPrice.toFixed(2)}`, sub: `${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}`, icon: TrendingUp, color: priceChange >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]' },
                ].map((stat, i) => (
                  <div key={i} className="bg-[#0b0f13] border border-[#1e293b] p-3 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                       <span className="text-[#94a3b8] text-[9px] uppercase font-bold tracking-wider">{stat.label}</span>
                       <stat.icon size={12} className="text-[#94a3b8]" />
                    </div>
                    <div className="text-xl font-mono font-bold text-white">{stat.value}</div>
                    {stat.sub && <div className={`text-[10px] font-bold mt-0.5 ${stat.color}`}>{stat.sub}</div>}
                  </div>
                ))}
              </div>
              )}

              {/* Round Info & Traders */}
              {currentRound && (
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="bg-[#0b0f13] border border-[#1e293b] rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <RefreshCw className="h-3 w-3 animate-spin text-[#f59e0b]" />
                        <h3 className="font-bold text-white text-[10px] uppercase tracking-wider">Round Info</h3>
                      </div>
                      <Badge variant="outline" className="border-[#10b981] text-[#10b981] bg-[#10b981]/10 text-[9px] h-5">ACTIVE</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-[#1e293b]/50 p-2 rounded">
                        <div className="text-[#94a3b8] text-[9px] uppercase font-bold mb-1">Start</div>
                        <div className="text-sm font-mono font-bold text-white">${currentRound.start_price.toFixed(2)}</div>
                      </div>
                      <div className="bg-[#1e293b]/50 p-2 rounded">
                        <div className="text-[#94a3b8] text-[9px] uppercase font-bold mb-1">Current</div>
                        <div className={`text-sm font-mono font-bold ${currentPrice >= currentRound.start_price ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>${currentPrice.toFixed(2)}</div>
                      </div>
                      <div className="bg-[#1e293b]/50 p-2 rounded">
                        <div className="text-[#94a3b8] text-[9px] uppercase font-bold mb-1">Time</div>
                        <div className={`text-sm font-mono font-bold flex items-center gap-1 ${countdown <= 5 ? 'text-[#ef4444] animate-pulse' : 'text-[#f59e0b]'}`}>
                          <Clock size={12} />{countdown}s
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#0b0f13] border border-[#1e293b] rounded-lg overflow-hidden">
                    <div className="border-b border-[#1e293b] bg-[#1e293b]/30 px-4 py-2 flex items-center justify-between">
                      <h3 className="font-bold text-white text-[10px] uppercase tracking-wider">Traders</h3>
                      <Badge variant="outline" className="border-[#94a3b8] text-[#94a3b8] text-[9px] h-4 px-1.5">{users.length}</Badge>
                    </div>
                    <div className="px-3 py-2 flex items-center justify-between border-b border-[#1e293b]/50">
                      <div className="text-[#94a3b8] text-[8px] uppercase font-bold">User</div>
                      <div className="text-[#94a3b8] text-[8px] uppercase font-bold">Balance</div>
                    </div>
                    <ScrollArea className="h-[140px]">
                      <div className="px-3 pb-2 space-y-1">
                        {users.slice(0, 10).map((user) => {
                          const userBet = currentRound ? currentBets.find(bet => bet.user_id === user.id && bet.round_id === currentRound.id) : null
                          const initials = user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 1)
                          return (
                            <div key={user.id} className="flex items-center justify-between py-1.5 hover:bg-[#1e293b]/30 rounded px-2 transition-colors">
                              <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
                                <div className="relative shrink-0">
                                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold ${userBet ? 'bg-[#10b981]' : 'bg-[#334155]'}`}>{initials}</div>
                                  <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-[#10b981] rounded-full border-2 border-[#0b0f13]"></div>
                                </div>
                                <span className="text-white text-[11px] font-medium truncate">{user.name}</span>
                              </div>
                              {userBet && (
                                <div className={`flex items-center gap-1 shrink-0 mr-2 ${userBet.prediction === 'up' ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                                  {userBet.prediction === 'up' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                  <span className="text-[10px] font-bold">${userBet.bet_amount}</span>
                                </div>
                              )}
                              <span className="text-[#94a3b8] text-[10px] font-mono">${user.balance?.toLocaleString()}</span>
                            </div>
                          )
                        })}
                      </div>
                    </ScrollArea>
                  </div>
                </div>
              )}

              {/* Market Activity */}
              {isGameRunning && (
                <div className="bg-[#0b0f13] border border-[#1e293b] rounded-lg overflow-hidden">
                  <div className="border-b border-[#1e293b] bg-[#1e293b]/30 px-4 py-2 flex items-center justify-between">
                    <h3 className="font-bold text-white text-[10px] uppercase tracking-wider">Recent Activity</h3>
                    <Badge variant="outline" className="border-[#94a3b8] text-[#94a3b8] text-[8px] h-4 px-1">{currentBets.length} trades</Badge>
                  </div>
                  <ScrollArea className="h-[200px]">
                    <Table>
                      <TableHeader className="bg-[#1e293b]/50 sticky top-0">
                        <TableRow className="border-[#1e293b] hover:bg-transparent">
                          <TableHead className="text-[#94a3b8] text-[9px] uppercase font-bold h-8 py-1">Time</TableHead>
                          <TableHead className="text-[#94a3b8] text-[9px] uppercase font-bold h-8 py-1">Trader</TableHead>
                          <TableHead className="text-[#94a3b8] text-[9px] uppercase font-bold h-8 py-1">Type</TableHead>
                          <TableHead className="text-[#94a3b8] text-[9px] uppercase font-bold h-8 py-1 text-right">Amount</TableHead>
                          <TableHead className="text-[#94a3b8] text-[9px] uppercase font-bold h-8 py-1 text-right">Payout</TableHead>
                          <TableHead className="text-[#94a3b8] text-[9px] uppercase font-bold h-8 py-1 text-right">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {currentBets.map((bet) => {
                          const user = users.find(u => u.id === bet.user_id)
                          const userName = bet.users?.name || user?.name || 'Unknown'
                          const initials = userName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 1)
                          return (
                            <TableRow key={bet.id} className="border-[#1e293b] hover:bg-[#1e293b]/30 h-8">
                              <TableCell className="py-1 text-[10px] font-mono text-[#94a3b8]">{new Date(bet.created_at).toLocaleTimeString()}</TableCell>
                              <TableCell className="py-1">
                                <div className="flex items-center gap-2">
                                  <div className="relative">
                                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center text-white text-[8px] font-bold">{initials}</div>
                                    <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-[#10b981] rounded-full border border-[#0b0f13]"></div>
                                  </div>
                                  <span className="text-[10px] text-white font-medium">{userName}</span>
                                </div>
                              </TableCell>
                              <TableCell className="py-1">
                                <span className={`text-[9px] font-bold px-2 py-1 rounded ${bet.prediction === 'up' ? 'bg-[#10b981]/20 text-[#10b981]' : 'bg-[#ef4444]/20 text-[#ef4444]'}`}>
                                  {bet.prediction === 'up' ? 'BUY / UP' : 'SELL / DOWN'}
                                </span>
                              </TableCell>
                              <TableCell className="py-1 text-[10px] font-mono text-right text-white">${bet.bet_amount.toLocaleString()}</TableCell>
                              <TableCell className="py-1 text-[10px] font-mono font-bold text-right">
                                {bet.result === 'won' && <span className="text-[#10b981]">+{bet.profit?.toFixed(0) || '0'}</span>}
                                {bet.result === 'lost' && <span className="text-[#ef4444]">-{bet.bet_amount}</span>}
                                {bet.result === 'pending' && <span className="text-[#94a3b8]">-</span>}
                              </TableCell>
                              <TableCell className="py-1 text-right">
                                {bet.result === 'won' && <span className="text-[9px] font-bold px-2 py-1 rounded border border-[#10b981] text-[#10b981]">WIN</span>}
                                {bet.result === 'lost' && <span className="text-[9px] font-bold px-2 py-1 rounded border border-[#ef4444] text-[#ef4444]">LOSS</span>}
                                {bet.result === 'pending' && <span className="text-[9px] font-bold px-2 py-1 rounded border border-[#94a3b8] text-[#94a3b8]">PENDING</span>}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                        {currentBets.length === 0 && (
                          <TableRow className="border-[#1e293b]">
                            <TableCell colSpan={6} className="py-4 text-center text-[10px] text-[#94a3b8]">No bets placed yet</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              )}

              {/* Config */}
              {isGameRunning && (
                <div className="bg-[#0b0f13] border border-[#1e293b] rounded-lg p-3">
                  <h3 className="font-bold text-white mb-2 text-[9px] uppercase tracking-widest">Config</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {[
                      { label: 'Update', value: `${priceUpdateInterval}s` },
                      { label: 'Win Rate', value: `${(winRate*100).toFixed(0)}%` },
                      { label: 'Bet Range', value: `$${minBetAmount}-${maxBetAmount}` },
                      { label: 'Penalty', value: `$${noBetPenalty}` },
                    ].map((item, i) => (
                      <div key={i} className="bg-[#1e293b]/50 p-2 rounded border border-[#1e293b]">
                        <div className="text-[#94a3b8] text-[8px] uppercase font-bold mb-0.5">{item.label}</div>
                        <div className="font-mono text-xs text-white">{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Users View */}
          {activeView === 'users' && (
             <div className="bg-[#0b0f13] border border-[#1e293b] rounded-lg flex flex-col h-[600px]">
              <div className="p-4 border-b border-[#1e293b] bg-[#1e293b]/20">
                <h3 className="font-bold text-white text-xs uppercase tracking-widest">User Management</h3>
              </div>
              <ScrollArea className="flex-1">
                <Table>
                  <TableHeader className="bg-[#1e293b]/50 sticky top-0">
                    <TableRow className="border-[#1e293b] hover:bg-transparent">
                      <TableHead className="text-[#94a3b8] text-[10px] uppercase font-bold">User</TableHead>
                      <TableHead className="text-[#94a3b8] text-[10px] uppercase font-bold">Balance</TableHead>
                      <TableHead className="text-[#94a3b8] text-[10px] uppercase font-bold">ID / Fingerprint</TableHead>
                      <TableHead className="text-[#94a3b8] text-[10px] uppercase font-bold">Joined</TableHead>
                      <TableHead className="text-right text-[#94a3b8] text-[10px] uppercase font-bold">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id} className="border-[#1e293b] hover:bg-[#1e293b]/30">
                        <TableCell className="font-bold text-white">{user.name}</TableCell>
                        <TableCell>
                          {editingUser === user.id ? (
                            <div className="flex items-center gap-2">
                              <Input type="number" value={editBalance} onChange={(e) => setEditBalance(parseFloat(e.target.value))} className="w-24 h-8 bg-[#0b0f13] border-[#334155] text-white" />
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-[#10b981] hover:bg-[#10b981]/10 hover:text-[#10b981]" onClick={() => handleUpdateUserBalance(user.id, editBalance)}>
                                <TrendingUp className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-[#ef4444] hover:bg-[#ef4444]/10 hover:text-[#ef4444]" onClick={() => setEditingUser(null)}>
                                <LogOut className="h-4 w-4 rotate-180" />
                              </Button>
                            </div>
                          ) : (
                            <span className="font-mono text-[#f59e0b]">${user.balance.toFixed(2)}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-[#94a3b8] text-xs font-mono">{user.fingerprint.substring(0, 12)}...</TableCell>
                        <TableCell className="text-[#94a3b8] text-xs">{new Date(user.created_at).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right">
                          {editingUser !== user.id && (
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="sm" className="h-8 text-xs border-[#334155] text-[#94a3b8] hover:text-white" onClick={() => { setEditingUser(user.id); setEditBalance(user.balance); }}>EDIT</Button>
                              <Button variant="ghost" size="sm" className="h-8 w-8 text-[#ef4444] hover:bg-[#ef4444]/10 hover:text-[#ef4444] p-0" onClick={() => { setUserToDelete(user.id); setShowDeleteUserDialog(true); }}>
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
             </div>
          )}

          {/* Settings View */}
          {activeView === 'settings' && (
            <div className="max-w-4xl space-y-6">
              <div className="bg-[#0b0f13] border border-[#1e293b] rounded-lg p-6">
                <h3 className="font-bold text-white mb-1 text-xs uppercase tracking-widest">Game Configuration</h3>
                <p className="text-xs text-[#94a3b8] mb-6">Adjust the core mechanics of the game rounds.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">Round Duration (s)</label>
                    <Input className="bg-[#1e293b] border-[#334155] text-white" type="number" value={roundDuration} onChange={(e) => { setRoundDuration(parseInt(e.target.value)||15); setHasUnsavedChanges(true); }} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">Price Update (s)</label>
                    <Input className="bg-[#1e293b] border-[#334155] text-white" type="number" value={priceUpdateInterval} onChange={(e) => { setPriceUpdateInterval(parseInt(e.target.value)||1); setHasUnsavedChanges(true); }} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">Win Rate (0.95 = 95%)</label>
                    <Input className="bg-[#1e293b] border-[#334155] text-white" type="number" value={(winRate * 100).toFixed(0)} onChange={(e) => { setWinRate(parseFloat(e.target.value)/100 || 0.95); setHasUnsavedChanges(true); }} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">Max Rounds (empty = unlimited)</label>
                    <Input className="bg-[#1e293b] border-[#334155] text-white" type="number" placeholder="Unlimited" value={maxRound || ''} onChange={(e) => { setMaxRound(e.target.value ? parseInt(e.target.value) : null); setHasUnsavedChanges(true); }} />
                    <p className="text-xs text-[#64748b]">Game ends and shows leaderboard after this many rounds</p>
                  </div>
                </div>
              </div>

              <div className="bg-[#0b0f13] border border-[#1e293b] rounded-lg p-6">
                <h3 className="font-bold text-white mb-1 text-xs uppercase tracking-widest">Financial Limits</h3>
                <p className="text-xs text-[#94a3b8] mb-6">Set limits for betting and balances.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">Default Balance ($)</label>
                    <Input className="bg-[#1e293b] border-[#334155] text-white" type="number" value={defaultUserBalance} onChange={(e) => { setDefaultUserBalance(parseFloat(e.target.value)||10000); setHasUnsavedChanges(true); }} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">Penalty ($)</label>
                    <Input className="bg-[#1e293b] border-[#334155] text-white" type="number" value={noBetPenalty} onChange={(e) => { setNoBetPenalty(parseFloat(e.target.value)||0); setHasUnsavedChanges(true); }} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">Min Bet ($)</label>
                    <Input className="bg-[#1e293b] border-[#334155] text-white" type="number" value={minBetAmount} onChange={(e) => { setMinBetAmount(parseFloat(e.target.value)||10); setHasUnsavedChanges(true); }} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">Max Bet ($)</label>
                    <Input className="bg-[#1e293b] border-[#334155] text-white" type="number" value={maxBetAmount} onChange={(e) => { setMaxBetAmount(parseFloat(e.target.value)||50000); setHasUnsavedChanges(true); }} />
                  </div>
                </div>
                <div className="mt-6 pt-6 border-t border-[#1e293b]">
                  <Button onClick={saveSettings} disabled={!hasUnsavedChanges || isSaving} className="w-full sm:w-auto bg-[#10b981] hover:bg-[#059669] text-white font-bold text-xs uppercase tracking-wider">
                    {isSaving ? 'Saving...' : 'Save Configuration'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Data View */}
          {activeView === 'data' && (
            <div className="max-w-4xl space-y-6">
              <div className="bg-[#0b0f13] border border-[#1e293b] rounded-lg p-6">
                <h3 className="font-bold text-white mb-4 text-xs uppercase tracking-widest">Database Maintenance</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border border-[#1e293b] rounded-lg bg-[#1e293b]/30">
                    <div>
                      <div className="font-bold text-white text-sm">Clear Price History</div>
                      <div className="text-xs text-[#94a3b8]">Removes all price records except the latest ones.</div>
                    </div>
                    <Button variant="outline" className="border-[#334155] text-[#94a3b8] hover:text-white" onClick={() => setShowCleanPricesDialog(true)}>Clear</Button>
                  </div>
                  <div className="flex items-center justify-between p-4 border border-[#1e293b] rounded-lg bg-[#1e293b]/30">
                    <div>
                      <div className="font-bold text-white text-sm">Clear Old Rounds</div>
                      <div className="text-xs text-[#94a3b8]">Removes completed rounds older than 24 hours.</div>
                    </div>
                    <Button variant="outline" className="border-[#334155] text-[#94a3b8] hover:text-white" onClick={() => setShowCleanRoundsDialog(true)}>Clear</Button>
                  </div>
                </div>
              </div>

              <div className="bg-[#0b0f13] border border-[#ef4444]/30 rounded-lg p-6">
                <h3 className="font-bold text-[#ef4444] mb-4 text-xs uppercase tracking-widest">Danger Zone</h3>
                <div className="space-y-4">
                  <div className="bg-[#ef4444]/10 border border-[#ef4444]/20 p-4 rounded-lg flex items-start gap-3 text-[#ef4444] text-xs">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <p>This action will wipe ALL data including users, bets, and settings. This cannot be undone.</p>
                  </div>
                  <Button variant="destructive" className="w-full text-xs uppercase tracking-wider font-bold" onClick={() => setShowResetAllDialog(true)}>Reset Entire System</Button>
                </div>
              </div>
            </div>
          )}
          </div>
        </ScrollArea>
      </div>

      {/* Confirmation Dialogs */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="bg-[#0b0f13] border-[#1e293b] text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Delete Current Game?</DialogTitle>
            <DialogDescription className="text-[#94a3b8]">This will end the current round and stop the game.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="border-[#334155] text-[#94a3b8] hover:text-white" onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { setShowDeleteDialog(false); handleDeleteCurrentGame() }}>Delete Game</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteUserDialog} onOpenChange={setShowDeleteUserDialog}>
        <DialogContent className="bg-[#0b0f13] border-[#1e293b] text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Delete User?</DialogTitle>
            <DialogDescription className="text-[#94a3b8]">This will permanently delete this user and all their bets.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="border-[#334155] text-[#94a3b8] hover:text-white" onClick={() => setShowDeleteUserDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { setShowDeleteUserDialog(false); if (userToDelete) { handleDeleteUser(userToDelete); setUserToDelete(null) } }}>Delete User</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCleanPricesDialog} onOpenChange={setShowCleanPricesDialog}>
        <DialogContent className="bg-[#0b0f13] border-[#1e293b] text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Clean Price History?</DialogTitle>
            <DialogDescription className="text-[#94a3b8]">This will delete all price history and reset to starting price.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="border-[#334155] text-[#94a3b8] hover:text-white" onClick={() => setShowCleanPricesDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { setShowCleanPricesDialog(false); handleCleanPriceHistory() }}>Clean History</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCleanRoundsDialog} onOpenChange={setShowCleanRoundsDialog}>
        <DialogContent className="bg-[#0b0f13] border-[#1e293b] text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Clean Old Rounds?</DialogTitle>
            <DialogDescription className="text-[#94a3b8]">This will delete all completed rounds older than 24 hours.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="border-[#334155] text-[#94a3b8] hover:text-white" onClick={() => setShowCleanRoundsDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { setShowCleanRoundsDialog(false); handleCleanOldRounds() }}>Clean Rounds</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showResetAllDialog} onOpenChange={setShowResetAllDialog}>
        <DialogContent className="bg-[#0b0f13] border-[#1e293b] text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Reset All Data?</DialogTitle>
            <DialogDescription className="text-[#94a3b8]">This will permanently delete ALL data. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="border-[#334155] text-[#94a3b8] hover:text-white" onClick={() => setShowResetAllDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { setShowResetAllDialog(false); handleResetAllData() }}>Reset Everything</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
