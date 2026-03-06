import { Router } from 'express'
import { supabase } from '../config.js'

const router = Router()

// GET /api/users
router.get('/', async (_req, res) => {
  const { data } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false })

  res.json(data || [])
})

// PUT /api/users/:id/balance
router.put('/:id/balance', async (req, res) => {
  const { id } = req.params
  const { balance } = req.body

  const { error } = await supabase
    .from('users')
    .update({ balance })
    .eq('id', id)

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.json({ success: true })
})

// DELETE /api/users/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params

  const { error } = await supabase
    .from('users')
    .delete()
    .eq('id', id)

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.json({ success: true })
})

export default router
