/**
 * memberStatus — shared mapping from a CLI activity phase string to the
 * sidebar's `MissionAgentStatus` vocabulary.
 *
 * Mirrors `server/stores/MissionAgentAggregator.ts` `PHASE_TO_STATUS` so the live
 * WS payload (`mission.activity`) updates `chat.members[]` with the same status
 * the server would compute on a fresh GET. Without this, members[] stays
 * frozen at its initial-fetch value and the sidebar status dot misreports
 * whenever an agent transitions between turns.
 *
 * `waiting_input` → `waiting_input`: agent finished its turn, awaiting user's
 * next message. `waiting_confirmation` → `waiting`: true block needing user
 * action (AskUserQuestion / ExitPlanMode).
 */

import type { MissionAgent, MissionAgentStatus } from '@/components/workspace/types'
import type { ChatActivityPayload } from '@/types/chat'

export const PHASE_TO_AGENT_STATUS: Record<string, MissionAgentStatus> = {
  thinking: 'running',
  responding: 'running',
  tool_running: 'running',
  initializing: 'running',
  waiting_input: 'waiting_input',
  waiting_confirmation: 'waiting',
  error: 'error',
  completed: 'done',
}

export const phaseToAgentStatus = (phase: string | undefined): MissionAgentStatus | undefined => {
  if (!phase) return undefined
  return PHASE_TO_AGENT_STATUS[phase]
}

export const ACTIVE_PHASES = new Set<string>(
  Object.entries(PHASE_TO_AGENT_STATUS)
    .filter(([, s]) => s === 'running')
    .map(([p]) => p),
)

/**
 * Reconcile `chat.members[]` from a live `mission.activity` WS payload.
 *
 * Without this, members[] stays frozen at its initial GET value (typically
 * 'idle') and the sidebar's `chatStatusDot` — which prefers the members[]
 * rollup over `chat.status` — keeps reporting gray while an agent is mid-turn.
 *
 * Strategy:
 *   - Members present in `payload.agentActivities`: status mapped from phase.
 *   - Members absent on a terminal payload (`completed` / `error`): any
 *     leftover running/waiting is neutralized to done/error so the ripple
 *     stops. Idle/done stay as-is.
 *   - Members absent on a non-terminal payload: status untouched (the next
 *     GET will resync from server-side MissionAgentAggregator).
 */
export const reconcileAgentsFromActivity = (
  members: MissionAgent[] | undefined,
  payload: ChatActivityPayload,
): MissionAgent[] | undefined => {
  if (!members || members.length === 0) return members
  const phaseByAgent = new Map<string, string>()
  for (const a of payload.agentActivities ?? []) phaseByAgent.set(a.agentId, a.phase)

  const isTerminal = payload.phase === 'completed' || payload.phase === 'error'
  const terminalStatus: MissionAgentStatus = payload.phase === 'error' ? 'error' : 'done'
  let changed = false

  const updated = members.map((m) => {
    const live = phaseByAgent.get(m.agentId)
    if (live) {
      const next = phaseToAgentStatus(live)
      if (next && next !== m.status) {
        changed = true
        return { ...m, status: next }
      }
      return m
    }
    if (isTerminal && (m.status === 'running' || m.status === 'waiting' || m.status === 'waiting_input')) {
      changed = true
      return { ...m, status: terminalStatus }
    }
    return m
  })

  const knownIds = new Set(members.map((m) => m.agentId))
  let appended = false
  phaseByAgent.forEach((phase, agentId) => {
    if (knownIds.has(agentId)) return
    const status = phaseToAgentStatus(phase)
    if (!status) return
    appended = true
    updated.push({ agentId, role: 'worker', status, lastMessageAt: '' })
  })

  return appended || changed ? updated : members
}
