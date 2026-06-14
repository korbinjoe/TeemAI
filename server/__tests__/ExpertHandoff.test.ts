import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createMissionAgentRoutes } from '../routes/agent/missionAgentRoutes'
import { MissionAgentSessionStore, compositeKey, type MissionAgentEntry } from '../ws/MissionAgentSessionStore'
import type { Router } from 'express'

vi.mock('../lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('../runtime/SlashCommandResolver', () => ({
  expandSlashCommand: vi.fn().mockImplementation((task: string) => Promise.resolve(task)),
}))

function makeExpertEntry(agentId: string, connectionId: string, chatId: string): MissionAgentEntry {
  return {
    sessionId: `sess-${agentId}`,
    acpClient: {
      isAlive: () => true,
      prompt: vi.fn().mockResolvedValue(undefined),
      write: vi.fn(),
      kill: vi.fn(),
    } as any,
    agentName: `Agent ${agentId}`,
    agentIcon: agentId[0].toUpperCase(),
    cwd: '/tmp/test',
    cliSessionId: `cli-${agentId}`,
    connectionId,
    chatId,
  }
}

interface MockDeps {
  expertHandler: any
  agentRegistry: any
  whiteboardManager: any
  workflowRegistry: any
  broadcastToChat: any
  store: MissionAgentSessionStore
}

function createMockDeps(): MockDeps {
  const store = new MissionAgentSessionStore()

  const expertHandler = {
    getExpertStore: () => store,
    getConnectionWs: vi.fn().mockReturnValue({
      send: vi.fn(),
      readyState: 1,
    }),
    handleStart: vi.fn().mockResolvedValue({ started: true, sessionId: 'sess-new' }),
    getRunning: vi.fn(),
    getExpertList: vi.fn().mockReturnValue([]),
    getExpertListForConnection: vi.fn().mockReturnValue([]),
    getTeamStatus: vi.fn().mockReturnValue([]),
    getExpertMessages: vi.fn().mockReturnValue(null),
    getExpertActivity: vi.fn().mockReturnValue(null),
    handleStop: vi.fn(),
    handleStopAll: vi.fn(),
    isReady: vi.fn().mockReturnValue(true),
    setRunningMeta: vi.fn(),
    clearCompleted: vi.fn().mockReturnValue(0),
    getConnectionsViewingChat: vi.fn().mockReturnValue([]),
  }

  const agentRegistry = {
    get: vi.fn().mockReturnValue({
      name: 'Target Agent',
      description: 'test',
      icon: 'T',
    }),
  }

  const whiteboardManager = {
    appendEntry: vi.fn(),
  }

  const workflowRegistry = {
    findByAgent: vi.fn().mockReturnValue(undefined),
  }

  const broadcastToChat = vi.fn()

  return { expertHandler, agentRegistry, whiteboardManager, workflowRegistry, broadcastToChat, store }
}

function findHandoffHandler(router: Router): (req: any, res: any) => Promise<void> {
  const layer = (router as any).stack.find(
    (l: any) => l.route?.path === '/api/agent/handoff' && l.route?.methods?.post,
  )
  return layer.route.stack[0].handle
}

function mockReq(body: Record<string, unknown>) {
  return { body } as any
}

function mockRes() {
  const res: any = {
    statusCode: 200,
    body: null,
    status(code: number) { res.statusCode = code; return res },
    json(data: any) { res.body = data; return res },
  }
  return res
}

