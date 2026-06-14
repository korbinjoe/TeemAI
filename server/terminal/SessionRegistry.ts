/**
 * SessionRegistry - Agent
 *
 *  Agent  WebSocket
 * Agent  SessionRegistry WS  attach/detach
 *
 * - register: Agent  registry
 * - detach: WS
 * - attach: WS
 * - remove:  registry
 */

import type { WebSocket } from 'ws'
import { outboundFrames } from '../ws/wireCompat'
import type { StreamJsonManager } from './StreamJsonManager'
import type { ActivityState } from './ActivityDeriver'
import { HooksConfigManager } from '../runtime/HooksConfigManager'
import type { ChatStore } from '../stores/ChatStore'
import { ActivityAggregator } from './ActivityAggregator'
import { createLogger } from '../lib/logger'
import { silentlyIgnore } from '../lib/silentlyIgnore'

const log = createLogger('SessionRegistry')

export interface ManagedSession {
  sessionId: string
  streamManager: StreamJsonManager
  acpClient?: import('../acp/ACPClient').ACPClient
  chatId: string
  agentId?: string
  agentName: string
  agentIcon?: string
  cliSessionId?: string
  cwd: string
  connectedWs: WebSocket | null
  connectionId: string | null
  connectionType?: 'browser' | 'virtual'
  activitySnapshot: ActivityState | null
  createdAt: number
  disconnectedAt: number | null
  /**  kill exit handler  taskStatus */
  killReason?: 'timeout' | 'user_stop' | 'model_switch'
}

// Re-export activity types for backwards compatibility
export type { ChatStatusChangedCallback, ChatActivityChangedCallback, ChatActivityPayload, AgentActivitySnapshot } from './ActivityAggregator'

export class SessionRegistry {
  private sessions = new Map<string, ManagedSession>()
  private sessionRemovedCallbacks: ((session: ManagedSession) => void)[] = []
  /** chatId → Set<connectionId>  O(1)  */
  private chatConnectionIndex = new Map<string, Set<string>>()
  readonly activity: ActivityAggregator

  constructor(
    private hooksConfigManager: HooksConfigManager,
    private chatStore?: ChatStore,
  ) {
    this.activity = new ActivityAggregator(
      this.sessions,
      this.chatStore,
      (chatId) => this.findAllByChat(chatId),
    )
  }

  /**
   *  chat status  WS
   *  Disposable `.dispose()`
   */
  onChatStatusChanged(callback: import('./ActivityAggregator').ChatStatusChangedCallback): import('./ActivityAggregator').Disposable {
    return this.activity.onChatStatusChanged(callback)
  }

  /**
   *  chat activity  Dashboard
   *  Disposable `.dispose()`
   */
  onActivityChanged(callback: import('./ActivityAggregator').ChatActivityChangedCallback): import('./ActivityAggregator').Disposable {
    return this.activity.onActivityChanged(callback)
  }

  onSessionRemoved(callback: (session: ManagedSession) => void): void {
    this.sessionRemovedCallbacks.push(callback)
  }

  private indexConnection(chatId: string, connectionId: string | null): void {
    if (!connectionId) return
    let set = this.chatConnectionIndex.get(chatId)
    if (!set) { set = new Set(); this.chatConnectionIndex.set(chatId, set) }
    set.add(connectionId)
  }

  private unindexConnection(chatId: string, connectionId: string | null): void {
    if (!connectionId) return
    const set = this.chatConnectionIndex.get(chatId)
    if (!set) return
    set.delete(connectionId)
    if (set.size === 0) this.chatConnectionIndex.delete(chatId)
  }

  getConnectionsForChat(chatId: string): Set<string> {
    return this.chatConnectionIndex.get(chatId) ?? new Set()
  }

