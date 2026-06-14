import { describe, it, expect } from 'vitest'
import { buildCodexExitReplay } from '../ws/MissionAgentExitHandler'
import type { ParsedMessage } from '../terminal/ConversationParser'

const msg = (overrides: Partial<ParsedMessage>): ParsedMessage => ({
  id: 'm',
  role: 'agent',
  content: '',
  timestamp: Date.now(),
  type: 'text',
  ...overrides,
})

describe('buildCodexExitReplay', () => {
  it('replays latest turn agent messages when current turn has no agent text', () => {
    const current: ParsedMessage[] = [
      msg({ id: 's1', role: 'agent', type: 'stats', turnIndex: 1 }),
    ]
    const rollout: ParsedMessage[] = [
      msg({ id: 'u0', role: 'user', content: 'first', turnIndex: 0 }),
      msg({ id: 'a0', role: 'agent', content: 'done first', type: 'text', turnIndex: 0 }),
      msg({ id: 'u1', role: 'user', content: 'second', turnIndex: 1 }),
      msg({ id: 'a1', role: 'agent', content: 'done second', type: 'text', turnIndex: 1 }),
      msg({ id: 'st1', role: 'agent', content: '', type: 'stats', turnIndex: 1 }),
    ]

    const out = buildCodexExitReplay(current, rollout)
    expect(out.some((m) => m.type === 'text' && m.content === 'done second')).toBe(true)
    expect(out.every((m) => m.turnIndex === 1 && m.role === 'agent')).toBe(true)
  })

  it('does not replay when current turn already has agent text', () => {
    const current: ParsedMessage[] = [
      msg({ id: 't1', role: 'agent', type: 'text', content: 'already here', turnIndex: 1 }),
    ]
    const rollout: ParsedMessage[] = [
      msg({ id: 'u1', role: 'user', content: 'second', turnIndex: 1 }),
      msg({ id: 'a1', role: 'agent', content: 'done second', type: 'text', turnIndex: 1 }),
    ]

    const out = buildCodexExitReplay(current, rollout)
    expect(out).toHaveLength(0)
  })
})
