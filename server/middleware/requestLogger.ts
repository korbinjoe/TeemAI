/**
 * Request Logger  — API
 *
 *  /api  methodpathstatus
 * >1s warn
 */

import type { Request, Response, NextFunction } from 'express'
import { createLogger } from '../lib/logger'

const log = createLogger('HTTP')

const SLOW_THRESHOLD_MS = 1000

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.path.startsWith('/api')) {
    next()
    return
  }

  const start = Date.now()

  res.on('finish', () => {
    const duration = Date.now() - start
    const meta = {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
    }

    if (duration > SLOW_THRESHOLD_MS) {
      log.warn('Slow request', meta)
    } else {
      log.debug('Request completed', meta)
    }
  })

  next()
}
