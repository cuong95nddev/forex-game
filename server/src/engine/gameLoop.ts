import { supabase } from '../config.js'
import type { Round, GameSettings, GameState } from '../types.js'
import { nextPrice, resetTrend } from './priceSimulator.js'
import { startNewRound, completeRound, endGame } from './roundManager.js'
import { startSkillProcessor, stopSkillProcessor } from './skillProcessor.js'
import { broadcastGameState } from '../services/broadcast.js'

let isRunning = false
let currentRound: Round | null = null
let currentPrice = 2000
let priceChange = 0
let countdown = 0
let settings: GameSettings | null = null

let priceTickInterval: ReturnType<typeof setInterval> | null = null
let countdownInterval: ReturnType<typeof setInterval> | null = null

export async function loadSettings(): Promise<GameSettings | null> {
  const { data } = await supabase
    .from('game_settings')
    .select('*')
    .limit(1)
    .single()

  if (data) {
    settings = data as GameSettings
  }
  return settings
}

export function getState(): GameState {
  return {
    isRunning,
    currentRound,
    currentPrice,
    priceChange,
    countdown,
    settings
  }
}

export async function start(config: {
  roundDuration: number
  priceUpdateInterval: number
  winRate: number
  defaultUserBalance: number
  minBetAmount: number
  maxBetAmount: number
  noBetPenalty: number
  maxRound: number | null
}) {
  if (!settings) await loadSettings()
  if (!settings) throw new Error('No game settings found')

  // Update settings in DB
  await supabase
    .from('game_settings')
    .update({
      round_duration: config.roundDuration,
      price_update_interval: config.priceUpdateInterval,
      win_rate: config.winRate / 100,
      default_user_balance: config.defaultUserBalance,
      min_bet_amount: config.minBetAmount,
      max_bet_amount: config.maxBetAmount,
      no_bet_penalty: config.noBetPenalty,
      max_round: config.maxRound,
      game_status: 'running',
      updated_at: new Date().toISOString()
    })
    .eq('id', settings.id)

  // Reload settings
  await loadSettings()

  // Delete game history
  await supabase.from('bets').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('rounds').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('gold_prices').delete().neq('id', '00000000-0000-0000-0000-000000000000')

  // Reset user balances
  await supabase
    .from('users')
    .update({ balance: config.defaultUserBalance })
    .neq('id', '00000000-0000-0000-0000-000000000000')

  // Ensure all users have all skills
  const { data: allSkills } = await supabase.from('skill_definitions').select('id')
  if (allSkills) {
    const { data: allUsers } = await supabase.from('users').select('id')
    if (allUsers) {
      const skillInserts = []
      for (const user of allUsers) {
        for (const skill of allSkills) {
          skillInserts.push({ user_id: user.id, skill_id: skill.id, quantity: 1 })
        }
      }
      if (skillInserts.length > 0) {
        await supabase
          .from('user_skills')
          .upsert(skillInserts, { onConflict: 'user_id,skill_id', ignoreDuplicates: false })
      }
    }
  }

  // Clear frozen users
  await supabase.from('frozen_users').delete().neq('id', '00000000-0000-0000-0000-000000000000')

  // Seed historical price data
  const historicalPrices = []
  const now = new Date()
  let historicalPrice = 2000
  for (let i = 50; i >= 0; i--) {
    const variation = (Math.random() - 0.5) * 20
    historicalPrice = Math.max(1900, Math.min(2100, historicalPrice + variation))
    historicalPrices.push({
      price: Math.round(historicalPrice * 100) / 100,
      change: variation,
      timestamp: new Date(now.getTime() - (i * 1000)).toISOString()
    })
  }
  await supabase.from('gold_prices').insert(historicalPrices)

  // Reset price state
  currentPrice = 2000
  priceChange = 0
  resetTrend()

  // Start skill processor
  startSkillProcessor()

  // Start first round
  const round = await startNewRound(2000, settings!)
  if (round) {
    currentRound = round
    startCountdown(round)
  }

  // Start price tick
  startPriceTick()

  isRunning = true
  console.log('Game started')
}

export function stop() {
  isRunning = false
  stopPriceTick()
  stopCountdown()
  console.log('Game paused')
}

export function resume() {
  if (!settings || !currentRound) return
  isRunning = true
  startPriceTick()
  startCountdown(currentRound)
  console.log('Game resumed')
}

export async function deleteGame() {
  stop()
  stopSkillProcessor()

  if (currentRound) {
    await supabase
      .from('rounds')
      .update({
        status: 'completed',
        end_time: new Date().toISOString(),
        end_price: currentPrice
      })
      .eq('id', currentRound.id)
  }

  currentRound = null
  countdown = 0
}

