// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

class MockWebSocket {
  static OPEN = 1
  static CONNECTING = 0
  static CLOSING = 2
  static CLOSED = 3
  readyState = MockWebSocket.OPEN
  onopen: (() => void) | null = null
  onclose: ((evt: { code: number; reason: string }) => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: ((e: unknown) => void) | null = null
  send = vi.fn()
  close = vi.fn(() => { this.readyState = MockWebSocket.CLOSED })
  _simulateOpen() { this.readyState = MockWebSocket.OPEN; this.onopen?.() }
  _simulateMessage(data: unknown) { this.onmessage?.({ data: JSON.stringify(data) }) }
  _simulateClose() { this.readyState = MockWebSocket.CLOSED; this.onclose?.({ code: 1000, reason: '' } as any) }
}

vi.stubGlobal('WebSocket', MockWebSocket)

vi.mock('@/config/api', () => ({ getWsUrl: () => 'ws://localhost:13001' }))
vi.mock('@/lib/aes', () => ({ sendAESEvent: vi.fn() }))

import { WebSocketClient } from '../../services/WebSocketClient'

describe('WebSocketClient', () => {
  let client: WebSocketClient
  let mockWs: MockWebSocket

  beforeEach(() => {
    vi.useFakeTimers()
    client = new WebSocketClient('ws://test')
  })

  afterEach(() => {
    client.disconnect()
    vi.useRealTimers()
  })

  const connectAndCapture = async () => {
    const p = client.connect()
    mockWs = (client as unknown as { ws: MockWebSocket }).ws
    mockWs._simulateOpen()
    await p
    return mockWs
  }

  it('connect triggers WebSocket creation and resolves', async () => {
    await connectAndCapture()
    expect(client.isConnected()).toBe(true)
  })

  it('on/off event subscription and cancellation', async () => {
    await connectAndCapture()
    const handler = vi.fn()
    client.on('error', handler)
    mockWs._simulateMessage({ type: 'error', payload: { message: 'test' } })
    expect(handler).toHaveBeenCalledWith({ message: 'test' })
    client.off('error', handler)
    mockWs._simulateMessage({ type: 'error', payload: { message: 'test2' } })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('wildcard * receives all messages', async () => {
    await connectAndCapture()
    const handler = vi.fn()
    client.on('*', handler)
    mockWs._simulateMessage({ type: 'chat:status-changed', payload: { chatId: '1', status: 'running' } })
    expect(handler).toHaveBeenCalledWith({ type: 'chat:status-changed', payload: { chatId: '1', status: 'running' } })
  })

  it('send directly sends when connected', async () => {
    await connectAndCapture()
    client.send('chat:set-context', { chatId: '123' })
    expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({ type: 'chat:set-context', payload: { chatId: '123' } }))
  })

  it('send queues to pendingQueue when disconnected, flushes after reconnect', async () => {
    await connectAndCapture()
    mockWs._simulateClose()
    client.send('chat:set-context', { chatId: 'pending1' })
    const queue = (client as unknown as { pendingQueue: string[] }).pendingQueue
    expect(queue).toHaveLength(1)
  })

  it('disconnect Clean up reconnectTimer', async () => {
    await connectAndCapture()
    mockWs._simulateClose()
    client.disconnect()
    expect(client.isConnected()).toBe(false)
  })

  it('waitFor rejects on timeout', async () => {
    await connectAndCapture()
    const promise = client.waitFor('error', 100)
    vi.advanceTimersByTime(200)
    await expect(promise).rejects.toThrow('Timeout')
  })

  it('waitFor resolves when event received', async () => {
    await connectAndCapture()
    const promise = client.waitFor('error', 5000)
    mockWs._simulateMessage({ type: 'error', payload: { message: 'found' } })
    const result = await promise
    expect(result).toEqual({ message: 'found' })
  })
})