  register(session: ManagedSession): void {
    const { sessionId, streamManager } = session

    if (session.chatId && session.agentId) {
      for (const [sid, existing] of this.sessions.entries()) {
        if (sid === sessionId) continue
        if (existing.chatId !== session.chatId) continue
        if (existing.agentId !== session.agentId) continue
        log.warn('Replacing duplicate active session', {
          chatId: session.chatId,
          agentId: session.agentId,
          oldSessionId: sid,
          newSessionId: sessionId,
        })
        try { existing.streamManager.kill() } catch {}
        this.unindexConnection(existing.chatId, existing.connectionId)
        this.sessionRemovedCallbacks.forEach((cb) => cb(existing))
        this.sessions.delete(sid)
      }
    }

    this.sessions.set(sessionId, session)
    this.indexConnection(session.chatId, session.connectionId)

    if (session.chatId && this.chatStore) {
      this.chatStore.update(session.chatId, { status: 'running', taskStatus: 'running' })
        .then(() => {
          this.activity.notifyChatStatus(session.chatId, 'running')
        })
        .catch((err) => {
          log.warn('Failed to set chat running', { chatId: session.chatId, error: String(err) })
        })
    }

    streamManager.on('exit', ({ exitCode }: { exitCode: number; signal?: number }) => {
      log.info('Agent exited', { sessionId, exitCode })
      queueMicrotask(() => {
        const current = this.sessions.get(sessionId)
        if (!current) return

        if (current.chatId) {
          if (this.activity.hasActivityListeners()) {
            const finalPayload = this.activity.buildFinalPayload(current.chatId, current)
            this.activity.notifyActivity(finalPayload)
          }

          if (this.chatStore) {
            this.unindexConnection(current.chatId, current.connectionId)
            this.sessions.delete(sessionId)
            const hasOther = this.findByChat(current.chatId)
            if (!hasOther) {
              if (current.killReason === 'model_switch') {
                this.sessions.delete(current.sessionId)
                return
              }
              const taskStatus = current.killReason === 'timeout' ? 'timeout' as const
                : current.killReason === 'user_stop' ? 'interrupted' as const
                : exitCode === 0 ? 'success' as const
                : 'error' as const
              this.chatStore.update(current.chatId, {
                status: 'stopped',
                taskStatus,
                taskSummary: {
                  durationSec: Math.round((Date.now() - current.createdAt) / 1000),
                },
              })
                .then(() => {
                  this.activity.notifyChatStatus(current.chatId, 'stopped')
                })
                .catch((err) => {
                  log.warn('Failed to update chat status', { chatId: current.chatId, error: String(err) })
                })
            }
          } else {
            this.unindexConnection(current.chatId, current.connectionId)
            this.sessions.delete(sessionId)
          }
        } else {
          this.sessions.delete(sessionId)
        }

        const hookKey = current.agentId
          ? `sub-${current.agentId}`
          : sessionId
        silentlyIgnore(() => this.hooksConfigManager.cleanup(hookKey), 'hooks cleanup on session exit')
      })
    })

    log.info('Registered', { sessionId, chatId: session.chatId, agentName: session.agentName })
  }

  detach(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return

    this.unindexConnection(session.chatId, session.connectionId)
    session.connectedWs = null
    session.connectionId = null
    session.disconnectedAt = Date.now()

    log.info('Detached', { sessionId })
  }

  attach(sessionId: string, ws: WebSocket, connectionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return

    this.unindexConnection(session.chatId, session.connectionId)
    session.connectedWs = ws
    session.connectionId = connectionId
    session.disconnectedAt = null
    this.indexConnection(session.chatId, connectionId)

    log.info('Attached', { sessionId, connectionId })
  }

  findByChat(chatId: string, agentId?: string): ManagedSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.chatId !== chatId) continue
      if (agentId && session.agentId !== agentId) continue
      return session
    }
    return undefined
  }

  findAllByChat(chatId: string): ManagedSession[] {
    const results: ManagedSession[] = []
    for (const session of this.sessions.values()) {
      if (session.chatId === chatId) {
        results.push(session)
      }
    }
    return results
  }

  findByConnection(connectionId: string): ManagedSession[] {
    const results: ManagedSession[] = []
    for (const session of this.sessions.values()) {
      if (session.connectionId === connectionId) {
        results.push(session)
      }
    }
    return results
  }

  get(sessionId: string): ManagedSession | undefined {
    return this.sessions.get(sessionId)
  }

  remove(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return

    this.unindexConnection(session.chatId, session.connectionId)
    this.sessionRemovedCallbacks.forEach((cb) => cb(session))
    this.sessions.delete(sessionId)
    log.info('Removed', { sessionId })
  }

  /**
   *  activity  ActivityAggregator
   */
  updateActivity(sessionId: string, activity: ActivityState): void {
    this.activity.updateActivity(sessionId, activity)
  }

  updateCliSessionId(sessionId: string, cliSessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.cliSessionId = cliSessionId
    }
  }

  /**
   *  activity  ActivityAggregator
   */
  getActiveActivities(): Record<string, import('./ActivityAggregator').ChatActivityPayload> {
    return this.activity.getActiveActivities()
  }

  getAll(): ManagedSession[] {
    return Array.from(this.sessions.values())
  }

  get size(): number {
    return this.sessions.size
  }

  killAll(): void {
    const sessions = Array.from(this.sessions.values())
    if (sessions.length === 0) return
    log.info('Killing all sessions on shutdown', { count: sessions.length })
    for (const session of sessions) {
      try {
        if (session.streamManager.isAlive()) {
          session.streamManager.kill()
        }
      } catch (err) {
        log.warn('Failed to kill session on shutdown', {
          sessionId: session.sessionId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }

  sendToSession(sessionId: string, message: Record<string, unknown>): boolean {
    const session = this.sessions.get(sessionId)
    if (!session?.connectedWs || session.connectedWs.readyState !== 1 /* OPEN */) {
      const logFn = message.type === 'expert:data' ? log.debug : log.warn
      logFn('Message dropped (no WS)', { sessionId, type: message.type, hasSession: !!session, hasWs: !!session?.connectedWs, wsState: session?.connectedWs?.readyState, agentId: session?.agentId })
      return false
    }
    for (const frame of outboundFrames(message)) session.connectedWs.send(frame)
    return true
  }
}
