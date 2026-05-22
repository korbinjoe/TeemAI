import { Router } from 'express'
import { createLogger } from '../../lib/logger'

const frontendLog = createLogger('Frontend')

interface LogEntry {
  level: 'warn' | 'error'
  module: string
  message: string
  meta?: Record<string, unknown>
  timestamp: string
}

export const createLogRoutes = (): Router => {
  const router = Router()

  router.post('/api/log', (req, res) => {
    const { logs } = req.body as { logs?: LogEntry[] }
    if (!Array.isArray(logs)) {
      return res.status(400).json({ error: 'logs must be an array' })
    }

    for (const entry of logs) {
      const { level, module, message, meta, timestamp } = entry
      const logMeta = { module, timestamp, ...meta }

      if (level === 'error') {
        frontendLog.error(message, logMeta)
      } else {
        frontendLog.warn(message, logMeta)
      }
    }

    res.status(204).end()
  })

  return router
}
