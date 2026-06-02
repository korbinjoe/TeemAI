/**
 * Auth middleware — localhost detection and remote access auth
 */

import type { Request, Response, NextFunction } from 'express'
import type { IncomingMessage } from 'http'

export const isLocalhost = (ip: string): boolean =>
  ip === '127.0.0.1' ||
  ip === '::1' ||
  ip === '::ffff:127.0.0.1' ||
  ip === 'localhost'

let runtimeToken: string | null = null

export const setRuntimeAuthToken = (token: string | null): void => {
  runtimeToken = token
}

export const getAuthToken = (): string | undefined =>
  runtimeToken ?? process.env.OPENTEAM_AUTH_TOKEN ?? undefined

/**
 * Express localhost  Bearer Token
 */
export const createAuthMiddleware = () =>
  (req: Request, res: Response, next: NextFunction): void => {
    if (req.path === '/api/health') {
      next()
      return
    }

    if (!req.path.startsWith('/api')) {
      next()
      return
    }

    if (req.path.startsWith('/api/auth/openteam/')) {
      next()
      return
    }

    const ip = req.ip || req.socket.remoteAddress || ''
    if (isLocalhost(ip)) {
      next()
      return
    }

    const token = getAuthToken()
    if (!token) {
      res.status(403).json({
        error: 'Remote access denied. Set OPENTEAM_AUTH_TOKEN environment variable to enable remote access.',
      })
      return
    }

    const authorization = req.headers.authorization
    const bearerToken = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : undefined

    if (bearerToken !== token) {
      res.status(401).json({ error: 'Invalid or missing authentication token' })
      return
    }

    next()
  }

/**
 *  WebSocket  wss.on('connection')
 *  true false
 */
export const verifyWsConnection = (req: IncomingMessage): boolean => {
  const ip = req.socket.remoteAddress || ''
  if (isLocalhost(ip)) return true

  const token = getAuthToken()
  if (!token) return false

  try {
    const url = new URL(req.url || '', `http://${req.headers.host}`)
    const queryToken = url.searchParams.get('token')
    return queryToken === token
  } catch {
    return false
  }
}