export async function prepareNewGame() {
  stop()
  stopSkillProcessor()

  if (currentRound) {
    await supabase
      .from('rounds')
      .update({
        status: 'completed',
        end_time: new Date().toISOString(),
        end_price: currentPrice
      })
      .eq('id', currentRound.id)

    currentRound = null
  }
  countdown = 0
}

export async function triggerEndGame() {
  stop()
  stopSkillProcessor()

  if (!settings) await loadSettings()
  if (!settings) return []

  const leaderboard = await endGame(settings)
  currentRound = null
  countdown = 0
  return leaderboard
}

export async function tryResumeFromDb() {
  await loadSettings()

  // Load current price
  const { data: priceData } = await supabase
    .from('gold_prices')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(1)
    .single()

  if (priceData) {
    currentPrice = priceData.price
    priceChange = priceData.change
  }

  // Check for active round
  const { data: activeRound } = await supabase
    .from('rounds')
    .select('*')
    .eq('status', 'active')
    .order('round_number', { ascending: false })
    .limit(1)
    .single()

  if (activeRound && settings && settings.game_status === 'running') {
    currentRound = activeRound as Round

    // Calculate remaining time
    const startTime = new Date(activeRound.start_time).getTime()
    const elapsed = Math.floor((Date.now() - startTime) / 1000)
    const remaining = Math.max(0, settings.round_duration - elapsed)

    if (remaining <= 0) {
      // Round expired during downtime, complete it
      console.log('Completing expired round...')
      const { endPrice, shouldEndGame } = await completeRound(currentRound, settings)
      if (shouldEndGame) {
        await endGame(settings)
        currentRound = null
      } else {
        const newRound = await startNewRound(endPrice, settings)
        currentRound = newRound
        if (newRound) {
          startCountdown(newRound)
          startPriceTick()
          startSkillProcessor()
          isRunning = true
        }
      }
    } else {
      countdown = remaining
      startCountdown(currentRound)
      startPriceTick()
      startSkillProcessor()
      isRunning = true
      console.log(`Resumed: round ${activeRound.round_number}, ${remaining}s remaining`)
    }
  } else {
    console.log('No active game to resume')
  }
}

// --- Internal ---

function startPriceTick() {
  stopPriceTick()
  if (!settings) return

  priceTickInterval = setInterval(async () => {
    if (!isRunning) return

    const result = nextPrice(currentPrice)
    currentPrice = result.price
    const change = currentRound ? result.price - currentRound.start_price : result.change

    priceChange = change

    await supabase.from('gold_prices').insert({
      price: result.price,
      change,
      timestamp: new Date().toISOString()
    })
  }, (settings.price_update_interval || 1) * 1000)
}

function stopPriceTick() {
  if (priceTickInterval) {
    clearInterval(priceTickInterval)
    priceTickInterval = null
  }
}

function startCountdown(round: Round) {
  stopCountdown()
  if (!settings) return

  const startTime = new Date(round.start_time).getTime()
  const fixedDuration = settings.round_duration

  const tick = async () => {
    if (!isRunning) return

    const now = Date.now()
    const elapsed = Math.floor((now - startTime) / 1000)
    const remaining = Math.max(0, fixedDuration - elapsed)
    countdown = remaining

    // Broadcast game state
    broadcastGameState({
      countdown: remaining,
      currentRound: round,
      goldPrice: {
        price: currentPrice,
        change: currentPrice - round.start_price,
        timestamp: new Date().toISOString()
      },
      roundDuration: fixedDuration,
      winRate: settings!.win_rate,
      minBetAmount: settings!.min_bet_amount,
      maxBetAmount: settings!.max_bet_amount
    })

    if (remaining === 0) {
      stopCountdown()
      await onRoundComplete(round)
    }
  }

  tick()
  countdownInterval = setInterval(tick, 1000)
}

function stopCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval)
    countdownInterval = null
  }
}

async function onRoundComplete(round: Round) {
  if (!settings) return

  try {
    const { endPrice, shouldEndGame } = await completeRound(round, settings)

    if (shouldEndGame) {
      stop()
      stopSkillProcessor()
      await endGame(settings)
      currentRound = null
      countdown = 0
      console.log('Game ended (max round reached)')
    } else {
      const newRound = await startNewRound(endPrice, settings)
      if (newRound) {
        currentRound = newRound
        startCountdown(newRound)
      } else {
        // startNewRound returned null (max round exceeded)
        stop()
        stopSkillProcessor()
        await endGame(settings)
        currentRound = null
        countdown = 0
      }
    }
  } catch (error) {
    console.error('Error completing round:', error)
  }
}
