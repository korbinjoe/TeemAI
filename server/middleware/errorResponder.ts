import type { Request, Response, NextFunction } from 'express'
import { createLogger } from '../lib/logger'

const log = createLogger('ErrorResponder')

export const errorResponder = (err: Error, _req: Request, res: Response, _next: NextFunction) => {
  log.error('Unhandled route error', { error: err.message, stack: err.stack })
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    },
  })
}
