/**
 * Drain the pending-task queue for a given key and dispatch each entry
 * to the agent via `acpClient.prompt`. Used at the Claude readiness boundary
 * (`cli-session-id`). Codex is one-shot, so startup-window messages are folded
 * into its initial stdin prompt in MissionAgentLifecycle instead.
 *
 * Drain failures surface as `expert:error { error: 'pending_task_failed' }`
 * routed via the session registry so whoever is currently watching the
 * session sees the failure. Loss reasons handled by the store itself
 * (TTL, cleanup, stop) go through `MissionAgentSessionStore.onPendingTaskLoss`
 * and are surfaced by MissionAgentHandler — not here.
 */

import type { ACPClient } from '../acp/ACPClient'
import type { SessionRegistry } from '../terminal/SessionRegistry'
import type { MissionAgentSessionStore } from './MissionAgentSessionStore'
import { expandSlashCommand } from '../runtime/SlashCommandResolver'
import { createLogger } from '../lib/logger'

const log = createLogger('ExpertPendingTaskFlush')

export interface FlushDeps {
  store: MissionAgentSessionStore
  acpClient: ACPClient
  sessionRegistry: SessionRegistry
  sessionId: string
  key: string
  agentId: string
  chatId: string
}

export const flushPendingTasks = async (deps: FlushDeps): Promise<void> => {
  const { store, acpClient, sessionRegistry, sessionId, key, agentId, chatId } = deps
  const drained = store.drainPendingTasks(key)
  if (drained.length === 0) return

  log.info('Flushing pending tasks', { agentId, chatId, count: drained.length })

  const entry = store.get(key)
  const shouldExpand = entry?.provider !== 'codex'
  const cwd = entry?.cwd ?? ''

  for (const queued of drained) {
    const images = queued.images?.map(img => ({ data: img.data, mimeType: img.mediaType }))
    try {
      const text = shouldExpand
        ? await expandSlashCommand(queued.task, cwd)
        : queued.task
      await acpClient.prompt(sessionId, text, images)
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      log.warn('Pending-task prompt failed', { agentId, chatId, error: errorMsg })
      sessionRegistry.sendToSession(sessionId, {
        type: 'agent:error',
        payload: {
          agentId,
          chatId,
          error: 'pending_task_failed',
          task: queued.task,
          message: `Failed to deliver queued message: ${errorMsg}`,
        },
      })
    }
  }
}
