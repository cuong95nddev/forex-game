import { Router } from 'express'
import { supabase } from '../config.js'
import { broadcastSystemReset } from '../services/broadcast.js'

const router = Router()

// POST /api/data/reset
router.post('/reset', async (_req, res) => {
  try {
    broadcastSystemReset()

    await supabase.from('bets').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('rounds').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('gold_prices').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('users').delete().neq('id', '00000000-0000-0000-0000-000000000000')

    // Reinitialize price
    await supabase.from('gold_prices').insert({ price: 2000, change: 0 })

    res.json({ success: true })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// POST /api/data/clean-prices
router.post('/clean-prices', async (_req, res) => {
  try {
    await supabase
      .from('gold_prices')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')

    await supabase.from('gold_prices').insert({ price: 2000, change: 0 })

    res.json({ success: true })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// POST /api/data/clean-rounds
router.post('/clean-rounds', async (_req, res) => {
  try {
    const oneDayAgo = new Date()
    oneDayAgo.setHours(oneDayAgo.getHours() - 24)

    await supabase
      .from('rounds')
      .delete()
      .eq('status', 'completed')
      .lt('end_time', oneDayAgo.toISOString())

    res.json({ success: true })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

export default router
