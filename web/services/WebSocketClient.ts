/**
 * WebSocket
 * V2:  PTY + Expert  ACP
 */

import { getWsUrl } from '@/config/api'
import { sendAESEvent } from '@/lib/aes'
import { createFrontendLogger } from '@/lib/logger'
import { CURRENT_WS_VERSION } from '@shared/ws/envelope'
import type { WsReceiveEventMap, WsSendEventMap } from './WebSocketEventMap'

export type { WsReceiveEventMap, WsSendEventMap } from './WebSocketEventMap'

const log = createFrontendLogger('WebSocket')

const isDebug = (): boolean => {
  if (typeof window === 'undefined') return false
  return (window as unknown as { __TEEMAI_WS_DEBUG__?: boolean }).__TEEMAI_WS_DEBUG__ === true
}

/* ── Handler Type ── */

type MessageHandler<T = unknown> = (data: T) => void

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHandler = MessageHandler<any>

export class WebSocketClient {
  private ws: WebSocket | null = null
  private url: string
  private reconnectAttempts = 0
  private maxReconnectAttempts = Number.MAX_SAFE_INTEGER
  private baseDelay = 1000
  private maxDelay = 30000
  private handlers: Map<string, AnyHandler[]> = new Map()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private connectPromise: Promise<void> | null = null
  private pendingQueue: string[] = []
  private readonly maxPendingQueueSize = 100
  private pendingResizeByAgent = new Map<string, string>()
  private hasWarnedQueueThisPeriod = false
  /** visibilitychange handler  disconnect  */
  private visibilityHandler: (() => void) | null = null
  private wasConnected = false

  constructor(url: string) {
    this.url = url
  }

  connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return Promise.resolve()
    if (this.connectPromise) return this.connectPromise

