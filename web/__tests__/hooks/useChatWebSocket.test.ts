// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { canSkipWarmReplay } from '../../hooks/useChatWebSocket'

const handlers = new Map<string, Array<(data: unknown) => void>>()
const mockWsClient = {
  on: (type: string, handler: (data: unknown) => void) => {
    if (!handlers.has(type)) handlers.set(type, [])
    handlers.get(type)!.push(handler)
  },
  off: (type: string, handler: (data: unknown) => void) => {
    const list = handlers.get(type)
    if (list) {
      const idx = list.indexOf(handler)
      if (idx >= 0) list.splice(idx, 1)
    }
  },
  send: vi.fn(),
  connect: vi.fn().mockResolvedValue(undefined),
  isConnected: vi.fn().mockReturnValue(true),
  _emit: (type: string, data: unknown) => {
    handlers.get(type)?.forEach(h => h(data))
  },
}

describe('useChatWebSocket (WS event routing)', () => {
  it('handler can be triggered after registration', () => {
    const handler = vi.fn()
    mockWsClient.on('mission.status-changed', handler)
    mockWsClient._emit('mission.status-changed', { chatId: '1', status: 'running' })
    expect(handler).toHaveBeenCalledWith({ chatId: '1', status: 'running' })
  })

  it('multiple handlers for same event all get called', () => {
    const h1 = vi.fn()
    const h2 = vi.fn()
    mockWsClient.on('agent:exit', h1)
    mockWsClient.on('agent:exit', h2)
    mockWsClient._emit('agent:exit', { agentId: 'a1', chatId: 'c1' })
    expect(h1).toHaveBeenCalled()
    expect(h2).toHaveBeenCalled()
  })

  it('no longer triggers after off', () => {
    const handler = vi.fn()
    mockWsClient.on('agent:stopped', handler)
    mockWsClient.off('agent:stopped', handler)
    mockWsClient._emit('agent:stopped', { agentId: 'a1', chatId: 'c1' })
    expect(handler).not.toHaveBeenCalled()
  })
})

describe('canSkipWarmReplay', () => {
  it('does not skip replay for a warm instance with an empty message cache', () => {
    expect(canSkipWarmReplay({
      resumeWarm: true,
      cwdReady: true,
      forceFullResume: false,
      hasDispatchedResume: true,
      agentMessages: {},
    })).toBe(false)
  })

  it('only skips replay when the warm cache already has local messages', () => {
    expect(canSkipWarmReplay({
      resumeWarm: true,
      cwdReady: true,
      forceFullResume: false,
      hasDispatchedResume: true,
      agentMessages: {
        lead: [{ id: 'm1', role: 'agent', content: 'cached', timestamp: 1, type: 'text' }],
      },
    })).toBe(true)
  })

  it('does not skip replay when one expected agent slot is still empty', () => {
    expect(canSkipWarmReplay({
      resumeWarm: true,
      cwdReady: true,
      forceFullResume: false,
      hasDispatchedResume: true,
      expectedAgentIds: ['lead', 'worker'],
      agentMessages: {
        lead: [{ id: 'm1', role: 'agent', content: 'cached', timestamp: 1, type: 'text' }],
      },
    })).toBe(false)
  })

  it('skips replay when every expected agent slot has cached messages', () => {
    expect(canSkipWarmReplay({
      resumeWarm: true,
      cwdReady: true,
      forceFullResume: false,
      hasDispatchedResume: true,
      expectedAgentIds: ['lead', 'worker'],
      agentMessages: {
        lead: [{ id: 'm1', role: 'agent', content: 'cached', timestamp: 1, type: 'text' }],
        worker: [{ id: 'm2', role: 'agent', content: 'cached', timestamp: 2, type: 'text' }],
      },
    })).toBe(true)
  })

  it('forces replay before the first resume dispatch even if messages exist', () => {
    expect(canSkipWarmReplay({
      resumeWarm: true,
      cwdReady: true,
      forceFullResume: false,
      hasDispatchedResume: false,
      agentMessages: {
        lead: [{ id: 'm1', role: 'agent', content: 'cached', timestamp: 1, type: 'text' }],
      },
    })).toBe(false)
  })

  it('skips first resume when an evicted mission hydrates from a safe message snapshot', () => {
    expect(canSkipWarmReplay({
      resumeWarm: false,
      hydratedFromMessageSnapshot: true,
      snapshotReplaySafe: true,
      cwdReady: true,
      forceFullResume: false,
      hasDispatchedResume: false,
      agentMessages: {
        lead: [{ id: 'm1', role: 'agent', content: 'cached', timestamp: 1, type: 'text' }],
      },
    })).toBe(true)
  })

  it('does not skip first resume from a snapshot for a running or unsafe mission', () => {
    expect(canSkipWarmReplay({
      resumeWarm: false,
      hydratedFromMessageSnapshot: true,
      snapshotReplaySafe: false,
      cwdReady: true,
      forceFullResume: false,
      hasDispatchedResume: false,
      agentMessages: {
        lead: [{ id: 'm1', role: 'agent', content: 'cached', timestamp: 1, type: 'text' }],
      },
    })).toBe(false)
  })
})
