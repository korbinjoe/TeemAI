import { describe, it, expect, vi } from 'vitest'
import { createMissionAgentDirectInput } from '../ws/MissionAgentDirectInput'
import { MissionAgentSessionStore, compositeKey } from '../ws/MissionAgentSessionStore'

const makeWs = () => ({ send: vi.fn(), readyState: 1 }) as any

describe('ExpertDirectInput codex session reuse', () => {
  it('sends message to alive codex session via prompt (same as claude)', async () => {
    const store = new MissionAgentSessionStore()
    const connId = 'conn-1'
    const chatId = 'chat-1'
    const agentId = 'agent-1'
    const key = compositeKey(connId, chatId, agentId)

    const destroy = vi.fn()
    const prompt = vi.fn(async () => ({}))
    store.set(key, {
      sessionId: 'sess-codex-1',
      acpClient: {
        isAlive: () => true,
        prompt,
        write: vi.fn(),
        destroy,
      } as any,
      agentName: 'Codex Agent',
      agentIcon: 'C',
      cwd: '/repo',
      provider: 'codex',
      connectionId: connId,
      chatId,
    })

    const remove = vi.fn()
    const sessionRegistry = {
      get: vi.fn(() => ({ killReason: undefined })),
      remove,
      findByChat: vi.fn(),
    } as any

    const handleStart = vi.fn(async () => ({ started: true, method: 'spawned' }))

    const { handleDirectInput } = createMissionAgentDirectInput({
      store,
      chatStore: {
        get: vi.fn(() => ({ id: chatId, title: 'Existing Title' })),
        update: vi.fn(),
      } as any,
      sessionRegistry,
      titleService: { generate: vi.fn(async () => 'semantic') } as any,
      broadcastToChat: vi.fn(),
      ensureAttachedRunning: vi.fn(() => store.get(key)) as any,
      trackParticipant: vi.fn(),
      handleStart,
    })

    await handleDirectInput(makeWs(), {
      chatId,
      agentId,
      message: 'second turn',
      autoStart: true,
    }, connId)

    expect(prompt).toHaveBeenCalledTimes(1)
    expect(destroy).not.toHaveBeenCalled()
    expect(handleStart).not.toHaveBeenCalled()
  })
})
