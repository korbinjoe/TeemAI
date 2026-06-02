import { WebSocket, type WebSocketServer } from 'ws'
import type { IncomingMessage } from 'http'
import { randomUUID } from 'crypto'
import { createLogger } from '../lib/logger'
import { trackEvent } from '../lib/eventTracker'
import { verifyWsConnection } from '../middleware/auth'
import type { WSRouter } from '../ws'
import type { ExpertHandler } from '../ws'
import type { SessionRegistry } from '../terminal/SessionRegistry'
import type { NotificationStore } from '../stores'
import type { CliAutoInstallResult } from '../services/CliAutoInstaller'
import type { PreflightResult } from '../services/PreflightChecker'
import { CURRENT_WS_VERSION } from '../../shared/ws/envelope'
import { markWsMessageReceived } from '../lib/wsHealthBeat'

const log = createLogger('WsSetup')

const WS_PING_INTERVAL = 30_000

interface WsDeps {
  wss: WebSocketServer
  wsRouter: WSRouter
  expertHandler: ExpertHandler
  sessionRegistry: SessionRegistry
  notificationStore: NotificationStore
  serverVersion: string
  getEnvCheckResult: () => CliAutoInstallResult | null
  getPreflightResult: () => PreflightResult | null
}

export const setupWebSocket = (d: WsDeps) => {
  const aliveMap = new WeakMap<WebSocket, boolean>()

  const heartbeatTimer = setInterval(() => {
    d.wss.clients.forEach((ws) => {
      if (aliveMap.get(ws) === false) {
        log.warn('Terminating unresponsive WebSocket connection')
        ws.terminate()
        return
      }
      aliveMap.set(ws, false)
      ws.ping()
    })
  }, WS_PING_INTERVAL)

  d.wss.on('close', () => clearInterval(heartbeatTimer))

  d.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    if (!verifyWsConnection(req)) {
      log.warn('Rejected unauthorized WebSocket connection', { from: req.socket.remoteAddress })
      ws.close(4001, 'Unauthorized')
      return
    }

    aliveMap.set(ws, true)
    ws.on('pong', () => { aliveMap.set(ws, true) })

    const connectionId = randomUUID()
    log.info('WebSocket client connected', { connectionId })
    trackEvent('system', 'ws.connected', { connectionId })

    ws.on('error', (err) => {
      log.warn('WebSocket error', { connectionId, error: err.message })
    })

    d.expertHandler.registerConnection(connectionId, ws)

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString())
        if (!message || typeof message.type !== 'string') {
          ws.send(JSON.stringify({ type: 'error', payload: { message: 'Invalid message: missing type field' } }))
          return
        }
        log.info('WebSocket received', { type: message.type, connectionId })
        markWsMessageReceived()
        d.wsRouter.handle(ws, message, connectionId)
      } catch (error) {
        log.error('WebSocket message handling error', { error: error instanceof Error ? error.message : String(error) })
        ws.send(JSON.stringify({ type: 'error', payload: { message: error instanceof Error ? error.message : 'Unknown error' } }))
      }
    })

    ws.on('close', () => {
      log.info('WebSocket client disconnected', { connectionId })
      trackEvent('system', 'ws.disconnected', { connectionId })
      d.wsRouter.handleDisconnect(ws, connectionId)
      d.expertHandler.detachConnection(connectionId)
      d.expertHandler.unregisterConnection(connectionId)
    })

    ws.send(JSON.stringify({ type: 'protocol:hello', payload: { version: CURRENT_WS_VERSION, serverVersion: d.serverVersion } }))
    ws.send(JSON.stringify({ type: 'notification:init', payload: { unreadCount: d.notificationStore.unreadCount() } }))

    const envCheckResult = d.getEnvCheckResult()
    if (envCheckResult && !envCheckResult.npmAvailable) {
      ws.send(JSON.stringify({ type: 'system:env-check', payload: envCheckResult }))
    }

    const preflightResult = d.getPreflightResult()
    if (preflightResult) {
      ws.send(JSON.stringify({ type: 'system:preflight', payload: preflightResult }))
    }

    const activeActivities = d.sessionRegistry.getActiveActivities()
    for (const payload of Object.values(activeActivities)) {
      if (!payload.latestMessage) {
        const latest = d.expertHandler.getLatestMessage(payload.chatId)
        if (latest) payload.latestMessage = latest
      }
      ws.send(JSON.stringify({ type: 'chat:activity', payload }))
    }
  })

  return { heartbeatTimer }
}
