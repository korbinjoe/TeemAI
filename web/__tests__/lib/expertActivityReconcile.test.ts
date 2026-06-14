import { describe, it, expect } from 'vitest'
import { reconcileExpertActivitiesFromChat } from '@/lib/expertActivityReconcile'
import type { AgentActivity, ChatActivityPayload } from '@/types/chat'

const act = (phase: AgentActivity['phase'], extra: Partial<AgentActivity> = {}): AgentActivity => ({
  phase,
  background: false,
  toolCount: 0,
  toolCompleted: 0,
  hasText: false,
  updatedAt: 1,
  ...extra,
})

const payload = (
  agentActivities: Array<{ agentId: string; phase: string }>,
  phase = 'waiting_input',
): ChatActivityPayload => ({
  chatId: 'c1',
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

describe('reconcileExpertActivitiesFromChat', () => {
  it('advances a stuck working phase to the authoritative terminal phase', () => {
    const prev = { fullstack: act('tool_running', { currentTool: 'Bash', toolCount: 6, toolCompleted: 5 }) }
    const next = reconcileExpertActivitiesFromChat(prev, payload([{ agentId: 'fullstack', phase: 'waiting_input' }]))
    expect(next).not.toBe(prev)
    expect(next.fullstack.phase).toBe('waiting_input')
    expect(next.fullstack.currentTool).toBeUndefined()
    // Preserve the tool-progress fields so the card keeps its summary.
    expect(next.fullstack.toolCompleted).toBe(5)
  })

  it('handles completed / waiting_confirmation / error terminal phases', () => {
    for (const terminal of ['completed', 'waiting_confirmation', 'error'] as const) {
      const prev = { a: act('thinking') }
      const next = reconcileExpertActivitiesFromChat(prev, payload([{ agentId: 'a', phase: terminal }]))
      expect(next.a.phase).toBe(terminal)
    }
  })

  it('never regresses a terminal phase back to running', () => {
    const prev = { a: act('waiting_input') }
    const next = reconcileExpertActivitiesFromChat(prev, payload([{ agentId: 'a', phase: 'tool_running' }], 'running'))
    expect(next).toBe(prev)
  })

  it('does not touch an agent that is still genuinely running', () => {
    const prev = { a: act('tool_running') }
    const next = reconcileExpertActivitiesFromChat(prev, payload([{ agentId: 'a', phase: 'tool_running' }], 'running'))
    expect(next).toBe(prev)
  })

  it('ignores agents with no existing message-area activity', () => {
    const prev = { a: act('tool_running') }
    const next = reconcileExpertActivitiesFromChat(prev, payload([{ agentId: 'ghost', phase: 'waiting_input' }]))
    expect(next).toBe(prev)
  })

  it('returns prev unchanged when payload carries no agentActivities', () => {
    const prev = { a: act('tool_running') }
    const next = reconcileExpertActivitiesFromChat(prev, { chatId: 'c1', phase: 'waiting_input', toolCount: 0, toolCompleted: 0 })
    expect(next).toBe(prev)
  })

  it('reconciles only the stuck agents, leaving live ones untouched', () => {
    const prev = {
      stuck: act('tool_running'),
      live: act('responding'),
    }
    const next = reconcileExpertActivitiesFromChat(prev, payload([
      { agentId: 'stuck', phase: 'waiting_input' },
      { agentId: 'live', phase: 'responding' },
    ], 'running'))
    expect(next.stuck.phase).toBe('waiting_input')
    expect(next.live).toBe(prev.live)
  })
})
