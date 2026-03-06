import { supabase } from '../config.js'
import type { Round } from '../types.js'

let broadcastChannel: any = null

export async function initBroadcast() {
  broadcastChannel = supabase.channel('game-state')
  await broadcastChannel.subscribe()
  console.log('Broadcast channel initialized')
}

export function getBroadcastChannel() {
  return broadcastChannel
}

function httpBroadcast(event: string, payload: Record<string, any>) {
  if (!broadcastChannel) return
  broadcastChannel.httpSend(event, payload)
}

export function broadcastGameState(payload: {
  countdown: number
  currentRound: Round | null
  goldPrice: { price: number; change: number; timestamp: string }
  roundDuration?: number
  winRate?: number
  minBetAmount?: number
  maxBetAmount?: number
}) {
  httpBroadcast('game-state', {
    adminSessionId: 'server',
    ...payload
  })
}

export function broadcastGameStarted() {
  httpBroadcast('game-started', {
    adminSessionId: 'server',
    isWaiting: false,
    isGameCompleted: false
  })
}

export function broadcastGameCompleted(leaderboard: any[], maxRound: number | null) {
  httpBroadcast('game-completed', {
    adminSessionId: 'server',
    leaderboard,
    maxRound
  })
}

export function broadcastWaiting() {
  httpBroadcast('game-state', {
    adminSessionId: 'server',
    isWaiting: true,
    currentRound: null,
    countdown: 0
  })
}

export function broadcastNoBetPenalty(penalizedUserIds: string[], penaltyAmount: number, roundNumber: number) {
  httpBroadcast('no-bet-penalty', { penalizedUserIds, penaltyAmount, roundNumber })
}

export function broadcastSystemReset() {
  httpBroadcast('system-reset', {
    adminSessionId: 'server',
    message: 'System has been reset. Please refresh and login again.'
  })
}

export function broadcastClearGame(currentPrice: number) {
  httpBroadcast('game-state', {
    adminSessionId: 'server',
    currentRound: null,
    countdown: 0,
    goldPrice: { price: currentPrice, change: 0, timestamp: new Date().toISOString() }
  })
}