    this.connectPromise = new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url)

        this.ws.onopen = () => {
          const isReconnect = this.wasConnected
          log.info('Connected', { reconnect: isReconnect, url: this.url.replace(/token=[^&]+/, 'token=***') })
          this.reconnectAttempts = 0
          this.wasConnected = true
          this.connectPromise = null
          resolve()
          if (isReconnect) {
            this.emit('reconnected')
          }
          this.flushPendingQueue()
          if (!this.visibilityHandler) {
            this.visibilityHandler = () => {
              if (document.visibilityState === 'visible' && !this.isConnected()) {
                if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
                this.connect().catch(() => {})
              }
            }
            document.addEventListener('visibilitychange', this.visibilityHandler)
          }
        }

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)
            this.handleMessage(message)
          } catch (error) {
            log.error('Failed to parse message', { error: error instanceof Error ? error.message : String(error) })
          }
        }

        this.ws.onerror = (error) => {
          log.error('Error', { error: error instanceof Event ? 'ws error event' : String(error) })
          this.connectPromise = null
          reject(error)
        }

        this.ws.onclose = (evt) => {
          log.info('Disconnected', { code: evt.code, reason: evt.reason || undefined, wasClean: evt.wasClean })
          this.connectPromise = null
          this.emit('disconnected')
          this.attemptReconnect()
        }
      } catch (error) {
        this.connectPromise = null
        reject(error)
      }
    })

    return this.connectPromise
  }

  /** baseDelay * 2^(attempt-1) +  maxDelay */
  private getBackoffDelay(): number {
    const exponential = this.baseDelay * Math.pow(2, this.reconnectAttempts - 1)
    const capped = Math.min(exponential, this.maxDelay)
    const jitter = capped * (0.8 + Math.random() * 0.4)
    return Math.round(jitter)
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      log.error('Max reconnect attempts reached')
      this.emit('reconnect_failed')
      fetch('/api/telemetry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category: 'system', event: 'ws.reconnect_exhausted', properties: { source: 'web', url: this.url, attempts: this.maxReconnectAttempts } }) }).catch(() => {})
      return
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
    }

    this.reconnectAttempts++
    const delay = this.getBackoffDelay()
    log.info('Reconnecting', { delayMs: delay, attempt: this.reconnectAttempts })

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((error) => {
        log.error('Reconnect failed', { error: error instanceof Error ? error.message : String(error) })
      })
    }, delay)
  }

  private handleMessage(message: { type: string; payload: unknown }) {
    const { type, payload } = message

    if (type === 'protocol:hello') {
      const hello = payload as { version: number; serverVersion: string }
      if (hello.version !== CURRENT_WS_VERSION) {
        log.warn('Protocol version mismatch', { server: hello.version, client: CURRENT_WS_VERSION })
        this.emit('protocol:version-mismatch', {
          serverVersion: hello.version,
          clientVersion: CURRENT_WS_VERSION,
          message: `Server protocol version ${hello.version} and client ${CURRENT_WS_VERSION} mismatch. Please refresh the page`,
        })
      }
    }

    if (type === 'expert:structured-message' && isDebug()) {
      const p = payload as Record<string, unknown>
      log.debug('structured-message', {
        msgType: p.type,
        messages: Array.isArray(p.messages) ? p.messages.length : 'N/A',
        agentId: p.agentId,
        chatId: p.chatId,
      })
    }

    const handlers = [...(this.handlers.get(type) || [])]
    for (const handler of handlers) {
      try {
        handler(payload)
      } catch (error) {
        log.error('Handler error', { type, error: error instanceof Error ? error.message : String(error) })
      }
    }

    const allHandlers = [...(this.handlers.get('*') || [])]
    for (const handler of allHandlers) {
      try {
        handler(message)
      } catch (error) {
        log.error('All handler error', { error: error instanceof Error ? error.message : String(error) })
      }
    }
  }

  send<K extends keyof WsSendEventMap>(type: K, payload: WsSendEventMap[K]): void
  send(type: string, payload?: unknown): void
  send(type: string, payload?: unknown) {
    const msg = JSON.stringify({ type, payload })
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (type === 'expert:resize') {
        const agentId = (payload as { agentId?: string })?.agentId
        if (agentId) {
          const oldMsg = this.pendingResizeByAgent.get(agentId)
          if (oldMsg) {
            const idx = this.pendingQueue.indexOf(oldMsg)
            if (idx !== -1) this.pendingQueue.splice(idx, 1)
          }
          this.pendingResizeByAgent.set(agentId, msg)
        }
      }
      this.pendingQueue.push(msg)
      while (this.pendingQueue.length > this.maxPendingQueueSize) {
        this.pendingQueue.shift()
      }
      if (!this.hasWarnedQueueThisPeriod) {
        this.hasWarnedQueueThisPeriod = true
        log.warn('Message queued: WebSocket not open', {
          type,
          readyState: this.ws?.readyState ?? 'no_ws',
          queueSize: this.pendingQueue.length,
        })
      }
      return
    }
    this.ws.send(msg)
  }

  private flushPendingQueue(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.pendingQueue.length === 0) {
      this.hasWarnedQueueThisPeriod = false
      return
    }
    this.pendingResizeByAgent.clear()
    const queue = this.pendingQueue.splice(0)
    log.info('Flushing pending queue', { count: queue.length })
    for (const msg of queue) {
      this.ws.send(msg)
    }
    this.hasWarnedQueueThisPeriod = false
  }

  on<K extends keyof WsReceiveEventMap>(type: K, handler: MessageHandler<WsReceiveEventMap[K]>): void
  on(type: string, handler: AnyHandler): void
  on(type: string, handler: AnyHandler) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, [])
    }
    const list = this.handlers.get(type)!
    if (!list.includes(handler)) {
      list.push(handler)
    }
  }

  off<K extends keyof WsReceiveEventMap>(type: K, handler: MessageHandler<WsReceiveEventMap[K]>): void
  off(type: string, handler: AnyHandler): void
  off(type: string, handler: AnyHandler) {
    const handlers = this.handlers.get(type)
    if (handlers) {
      for (let i = handlers.length - 1; i >= 0; i--) {
        if (handlers[i] === handler) {
          handlers.splice(i, 1)
        }
      }
    }
  }

  private emit<K extends keyof WsReceiveEventMap>(type: K, payload?: WsReceiveEventMap[K]) {
    const handlers = [...(this.handlers.get(type) || [])]
    for (const handler of handlers) {
      try {
        handler(payload)
      } catch (error) {
        log.error('Emit handler error', { type, error: error instanceof Error ? error.message : String(error) })
      }
    }
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler)
      this.visibilityHandler = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }

  waitFor<K extends keyof WsReceiveEventMap>(type: K, timeout = 30000): Promise<WsReceiveEventMap[K]> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off(type, handler)
        reject(new Error(`Timeout waiting for ${type}`))
      }, timeout)

      const handler = ((payload: WsReceiveEventMap[K]) => {
        clearTimeout(timer)
        this.off(type, handler)
        resolve(payload)
      }) as AnyHandler

      this.on(type, handler)
    })
  }
}

let wsClient: WebSocketClient | null = null

export const getWebSocketClient = (): WebSocketClient => {
  if (!wsClient) {
    wsClient = new WebSocketClient(getWsUrl())
  }
  return wsClient
}

/** fire-and-forget HTTP POST  WS  */
export const sendTelemetry = (category: string, event: string, properties?: Record<string, unknown>): void => {
  fetch('/api/telemetry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category, event, properties: { source: 'web', ...properties } }),
  }).catch(() => {})
  sendAESEvent(category, event, { source: 'web', ...properties })
}
