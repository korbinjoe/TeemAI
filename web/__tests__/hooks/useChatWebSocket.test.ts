// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'

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
    mockWsClient.on('chat:status-changed', handler)
    mockWsClient._emit('chat:status-changed', { chatId: '1', status: 'running' })
    expect(handler).toHaveBeenCalledWith({ chatId: '1', status: 'running' })
  })

  it('multiple handlers for same event all get called', () => {
    const h1 = vi.fn()
    const h2 = vi.fn()
    mockWsClient.on('expert:exit', h1)
    mockWsClient.on('expert:exit', h2)
    mockWsClient._emit('expert:exit', { agentId: 'a1', chatId: 'c1' })
    expect(h1).toHaveBeenCalled()
    expect(h2).toHaveBeenCalled()
  })

  it('no longer triggers after off', () => {
    const handler = vi.fn()
    mockWsClient.on('expert:stopped', handler)
    mockWsClient.off('expert:stopped', handler)
    mockWsClient._emit('expert:stopped', { agentId: 'a1', chatId: 'c1' })
    expect(handler).not.toHaveBeenCalled()
  })
})
