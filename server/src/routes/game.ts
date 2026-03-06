import { Router } from 'express'
import * as gameLoop from '../engine/gameLoop.js'
import { broadcastGameStarted, broadcastWaiting, broadcastClearGame } from '../services/broadcast.js'
import { supabase } from '../config.js'

const router = Router()

// GET /api/game/status
router.get('/status', async (_req, res) => {
  const state = gameLoop.getState()

  // Load stats
  const { count: roundCount } = await supabase
    .from('rounds')
    .select('*', { count: 'exact', head: true })

  const { count: betCount } = await supabase
    .from('bets')
    .select('*', { count: 'exact', head: true })

  const { count: userCount } = await supabase
    .from('presence')
    .select('*', { count: 'exact', head: true })
    .eq('session_type', 'user')
    .gte('last_seen', new Date(Date.now() - 30000).toISOString())

  // Load users
  const { data: users } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false })

  // Load recent bets
  const { data: bets } = await supabase
    .from('bets')
    .select('*, users(name)')
    .order('created_at', { ascending: false })
    .limit(50)

  res.json({
    ...state,
    stats: {
      totalRounds: roundCount || 0,
      activePlayers: userCount || 0,
      totalBets: betCount || 0,
    },
    users: users || [],
    bets: bets || [],
  })
})

// POST /api/game/start
router.post('/start', async (req, res) => {
  try {
    const config = req.body
    await gameLoop.start(config)
    broadcastGameStarted()
    res.json({ success: true })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// POST /api/game/stop
router.post('/stop', (_req, res) => {
  gameLoop.stop()
  res.json({ success: true })
})

// POST /api/game/resume
router.post('/resume', (_req, res) => {
  gameLoop.resume()
  res.json({ success: true })
})

// POST /api/game/delete
router.post('/delete', async (_req, res) => {
  try {
    await gameLoop.deleteGame()
    const state = gameLoop.getState()
    broadcastClearGame(state.currentPrice)
    res.json({ success: true })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// POST /api/game/prepare-new
router.post('/prepare-new', async (_req, res) => {
  try {
    await gameLoop.prepareNewGame()
    broadcastWaiting()
    res.json({ success: true })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// POST /api/game/end
router.post('/end', async (_req, res) => {
  try {
    const leaderboard = await gameLoop.triggerEndGame()
    res.json({ success: true, leaderboard })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

export default router
