/**
 * expertActivityReconcile — un-stick the message-area `expertActivities` map
 * from the authoritative, workspace-broadcast `chat:activity` payload.
 *
 * The per-agent `expert:activity` / `expert:exit` stream that normally drives
 * `expertActivities` is `isActive`-gated and chatId-filtered, so a missed
 * turn-end event freezes an agent's progress card at a working phase (spinner)
 * while the right Agents panel — fed by this same `chat:activity` via
 * `reconcileMembersFromActivity` — already shows the terminal phase.
 *
 * We only ever advance a stuck *working* phase to the authoritative *terminal*
 * phase; never the reverse, so a live running update is never regressed.
 */

import type { AgentActivity, AgentPhase, ChatActivityPayload } from '@/types/chat'
import { WORKING_PHASES } from '@/types/chat'

const TERMINAL_PHASES: ReadonlySet<AgentPhase> = new Set<AgentPhase>([
  'waiting_input',
  'waiting_confirmation',
  'completed',
  'error',
])

export const reconcileExpertActivitiesFromChat = (
  prev: Record<string, AgentActivity>,
  payload: ChatActivityPayload,
): Record<string, AgentActivity> => {
  const snapshots = payload.agentActivities
  if (!snapshots || snapshots.length === 0) return prev

  let next: Record<string, AgentActivity> | null = null
  for (const snap of snapshots) {
    const existing = prev[snap.agentId]
    if (!existing) continue
    const authoritative = snap.phase as AgentPhase
    if (!TERMINAL_PHASES.has(authoritative)) continue
    if (!WORKING_PHASES.has(existing.phase)) continue
    if (!next) next = { ...prev }
    next[snap.agentId] = {
      ...existing,
      phase: authoritative,
      currentTool: undefined,
      updatedAt: Date.now(),
    }
  }
  return next ?? prev
}
