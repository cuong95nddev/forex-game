import { Router } from 'express'
import { supabase } from '../config.js'
import { loadSettings } from '../engine/gameLoop.js'

const router = Router()

// GET /api/settings
router.get('/', async (_req, res) => {
  const { data } = await supabase
    .from('game_settings')
    .select('*')
    .limit(1)
    .single()

  res.json(data)
})

// PUT /api/settings
router.put('/', async (req, res) => {
  const {
    round_duration,
    price_update_interval,
    win_rate,
    default_user_balance,
    min_bet_amount,
    max_bet_amount,
    no_bet_penalty,
    max_round,
    game_status,
  } = req.body

  const { data: current } = await supabase
    .from('game_settings')
    .select('id')
    .limit(1)
    .single()

  if (!current) {
    res.status(404).json({ error: 'Settings not found' })
    return
  }

  const { error } = await supabase
    .from('game_settings')
    .update({
      round_duration,
      price_update_interval,
      win_rate,
      default_user_balance,
      min_bet_amount,
      max_bet_amount,
      no_bet_penalty,
      max_round,
      game_status,
      updated_at: new Date().toISOString()
    })
    .eq('id', current.id)

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  // Reload in-memory settings
  await loadSettings()

  res.json({ success: true })
})

export default router
