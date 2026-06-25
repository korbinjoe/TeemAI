import { describe, expect, it } from 'vitest'
import { shouldQueueForTargetActivity } from '../../hooks/useChatActions'
import { deriveChatStatusFromSnapshot } from '../../hooks/useChatWebSocket'
import type { AgentActivity } from '../../types/chat'

const activity = (phase: AgentActivity['phase']): AgentActivity => ({
  phase,
  background: false,
  toolCount: 0,
  toolCompleted: 0,
  hasText: false,
  updatedAt: 1,
})

describe('shouldQueueForTargetActivity', () => {
  it('lets authoritative idle mission status override stale working activity', () => {
    expect(shouldQueueForTargetActivity({
      chatStatus: 'idle',
      targetAgentId: 'lead',
      expertActivities: { lead: activity('tool_running') },
      currentMergedActivity: activity('tool_running'),
    })).toBe(false)
  })

  it('lets stopped mission status send immediately for dead-session resume', () => {
    expect(shouldQueueForTargetActivity({
      chatStatus: 'stopped',
      targetAgentId: null,
      expertActivities: { lead: activity('thinking') },
      currentMergedActivity: activity('thinking'),
    })).toBe(false)
  })

  it('lets non-running member rollup override stale persisted running status', () => {
    const chatStatus = deriveChatStatusFromSnapshot({
      status: 'running',
      members: [{ status: 'waiting_input' }, { status: 'done' }],
    })

    expect(shouldQueueForTargetActivity({
      chatStatus,
      targetAgentId: 'lead',
      expertActivities: { lead: activity('tool_running') },
      currentMergedActivity: activity('tool_running'),
    })).toBe(false)
  })

  it('still queues for a genuinely running target agent', () => {
    expect(shouldQueueForTargetActivity({
      chatStatus: 'running',
      targetAgentId: 'lead',
      expertActivities: { lead: activity('responding') },
      currentMergedActivity: activity('responding'),
    })).toBe(true)
  })

  it('preserves activity-only behavior before chat status is known', () => {
    expect(shouldQueueForTargetActivity({
      chatStatus: null,
      targetAgentId: null,
      expertActivities: {},
      currentMergedActivity: activity('thinking'),
    })).toBe(true)
  })
})
