import { useEffect, useState, useRef } from 'react'
import { TrendingUp, TrendingDown, Clock, DollarSign, Users, Database } from 'lucide-react'
import { useStore } from '../store/useStore'
import TradingChart from './TradingChart'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Progress } from '@/components/ui/progress'

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
    priceHistory,
    loadPriceHistory,
    winRate,
    onlineUsers,
    loadOnlineUsers
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
    loadPriceHistory()
    loadOnlineUsers()
    
    // Refresh online users every 5 seconds
    const interval = setInterval(() => {
      loadOnlineUsers()
    }, 5000)
    
    return () => clearInterval(interval)
  }, [loadRecentBets, loadPriceHistory, loadOnlineUsers])

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
    if (goldPrice && currentRound) {
      setChartPrices(prev => {
        const newPoint = {
          time: new Date(goldPrice.timestamp).getTime() / 1000,
          value: goldPrice.price
        }
        
        // Add new price point
        const updated = [...prev, newPoint]
        
        // Keep only prices from current round (or last 50 points)
        const maxPoints = 50
        if (updated.length > maxPoints) {
          return updated.slice(-maxPoints)
        }
        
        return updated
      })
    }
  }, [goldPrice, currentRound])

  // Show loading state if no user or goldPrice
  if (!user || !goldPrice) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-xl">Đang tải dữ liệu...</p>
        </div>
      </div>
    )
  }

  const handleBet = async (prediction: 'up' | 'down') => {
    const amount = parseFloat(betAmount)
    if (isNaN(amount) || amount <= 0) {
      toast.error('Số tiền không hợp lệ!')
      return
    }
    
    if (!user || amount > user.balance) {
      toast.error('Số dư không đủ!')
      return
    }

    const success = await placeBet(prediction, amount)
    if (success) {
      setBetAmount('100')
    }
  }

  if (!user || !goldPrice) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-xl">Đang tải dữ liệu...</p>
          {!user && <p className="text-muted-foreground mt-2">Đang tải thông tin người dùng...</p>}
          {!goldPrice && <p className="text-muted-foreground mt-2">Đang tải giá vàng...</p>}
        </div>
      </div>
    )
  }

  const priceChange = goldPrice?.change || 0
  const priceChangePercent = goldPrice ? ((priceChange / goldPrice.price) * 100).toFixed(2) : '0.00'
  const isPositive = priceChange >= 0

  const quickAmounts = [100, 500, 1000, 5000]
  return (
    <div className="min-h-screen bg-background">
      {/* Top Bar */}
      <Card className="rounded-none border-x-0 border-t-0 bg-gradient-to-r from-card via-card/95 to-card border-b-2 border-b-primary/20 shadow-lg">
        <CardContent className="p-4">
          <div className="flex justify-between items-center max-w-[1800px] mx-auto">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#f59e0b] via-[#d97706] to-[#b45309] flex items-center justify-center shadow-xl glow-gold">
                  <DollarSign size={28} className="text-white font-bold" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-[#f59e0b] to-[#fbbf24] bg-clip-text text-transparent">GOLD TRADE</h1>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">XAU/USD Trading Platform</p>
                </div>
                <Badge className="animate-pulse ml-2 bg-red-600 hover:bg-red-600 text-white font-bold px-3 py-1 shadow-lg">
                  ● LIVE
                </Badge>
              </div>
              <Separator orientation="vertical" className="h-10 bg-border" />
              <div className="flex items-center gap-2 bg-card/30 px-3 py-2 rounded-lg border border-border/50">
                <Users size={18} className="text-primary" />
                <span className="text-sm font-medium text-muted-foreground">Online:</span>
                <Badge variant="outline" className="bg-primary/15 text-primary border-primary/40 font-bold text-base px-2.5">
                  {onlineUsers}
                </Badge>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className={`text-right bg-gradient-to-br from-card to-card/50 px-6 py-3 rounded-xl border-2 border-[#f59e0b]/30 shadow-xl glow-gold transition-all duration-300 ${
                balanceFlash ? 'scale-105 ring-4 ring-[#f59e0b]/50' : ''
              }`}>
                <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Số Dư Tài Khoản</div>
                <div className={`text-2xl font-bold flex items-center gap-1.5 bg-gradient-to-r from-[#f59e0b] to-[#fbbf24] bg-clip-text text-transparent transition-all duration-300 ${
                  balanceFlash ? 'scale-110' : ''
                }`}>
                  <DollarSign size={24} className="text-[#f59e0b]" />
                  {user?.balance.toLocaleString()} ₫
                </div>
              </div>
              <Avatar className="h-12 w-12 ring-2 ring-primary/40 shadow-lg">
                <AvatarFallback className="font-bold bg-gradient-to-br from-primary/30 to-primary/20 text-primary text-lg">
                  {user?.name[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="max-w-[1800px] mx-auto p-6">
        <div className="grid grid-cols-12 gap-6">
          {/* Main Chart Area */}
          <div className="col-span-9 space-y-4">
            {/* Price Header */}
            <Card className="bg-gradient-to-br from-card via-card/95 to-card/90 border-2 border-border shadow-2xl">
              <CardContent className="p-8">
                <div className="flex items-center justify-between">
                  <div>
                    <CardDescription className="mb-3 text-sm font-bold uppercase tracking-widest text-[#f59e0b]">XAU/USD - Gold Spot Price</CardDescription>
                    <div className="flex items-center gap-4">
                      <div className={`text-4xl font-bold transition-all duration-300 tabular-nums ${
                        priceFlash === 'up' ? 'scale-110 text-[#10b981] drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]' : 
                        priceFlash === 'down' ? 'scale-110 text-[#ef4444] drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]' : 'text-foreground'
                      }`}>
                        ${goldPrice?.price.toFixed(2) || '0.00'}
                      </div>
                      <Badge 
                        className={`flex items-center gap-2 px-4 py-2 text-base font-bold shadow-2xl border-2 ${
                          isPositive 
                            ? 'bg-[#10b981] hover:bg-[#10b981] border-[#10b981]/50 glow-green' 
                            : 'bg-[#ef4444] hover:bg-[#ef4444] border-[#ef4444]/50 glow-red'
                        } ${
                          priceFlash ? 'animate-pulse' : ''
                        }`}
                      >
                        {isPositive ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                        <span className="font-extrabold">
                          {isPositive ? '+' : ''}{priceChange.toFixed(2)} ({isPositive ? '+' : ''}{priceChangePercent}%)
                        </span>
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <CardDescription className="mb-3 text-sm font-bold uppercase tracking-widest text-primary">Thời Gian Còn Lại</CardDescription>
                    <div className="flex flex-col items-end gap-3">
                      <div className={`flex items-center gap-3 px-4 py-2 rounded-xl ${
                        countdown <= 5 ? 'bg-destructive/20 border-2 border-destructive/50' : 'bg-primary/10 border-2 border-primary/30'
                      }`}>
                        <Clock size={24} className={countdown <= 5 ? 'text-destructive' : 'text-primary'} />
                        <span className={`text-3xl font-bold tabular-nums ${
                          countdown <= 5 ? 'animate-pulse text-destructive drop-shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'text-primary'
                        }`}>
                          {countdown}s
                        </span>
                      </div>
                      <Progress 
                        value={(countdown / 15) * 100} 
                        className={`w-48 h-4 ${
                          countdown <= 5 ? 'bg-destructive/20' : 'bg-primary/20'
                        }`} 
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Chart */}
            <Card className="bg-gradient-to-br from-card to-card/80 border-2 border-border/50 shadow-xl">
              <CardContent className="p-6">
                <TradingChart prices={chartPrices} />
              </CardContent>
            </Card>

            {/* Recent Bets Table */}
            <Card className="bg-gradient-to-br from-card to-card/80 border-2 border-border/50 shadow-xl">
              <CardHeader className="bg-card/50 border-b border-border/50">
                <CardTitle className="text-xl font-bold uppercase tracking-wider flex items-center gap-2">
                  <Database size={20} className="text-primary" />
                  Lệnh Gần Đây
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Thời gian</TableHead>
                      <TableHead>Người chơi</TableHead>
                      <TableHead>Dự đoán</TableHead>
                      <TableHead className="text-right">Số tiền</TableHead>
                      <TableHead className="text-right">Kết quả</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentBets.slice(0, 10).map((bet) => (
                      <TableRow key={bet.id}>
                        <TableCell>
                          {new Date(bet.created_at).toLocaleTimeString('vi-VN')}
                        </TableCell>
                        <TableCell>User-{bet.user_id.slice(0, 8)}</TableCell>
                        <TableCell>
                          <Badge 
                            variant={bet.prediction === 'up' ? 'default' : 'destructive'}
                          >
                            {bet.prediction === 'up' ? '↑ TĂNG' : '↓ GIẢM'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">${bet.bet_amount.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          {bet.result === 'pending' ? (
                            <Badge variant="outline">Chờ</Badge>
                          ) : bet.result === 'won' ? (
                            <span className="font-semibold">+${bet.profit.toLocaleString()}</span>
                          ) : (
                            <span className="font-semibold">-${bet.bet_amount.toLocaleString()}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* Trading Panel */}
          <div className="col-span-3">
            <Card className="sticky top-6 bg-gradient-to-br from-card via-card to-card/90 border-2 border-[#f59e0b]/30 shadow-2xl glow-gold">
              <CardHeader className="text-center border-b-2 border-[#f59e0b]/30 bg-gradient-to-br from-card to-card/50">
                <CardTitle className="text-2xl font-extrabold uppercase tracking-widest bg-gradient-to-r from-[#f59e0b] to-[#fbbf24] bg-clip-text text-transparent">
                  ĐẶT LỆNH NGAY
                </CardTitle>
                <CardDescription className="text-xs uppercase tracking-wider font-semibold mt-1">Trading Panel</CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                {/* Current Round Info */}
                {currentRound && (
                  <Card className="mb-6 bg-gradient-to-br from-primary/15 to-primary/5 border-2 border-primary/40 shadow-lg glow-green">
                    <CardContent className="p-5 text-center">
                      <CardDescription className="mb-2 uppercase text-xs tracking-widest font-bold text-primary">Vòng Hiện Tại</CardDescription>
                      <div className="text-5xl font-extrabold text-primary drop-shadow-[0_0_10px_rgba(16,185,129,0.3)]">
                        #{currentRound.round_number}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {userBet ? (
                  <div className="space-y-4">
                    <Card className={`border-3 shadow-xl ${
                      userBet.prediction === 'up' 
                        ? 'border-[#10b981] bg-gradient-to-br from-[#10b981]/10 to-[#10b981]/5 glow-green' 
                        : 'border-[#ef4444] bg-gradient-to-br from-[#ef4444]/10 to-[#ef4444]/5 glow-red'
                    }`}>
                      <CardContent className="p-6 text-center">
                        <CardDescription className="mb-3 uppercase text-xs tracking-widest font-bold">Lệnh Của Bạn</CardDescription>
                        <Badge 
                          className={`text-xl px-6 py-3 mb-4 font-extrabold shadow-xl border-2 ${
                            userBet.prediction === 'up' 
                              ? 'bg-gradient-to-br from-[#10b981] to-[#059669] hover:bg-[#10b981] border-[#10b981]/50' 
                              : 'bg-gradient-to-br from-[#ef4444] to-[#dc2626] hover:bg-[#ef4444] border-[#ef4444]/50'
                          }`}
                        >
                          {userBet.prediction === 'up' ? '↑ TĂNG' : '↓ GIẢM'}
                        </Badge>
                        <div className={`text-2xl font-extrabold mb-2 ${
                          userBet.prediction === 'up' ? 'text-[#10b981]' : 'text-[#ef4444]'
                        }`}>
                          ${userBet.bet_amount.toLocaleString()}
                        </div>
                        <CardDescription className="mt-3 text-sm font-semibold">
                          ⏳ Chờ kết quả vòng này...
                        </CardDescription>
                      </CardContent>
                    </Card>
                    <p className="text-center text-sm text-muted-foreground">
                      Mỗi vòng chỉ được đặt 1 lần
                    </p>
                  </div>
                ) : countdown > 0 && countdown >= 3 ? (
                  <div className="space-y-4">
                    {/* Bet Amount */}
                    <div>
                      <label className="block text-sm text-muted-foreground mb-2 font-medium">
                        Số tiền cược
                      </label>
                      <Input
                        type="number"
                        value={betAmount}
                        onChange={(e) => setBetAmount(e.target.value)}
                        className="text-lg font-semibold"
                        placeholder="Nhập số tiền"
                      />
                    </div>

                    {/* Quick Amount Buttons */}
                    <div className="grid grid-cols-2 gap-2">
                      {quickAmounts.map((amount) => (
                        <Button
                          key={amount}
                          onClick={() => setBetAmount(amount.toString())}
                          variant="outline"
                        >
                          ${amount}
                        </Button>
                      ))}
                    </div>

                    {/* Bet Buttons */}
                    <div className="grid grid-cols-2 gap-4 mt-6">
                      <Button
                        onClick={() => handleBet('up')}
                        disabled={!currentRound || countdown <= 0 || countdown < 3}
                        className="h-24 flex flex-col gap-2 bg-gradient-to-br from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white font-extrabold shadow-2xl border-3 border-[#10b981]/50 transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed glow-green"
                      >
                        <TrendingUp size={28} strokeWidth={3} />
                        <span className="text-xl font-extrabold tracking-wide">TĂNG</span>
                        <span className="text-sm opacity-95 font-bold bg-white/20 px-3 py-1 rounded-full">x{(1 + winRate).toFixed(2)}</span>
                      </Button>
                      
                      <Button
                        onClick={() => handleBet('down')}
                        disabled={!currentRound || countdown <= 0 || countdown < 3}
                        className="h-24 flex flex-col gap-2 bg-gradient-to-br from-[#ef4444] to-[#dc2626] hover:from-[#dc2626] hover:to-[#b91c1c] text-white font-extrabold shadow-2xl border-3 border-[#ef4444]/50 transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed glow-red"
                      >
                        <TrendingDown size={28} strokeWidth={3} />
                        <span className="text-xl font-extrabold tracking-wide">GIẢM</span>
                        <span className="text-sm opacity-95 font-bold bg-white/20 px-3 py-1 rounded-full">x{(1 + winRate).toFixed(2)}</span>
                      </Button>
                    </div>

                    <div className="text-xs text-center text-muted-foreground mt-4 space-y-1">
                      <p>Đặt lệnh trước khi hết thời gian</p>
                      <p className="font-medium">
                        🏆 Thắng nhận: x{(1 + winRate).toFixed(2)} (Đặt $100 → Nhận ${(100 * (1 + winRate)).toFixed(0)})
                      </p>
                    </div>
                  </div>
                ) : countdown > 0 && countdown < 3 ? (
                  <div className="text-center py-8">
                    <div className="text-4xl mb-2">⏳</div>
                    <CardDescription className="text-lg font-semibold">Chờ kết quả vòng này...</CardDescription>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="text-4xl mb-2">⏳</div>
                    <CardDescription>Đang chờ vòng mới...</CardDescription>
                  </div>
                )}

                {/* Info */}
                <Separator className="my-6" />
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Mỗi vòng:</span>
                    <Badge variant="outline">15 giây</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Thắng:</span>
                    <Badge>
                      x{(1 + winRate).toFixed(2)} tiền cược
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Thua:</span>
                    <Badge variant="destructive">
                      Mất tiền cược
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
