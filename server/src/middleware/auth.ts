import type { Request, Response, NextFunction } from 'express'
import { ADMIN_API_KEY } from '../config.js'

export function adminAuth(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-admin-key'] as string
  if (!apiKey || apiKey !== ADMIN_API_KEY) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  next()
}