describe('ExpertHandoff (/api/agent/handoff)', () => {
  let deps: MockDeps
  let handler: (req: any, res: any) => Promise<void>

  beforeEach(() => {
    deps = createMockDeps()
    const router = createMissionAgentRoutes({
      expertHandler: deps.expertHandler,
      agentRegistry: deps.agentRegistry,
      whiteboardManager: deps.whiteboardManager,
      workflowRegistry: deps.workflowRegistry,
      broadcastToChat: deps.broadcastToChat,
    })
    handler = findHandoffHandler(router)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── Normal handoff: source → target starts successfully ──

  describe('normal handoff', () => {
    it('returns { status: "ok" } when handoff succeeds', async () => {
      const sourceEntry = makeExpertEntry('source-agent', 'conn-1', 'chat-1')
      deps.store.set(compositeKey('conn-1', 'chat-1', 'source-agent'), sourceEntry)
      deps.store.set(compositeKey('conn-1', 'chat-1', 'target-agent'), makeExpertEntry('target-agent', 'conn-1', 'chat-1'))

      const res = mockRes()
      await handler(mockReq({
        from: 'source-agent',
        to: 'target-agent',
        chatId: 'chat-1',
        task: 'continue the work',
        context: { workDoneSoFar: 'did step 1' },
      }), res)

      expect(res.statusCode).toBe(200)
      expect(res.body.status).toBe('ok')
      expect(deps.expertHandler.handleStart).toHaveBeenCalled()
    })

    it('writes whiteboard entry on success', async () => {
      deps.store.set(compositeKey('conn-1', 'chat-1', 'source-agent'), makeExpertEntry('source-agent', 'conn-1', 'chat-1'))

      const res = mockRes()
      await handler(mockReq({
        from: 'source-agent',
        to: 'target-agent',
        chatId: 'chat-1',
        task: 'handoff task',
        context: {},
      }), res)

      expect(deps.whiteboardManager.appendEntry).toHaveBeenCalledWith(
        'chat-1',
        expect.objectContaining({ type: 'handoff' }),
      )
    })

    it('broadcasts expert:handoff event', async () => {
      deps.store.set(compositeKey('conn-1', 'chat-1', 'source-agent'), makeExpertEntry('source-agent', 'conn-1', 'chat-1'))

      const res = mockRes()
      await handler(mockReq({
        from: 'source-agent',
        to: 'target-agent',
        chatId: 'chat-1',
        task: 'handoff task',
        context: {},
      }), res)

      expect(deps.broadcastToChat).toHaveBeenCalledWith(
        'chat-1',
        expect.objectContaining({
          type: 'agent:handoff',
          payload: expect.objectContaining({
            sourceAgentId: 'source-agent',
            targetAgentId: 'target-agent',
          }),
        }),
      )
    })
  })

  // ── Chain depth limit ──

  describe('dispatch chain depth limit', () => {
    it('returns 400 when chain depth exceeds MAX_HANDOFF_CHAIN_DEPTH=2', async () => {
      const key = compositeKey('conn-1', 'chat-1', 'agent-c')
      deps.store.set(key, makeExpertEntry('agent-c', 'conn-1', 'chat-1'))
      deps.store.setMeta(key, 'dispatchChain', ['agent-a', 'agent-b', 'agent-c'])

      const res = mockRes()
      await handler(mockReq({
        from: 'agent-c',
        to: 'agent-d',
        chatId: 'chat-1',
        task: 'too deep',
        context: {},
      }), res)

      expect(res.statusCode).toBe(400)
      expect(res.body.reason).toContain('chain depth exceeded')
    })
  })

  // ── Handoff to self ──

  describe('handoff to self', () => {
    it('returns 400 error when from === to', async () => {
      const res = mockRes()
      await handler(mockReq({
        from: 'agent-a',
        to: 'agent-a',
        chatId: 'chat-1',
        task: 'self handoff',
        context: {},
      }), res)

      expect(res.statusCode).toBe(400)
      expect(res.body.reason).toContain('Cannot handoff to self')
    })
  })

  // ── Source agent not found ──

  describe('source agent not found', () => {
    it('returns 404 when source agent is not running in the chat', async () => {
      const res = mockRes()
      await handler(mockReq({
        from: 'ghost-agent',
        to: 'target-agent',
        chatId: 'chat-1',
        task: 'handoff from ghost',
        context: {},
      }), res)

      expect(res.statusCode).toBe(404)
      expect(res.body.reason).toContain('Source agent')
    })
  })

  // ── Target agent not in registry ──

  describe('target agent not in registry', () => {
    it('returns 404 when target agentId is not registered', async () => {
      deps.agentRegistry.get.mockReturnValue(undefined)

      const res = mockRes()
      await handler(mockReq({
        from: 'source-agent',
        to: 'unknown-agent',
        chatId: 'chat-1',
        task: 'handoff to unknown',
        context: {},
      }), res)

      expect(res.statusCode).toBe(404)
      expect(res.body.reason).toContain('Target agent')
    })
  })

  // ── Missing required fields ──

  describe('missing required fields', () => {
    it('returns 400 when required fields are missing', async () => {
      const res = mockRes()
      await handler(mockReq({ from: 'a', to: 'b' }), res)

      expect(res.statusCode).toBe(400)
      expect(res.body.reason).toContain('required')
    })
  })

  // ── WebSocket connection lost ──

  describe('WebSocket connection lost', () => {
    it('returns 500 when no WS connection for source agent', async () => {
      deps.store.set(compositeKey('conn-1', 'chat-1', 'source-agent'), makeExpertEntry('source-agent', 'conn-1', 'chat-1'))
      deps.expertHandler.getConnectionWs.mockReturnValue(undefined)

      const res = mockRes()
      await handler(mockReq({
        from: 'source-agent',
        to: 'target-agent',
        chatId: 'chat-1',
        task: 'handoff with no ws',
        context: {},
      }), res)

      expect(res.statusCode).toBe(500)
      expect(res.body.reason).toContain('WebSocket')
    })
  })

  // ── Handoff failure writes whiteboard entry ──

  describe('handoff failure', () => {
    it('writes failure entry to whiteboard when target agent fails to start', async () => {
      deps.store.set(compositeKey('conn-1', 'chat-1', 'source-agent'), makeExpertEntry('source-agent', 'conn-1', 'chat-1'))
      deps.expertHandler.handleStart.mockRejectedValue(new Error('spawn failed'))

      const res = mockRes()
      await handler(mockReq({
        from: 'source-agent',
        to: 'target-agent',
        chatId: 'chat-1',
        task: 'failing handoff',
        context: {},
      }), res)

      expect(res.statusCode).toBe(500)

      const failureCalls = deps.whiteboardManager.appendEntry.mock.calls
        .filter(([, entry]: [string, any]) => entry.tags?.includes('failed'))
      expect(failureCalls.length).toBeGreaterThanOrEqual(1)
    })

    it('broadcasts expert:handoff-failed event on error', async () => {
      deps.store.set(compositeKey('conn-1', 'chat-1', 'source-agent'), makeExpertEntry('source-agent', 'conn-1', 'chat-1'))
      deps.expertHandler.handleStart.mockRejectedValue(new Error('boom'))

      const res = mockRes()
      await handler(mockReq({
        from: 'source-agent',
        to: 'target-agent',
        chatId: 'chat-1',
        task: 'failing handoff',
        context: {},
      }), res)

      expect(deps.broadcastToChat).toHaveBeenCalledWith(
        'chat-1',
        expect.objectContaining({ type: 'agent:handoff-failed' }),
      )
    })
  })

  // ── Consecutive handoffs to same target agent ──

  describe('consecutive handoffs to same target', () => {
    it('second handoff to same target agent succeeds', async () => {
      deps.store.set(compositeKey('conn-1', 'chat-1', 'source-a'), makeExpertEntry('source-a', 'conn-1', 'chat-1'))

      const res1 = mockRes()
      await handler(mockReq({
        from: 'source-a',
        to: 'target-x',
        chatId: 'chat-1',
        task: 'first handoff',
        context: {},
      }), res1)
      expect(res1.statusCode).toBe(200)
      expect(res1.body.status).toBe('ok')

      deps.store.set(compositeKey('conn-1', 'chat-1', 'source-b'), makeExpertEntry('source-b', 'conn-1', 'chat-1'))

      const res2 = mockRes()
      await handler(mockReq({
        from: 'source-b',
        to: 'target-x',
        chatId: 'chat-1',
        task: 'second handoff to same target',
        context: {},
      }), res2)
      expect(res2.statusCode).toBe(200)
      expect(res2.body.status).toBe('ok')
      expect(deps.expertHandler.handleStart).toHaveBeenCalledTimes(2)
    })
  })

  // ── Workflow reassignment ──

  describe('workflow task reassignment on handoff', () => {
    it('reassigns workflow task from source to target agent', async () => {
      const reassignFn = vi.fn()
      deps.workflowRegistry.findByAgent.mockReturnValue({
        findTaskByCurrentAgent: vi.fn().mockReturnValue({ taskId: 't1' }),
        reassignTask: reassignFn,
      })

      deps.store.set(compositeKey('conn-1', 'chat-1', 'source-agent'), makeExpertEntry('source-agent', 'conn-1', 'chat-1'))
      deps.store.set(compositeKey('conn-1', 'chat-1', 'target-agent'), makeExpertEntry('target-agent', 'conn-1', 'chat-1'))

      const res = mockRes()
      await handler(mockReq({
        from: 'source-agent',
        to: 'target-agent',
        chatId: 'chat-1',
        task: 'handoff with workflow',
        context: {},
      }), res)

      expect(reassignFn).toHaveBeenCalledWith('t1', 'target-agent')
    })
  })

  // ── Target agent fails to start → 500 ──

  describe('target agent start failure', () => {
    it('returns 500 when handleStart returns started=false', async () => {
      deps.store.set(compositeKey('conn-1', 'chat-1', 'source-agent'), makeExpertEntry('source-agent', 'conn-1', 'chat-1'))
      deps.expertHandler.handleStart.mockResolvedValue({ started: false })

      const res = mockRes()
      await handler(mockReq({
        from: 'source-agent',
        to: 'target-agent',
        chatId: 'chat-1',
        task: 'doomed handoff',
        context: {},
      }), res)

      expect(res.statusCode).toBe(500)
      expect(res.body.reason).toContain('failed to start')
    })
  })
})
