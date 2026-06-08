import { describe, it, expect, vi, beforeEach } from 'vitest'

const { createExpertDirectInput } = await import('../ws/ExpertDirectInput')
const { ExpertSessionStore } = await import('../ws/ExpertSessionStore')

describe('ExpertDirectInput codex resume', () => {
  const connId = 'conn-1'
  const chatId = 'chat-1'
  const agentId = 'agent-1'

  let store: InstanceType<typeof ExpertSessionStore>
  let handleStart: ReturnType<typeof vi.fn>

  beforeEach(() => {
    store = new ExpertSessionStore()
    handleStart = vi.fn(async () => ({ started: true }))
  })

  const buildDeps = () => ({
    store,
    chatStore: {
      get: vi.fn(() => ({
        id: chatId,
        title: 'Existing Title',
        expertSessions: {
          [agentId]: {
            cliSessionId: 'thread-123',
            provider: 'codex',
            cwd: '/repo',
          },
        },
      })),
      update: vi.fn(),
    } as any,
    sessionRegistry: { get: vi.fn(), remove: vi.fn(), findByChat: vi.fn() } as any,
    titleService: { generate: vi.fn(async () => 'semantic') } as any,
    broadcastToChat: vi.fn(),
    ensureAttachedRunning: vi.fn(() => undefined) as any,
    trackParticipant: vi.fn(),
    handleStart,
  })

  it('does not pass resumeSessionId for codex historical session', async () => {
    const { handleDirectInput } = createExpertDirectInput(buildDeps())
    const ws = { send: vi.fn(), readyState: 1 } as any

    await handleDirectInput(ws, {
      chatId,
      agentId,
      message: 'next turn',
      autoStart: true,
    }, connId)

    expect(handleStart).toHaveBeenCalledTimes(1)
    const startPayload = handleStart.mock.calls[0][1]
    expect(startPayload.resumeSessionId).toBeUndefined()
    expect(startPayload.cwd).toBeUndefined()
  })
})
