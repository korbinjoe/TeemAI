import { describe, it, expect, vi } from 'vitest'
import { flushPendingTasks } from '../ws/MissionAgentPendingTaskFlush'
import { MissionAgentSessionStore, compositeKey } from '../ws/MissionAgentSessionStore'

const makeStoreWithQueue = () => {
  const store = new MissionAgentSessionStore()
  const key = compositeKey('conn-1', 'chat-1', 'agent-1')
  store.set(key, {
    sessionId: 'sess-1',
    acpClient: {} as any,
    agentName: 'Agent',
    agentIcon: 'A',
    cwd: '/repo',
    provider: 'codex',
    connectionId: 'conn-1',
    chatId: 'chat-1',
  })
  return { store, key }
}

describe('flushPendingTasks', () => {
  it('delivers queued prompts sequentially in FIFO order', async () => {
    const { store, key } = makeStoreWithQueue()
    store.enqueuePendingTask(key, { task: 'first', enqueuedAt: Date.now(), connectionId: 'conn-1' })
    store.enqueuePendingTask(key, { task: 'second', enqueuedAt: Date.now(), connectionId: 'conn-1' })
    store.enqueuePendingTask(key, { task: 'third', enqueuedAt: Date.now(), connectionId: 'conn-1' })

    let active = 0
    let maxActive = 0
    const calls: string[] = []
    const prompt = vi.fn(async (_sessionId: string, text: string) => {
      active++
      maxActive = Math.max(maxActive, active)
      calls.push(text)
      await new Promise((resolve) => setTimeout(resolve, 0))
      active--
      return {}
    })

    await flushPendingTasks({
      store,
      acpClient: { prompt } as any,
      sessionRegistry: { sendToSession: vi.fn() } as any,
      sessionId: 'sess-1',
      key,
      agentId: 'agent-1',
      chatId: 'chat-1',
    })

    expect(calls).toEqual(['first', 'second', 'third'])
    expect(maxActive).toBe(1)
    expect(store.hasPendingTask(key)).toBe(false)
  })

  it('continues flushing after one queued prompt fails', async () => {
    const { store, key } = makeStoreWithQueue()
    store.enqueuePendingTask(key, { task: 'first', enqueuedAt: Date.now(), connectionId: 'conn-1' })
    store.enqueuePendingTask(key, { task: 'second', enqueuedAt: Date.now(), connectionId: 'conn-1' })

    const prompt = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({})
    const sendToSession = vi.fn()

    await flushPendingTasks({
      store,
      acpClient: { prompt } as any,
      sessionRegistry: { sendToSession } as any,
      sessionId: 'sess-1',
      key,
      agentId: 'agent-1',
      chatId: 'chat-1',
    })

    expect(prompt).toHaveBeenCalledTimes(2)
    expect(prompt.mock.calls.map((call) => call[1])).toEqual(['first', 'second'])
    expect(sendToSession).toHaveBeenCalledWith('sess-1', expect.objectContaining({
      type: 'agent:error',
      payload: expect.objectContaining({
        error: 'pending_task_failed',
        task: 'first',
      }),
    }))
  })
})
