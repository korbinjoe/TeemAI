/**
 * IdleReaper -  Agent
 *
 *  session 30  Agent
 *  kill
 *
 * activitySnapshot.phase  waiting_input  waiting_confirmation
 *  activitySnapshot.updatedAt
 */

import type { SessionRegistry } from './SessionRegistry'
import { createLogger } from '../lib/logger'

const log = createLogger('IdleReaper')

const IDLE_PHASES = new Set(['waiting_input', 'waiting_confirmation'])

const DEFAULT_IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000

const SCAN_INTERVAL_MS = 60 * 1000

export class IdleReaper {
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private registry: SessionRegistry,
    private idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
  ) {}

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => this.sweep(), SCAN_INTERVAL_MS)
    log.info('Started', { timeoutSec: this.idleTimeoutMs / 1000, intervalSec: SCAN_INTERVAL_MS / 1000 })
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private sweep(): void {
    const now = Date.now()
    const sessions = this.registry.getAll()

    for (const session of sessions) {
      if (!session.streamManager.isAlive()) {
        log.warn('Removing zombie session', { sessionId: session.sessionId, chatId: session.chatId, agentName: session.agentName })
        this.registry.remove(session.sessionId)
        continue
      }

      const activity = session.activitySnapshot
      if (!activity) continue
      if (!IDLE_PHASES.has(activity.phase)) continue

      const idleDuration = now - activity.updatedAt
      if (idleDuration < this.idleTimeoutMs) continue

      const idleMinutes = Math.round(idleDuration / 60_000)
      log.info('Killing idle agent', { sessionId: session.sessionId, chatId: session.chatId, phase: activity.phase, idleMinutes })

      session.killReason = 'timeout'

      try {
        session.streamManager.kill()
      } catch (err) {
        log.warn('Failed to kill agent', { sessionId: session.sessionId, error: err instanceof Error ? err.message : String(err) })
      }
    }
  }
}
