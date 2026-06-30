import { describe, expect, it } from 'vitest'
import { reconcileAgentsFromActivity } from '@/lib/agentStatus'
import type { ChatActivityPayload } from '@/types/chat'
import type { MissionAgent } from '@/components/workspace/types'

const payload = (
  phase: string,
  agentActivities: Array<{ agentId: string; phase: string }> = [],
): ChatActivityPayload => ({
  chatId: 'mission-1',
  phase,
  toolCount: 0,
  toolCompleted: 0,
  agentActivities: agentActivities.map((a) => ({
    agentId: a.agentId,
    agentName: a.agentId,
    phase: a.phase,
    toolCount: 0,
    toolCompleted: 0,
  })),
})

describe('reconcileAgentsFromActivity', () => {
  it('keeps the original members array when statuses are unchanged', () => {
    const members: MissionAgent[] = [
      { agentId: 'lead', role: 'lead', status: 'running', lastMessageAt: '' },
    ]

    const next = reconcileAgentsFromActivity(members, payload('running', [
      { agentId: 'lead', phase: 'tool_running' },
    ]))

    expect(next).toBe(members)
  })

  it('returns a new members array when a status changes', () => {
    const members: MissionAgent[] = [
      { agentId: 'lead', role: 'lead', status: 'idle', lastMessageAt: '' },
    ]

    const next = reconcileAgentsFromActivity(members, payload('running', [
      { agentId: 'lead', phase: 'tool_running' },
    ]))

    expect(next).not.toBe(members)
    expect(next?.[0].status).toBe('running')
  })
})
