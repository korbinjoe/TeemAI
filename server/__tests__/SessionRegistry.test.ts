import { EventEmitter } from 'events'
import { describe, it, expect, vi } from 'vitest'
import { SessionRegistry } from '../terminal/SessionRegistry'
import type { ActivityState } from '../terminal/ActivityDeriver'

const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

const activity = (phase: ActivityState['phase'] = 'waiting_input'): ActivityState => ({
  phase,
  background: false,
  toolCount: 3,
  toolCompleted: 3,
  hasText: true,
  updatedAt: Date.now(),
})

const makeRegistry = () => {
  const chatStore = {
    update: vi.fn().mockResolvedValue(undefined),
  }
  const hooks = {
    cleanup: vi.fn().mockResolvedValue(undefined),
  }
  return {
    registry: new SessionRegistry(hooks as any, chatStore as any),
    chatStore,
  }
}

describe('SessionRegistry process exit mapping', () => {
  it('keeps successful Codex one-shot exit as idle waiting_input', async () => {
    const { registry, chatStore } = makeRegistry()
    const streamManager = new EventEmitter() as any
    const activities: Array<{ phase: string }> = []
    const statuses: Array<{ chatId: string; status: string }> = []

    registry.onActivityChanged((payload) => activities.push(payload))
    registry.onChatStatusChanged((chatId, status) => statuses.push({ chatId, status }))

    registry.register({
      sessionId: 'session-1',
      streamManager,
      chatId: 'chat-1',
      agentId: 'fullstack-engineer',
      agentName: 'Fullstack Engineer',
      provider: 'codex',
      cwd: '/tmp',
      connectedWs: null,
      connectionId: null,
      activitySnapshot: activity('waiting_input'),
      createdAt: Date.now(),
      disconnectedAt: null,
    })

    streamManager.emit('exit', { exitCode: 0 })
    await flush()

    expect(activities.some((payload) => payload.phase === 'completed')).toBe(false)
    expect(activities.at(-1)?.phase).toBe('waiting_input')
    expect(chatStore.update).toHaveBeenLastCalledWith('chat-1', {
      status: 'idle',
      taskStatus: 'waiting_input',
    })
    expect(statuses.at(-1)).toEqual({ chatId: 'chat-1', status: 'idle' })
  })

  it('keeps non-Codex successful exit as stopped success', async () => {
    const { registry, chatStore } = makeRegistry()
    const streamManager = new EventEmitter() as any
    const activities: Array<{ phase: string }> = []
    const statuses: Array<{ chatId: string; status: string }> = []

    registry.onActivityChanged((payload) => activities.push(payload))
    registry.onChatStatusChanged((chatId, status) => statuses.push({ chatId, status }))

    registry.register({
      sessionId: 'session-1',
      streamManager,
      chatId: 'chat-1',
      agentId: 'fullstack-engineer',
      agentName: 'Fullstack Engineer',
      provider: 'claude',
      cwd: '/tmp',
      connectedWs: null,
      connectionId: null,
      activitySnapshot: activity('waiting_input'),
      createdAt: Date.now(),
      disconnectedAt: null,
    })

    streamManager.emit('exit', { exitCode: 0 })
    await flush()

    expect(activities.at(-1)?.phase).toBe('completed')
    expect(chatStore.update).toHaveBeenLastCalledWith('chat-1', expect.objectContaining({
      status: 'stopped',
      taskStatus: 'success',
    }))
    expect(statuses.at(-1)).toEqual({ chatId: 'chat-1', status: 'stopped' })
  })
})
