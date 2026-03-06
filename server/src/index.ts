import express from 'express'
import cors from 'cors'
import { PORT } from './config.js'
import { adminAuth } from './middleware/auth.js'
import { initBroadcast } from './services/broadcast.js'
import { tryResumeFromDb } from './engine/gameLoop.js'

import gameRoutes from './routes/game.js'
import settingsRoutes from './routes/settings.js'
import usersRoutes from './routes/users.js'
import dataRoutes from './routes/data.js'

const app = express()

app.use(cors())
app.use(express.json())

// Health check (no auth)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Protected routes
app.use('/api/game', adminAuth, gameRoutes)
app.use('/api/settings', adminAuth, settingsRoutes)
app.use('/api/users', adminAuth, usersRoutes)
app.use('/api/data', adminAuth, dataRoutes)

async function main() {
  // Initialize broadcast channel
  await initBroadcast()

  // Try to resume from DB if server was restarted
  await tryResumeFromDb()

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
  })
}

main().catch(console.error)
