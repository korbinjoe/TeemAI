import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createMissionAgentLifecycle, type MissionAgentLifecycleDeps } from '../ws/MissionAgentLifecycle'
import { MissionAgentSessionStore, compositeKey } from '../ws/MissionAgentSessionStore'

vi.mock('../terminal/StreamJsonManager', () => ({
  StreamJsonManager: class MockStreamJsonManager {
    private _sessionId = `sess-${Math.random().toString(36).slice(2, 8)}`
    getSessionId = () => this._sessionId
    spawn = vi.fn().mockResolvedValue(undefined)
    emit = vi.fn()
    on = vi.fn()
    setCliSessionId = vi.fn()
    kill = vi.fn()
  },
}))

vi.mock('../runtime/ConfigCompiler', () => ({
  ConfigCompiler: vi.fn(),
}))

vi.mock('../acp/ACPClient', () => ({
  ACPClient: class MockACPClient {
    initialize = vi.fn().mockResolvedValue(undefined)
    isAlive = () => true
    prompt = vi.fn().mockResolvedValue(undefined)
    write = vi.fn()
    kill = vi.fn()
    markReady = vi.fn()
    getCurrentMessages = () => []
    handleClientResponse = vi.fn()
  },
}))

vi.mock('../acp/ACPAdapterFactory', () => ({
  createACPAdapter: vi.fn().mockReturnValue({}),
}))

vi.mock('../runtime/SlashCommandResolver', () => ({
  expandSlashCommand: vi.fn().mockImplementation((task: string) => Promise.resolve(task)),
}))

vi.mock('../whiteboard/ContextBriefing', () => ({
  ContextBriefing: vi.fn().mockImplementation(() => ({
    maybeWrapTask: (task: string) => task,
  })),
}))

vi.mock('../runtime/featureFlags', () => ({
  isWhiteboardOnDemandEnabled: () => false,
}))

vi.mock('../lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('../lib/eventTracker', () => ({
  trackEvent: vi.fn(),
}))

vi.mock('../lib/validateCwd', () => ({
  isAllowedCwd: () => true,
}))

vi.mock('../services/chat/ChatTitleService', () => {
  return {
    ChatTitleService: class MockChatTitleService {
      generateTitle = vi.fn().mockResolvedValue('Test Title')
    },
  }
})

vi.mock('../ws/MissionAgentEventWiring', () => ({
  wireMissionAgentStreamHandlers: vi.fn().mockReturnValue({
    fileCollector: {},
    tokenTracker: {},
  }),
}))

vi.mock('../ws/MissionAgentPendingTaskFlush', () => ({
  flushPendingTasks: vi.fn(),
}))

function mockWs() {
  const sent: any[] = []
  return {
    ws: {
      send: vi.fn((data: string) => { sent.push(JSON.parse(data)) }),
      readyState: 1,
    } as any,
    sent,
  }
}

function createMockDeps(store: MissionAgentSessionStore, overrides: Partial<MissionAgentLifecycleDeps> = {}): MissionAgentLifecycleDeps {
  return {
    configCompiler: {
      compile: vi.fn().mockResolvedValue({
        command: '/usr/local/bin/claude',
        args: ['--json'],
        cwd: '/tmp/test',
        env: {},
        cleanup: vi.fn(),
        presetSessionId: undefined,
      }),
    } as any,
    agentRegistry: {
      get: vi.fn().mockReturnValue({
        name: 'Test Agent',
        icon: 'T',
        description: 'test',
        provider: 'claude',
        subAgentNames: [],
        tags: [],
      }),
    } as any,
    agentStore: {
      get: vi.fn().mockReturnValue(undefined),
    } as any,
    chatStore: {
      get: vi.fn().mockReturnValue({ workspaceId: 'ws-1', model: undefined }),
      update: vi.fn().mockResolvedValue(undefined),
    } as any,
    workspaceStore: {
      get: vi.fn().mockReturnValue({ repositories: [{ path: '/tmp/test' }] }),
    } as any,
    tokenUsageStore: {} as any,
    executionLogStore: {
      create: vi.fn().mockResolvedValue({ id: 'exec-log-1' }),
    } as any,
    sessionRegistry: {
      register: vi.fn(),
      get: vi.fn().mockReturnValue(null),
      remove: vi.fn(),
      findByChat: vi.fn().mockReturnValue(null),
      onSessionRemoved: vi.fn(),
    } as any,
    store,
    versionGate: {
      isBlocked: () => false,
      getPolicy: () => null,
      getClientVersion: () => '1.0.0',
    } as any,
    getConnectionWs: vi.fn().mockReturnValue(null),
    getConnectionChatId: vi.fn().mockReturnValue('chat-1'),
    sendTo: vi.fn(),
    persistExpertSession: vi.fn(),
    broadcastToChat: vi.fn(),
    ...overrides,
  }
}

describe('ExpertLifecycle', () => {
  let store: MissionAgentSessionStore

  beforeEach(() => {
    store = new MissionAgentSessionStore()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── First start → spawn new process ──

  describe('first start → spawn', () => {
    it('spawns a new process and returns { started: true, method: "spawned" }', async () => {
      const deps = createMockDeps(store)
      const { handleStart } = createMissionAgentLifecycle(deps)
      const { ws } = mockWs()

      const result = await handleStart(ws, {
        agentId: 'agent-a',
        task: 'do something',
        chatId: 'chat-1',
      }, 'conn-1')

      expect(result.started).toBe(true)
      expect(result.method).toBe('spawned')
      expect(result.sessionId).toBeDefined()

      const key = compositeKey('conn-1', 'chat-1', 'agent-a')
      expect(store.has(key)).toBe(true)
      expect(store.isStarting(key)).toBe(false)
    })
  })

  // ── Already-running agent → send task via prompt ──

  describe('already-running agent → prompt', () => {
    it('sends task to running agent via acpClient.prompt', async () => {
      const mockPrompt = vi.fn().mockResolvedValue(undefined)
      const key = compositeKey('conn-1', 'chat-1', 'agent-a')
      store.set(key, {
        sessionId: 'sess-existing',
        acpClient: {
          isAlive: () => true,
          prompt: mockPrompt,
          write: vi.fn(),
          kill: vi.fn(),
        } as any,
        agentName: 'Agent A',
        agentIcon: 'A',
        cwd: '/tmp',
        connectionId: 'conn-1',
        chatId: 'chat-1',
        provider: 'claude',
      })

      const deps = createMockDeps(store)
      const { handleStart } = createMissionAgentLifecycle(deps)
      const { ws } = mockWs()

      const result = await handleStart(ws, {
        agentId: 'agent-a',
        task: 'another task',
        chatId: 'chat-1',
      }, 'conn-1')

      expect(result.started).toBe(true)
      expect(result.method).toBe('existing')
      expect(result.sessionId).toBe('sess-existing')
      expect(mockPrompt).toHaveBeenCalledWith('sess-existing', 'another task', undefined)
    })
  })

  // ── Dead-but-in-store agent → cleanup + respawn ──

  describe('dead-but-in-store agent → cleanup and respawn', () => {
    it('cleans up dead entry and spawns new process', async () => {
      const key = compositeKey('conn-1', 'chat-1', 'agent-a')
      store.set(key, {
        sessionId: 'sess-dead',
        acpClient: {
          isAlive: () => false,
          prompt: vi.fn(),
          write: vi.fn(),
          kill: vi.fn(),
        } as any,
        agentName: 'Dead Agent',
        agentIcon: 'D',
        cwd: '/tmp',
        connectionId: 'conn-1',
        chatId: 'chat-1',
      })

      const deps = createMockDeps(store)
      const { handleStart } = createMissionAgentLifecycle(deps)
      const { ws } = mockWs()

      const result = await handleStart(ws, {
        agentId: 'agent-a',
        task: 'revive task',
        chatId: 'chat-1',
      }, 'conn-1')

      expect(result.started).toBe(true)
      expect(result.method).toBe('spawned')
      // New session should have been created (not 'sess-dead')
      expect(result.sessionId).toBeDefined()
      expect(result.sessionId).not.toBe('sess-dead')
    })
  })

  // ── isStarting lock → skip ──

  describe('isStarting lock → skip', () => {
    it('returns { method: "skipped" } when agent is already starting', async () => {
      const key = compositeKey('conn-1', 'chat-1', 'agent-a')
      store.markStarting(key)

      const deps = createMockDeps(store)
      const { handleStart } = createMissionAgentLifecycle(deps)
      const { ws } = mockWs()

      const result = await handleStart(ws, {
        agentId: 'agent-a',
        task: 'duplicate start',
        chatId: 'chat-1',
      }, 'conn-1')

      expect(result.started).toBe(true)
      expect(result.method).toBe('skipped')

      store.clearStarting(key)
    })
  })

  // ── Completed agent → re-start should spawn (not blocked) ──

  describe('completed agent → re-start', () => {
    it('spawns normally after previous completion (completed entry does not block)', async () => {
      const key = compositeKey('conn-1', 'chat-1', 'agent-a')

      store.setCompleted(key, {
        sessionId: 'sess-old',
        agentName: 'Agent A',
        agentIcon: 'A',
        exitCode: 0,
        completedAt: new Date().toISOString(),
        connectionId: 'conn-1',
        chatId: 'chat-1',
      })

      const deps = createMockDeps(store)
      const { handleStart } = createMissionAgentLifecycle(deps)
      const { ws } = mockWs()

      const result = await handleStart(ws, {
        agentId: 'agent-a',
        task: 'second assignment',
        chatId: 'chat-1',
      }, 'conn-1')

      expect(result.started).toBe(true)
      expect(result.method).toBe('spawned')
      expect(store.has(key)).toBe(true)
    })
  })

  // ── Missing chatId → error ──

  describe('missing chatId', () => {
    it('returns { started: false } and sends expert:error', async () => {
      const deps = createMockDeps(store)
      const { handleStart } = createMissionAgentLifecycle(deps)
      const { ws, sent } = mockWs()

      const result = await handleStart(ws, {
        agentId: 'agent-a',
        task: 'task',
      } as any, 'conn-1')

      expect(result.started).toBe(false)
      expect(sent.some(m => m.type === 'agent:error' && m.payload.error === 'missing_chat_id')).toBe(true)
    })
  })

  // ── Missing agentId in registry → error ──

  describe('missing agentId in registry', () => {
    it('returns { started: false } when agent not found', async () => {
      const deps = createMockDeps(store, {
        agentRegistry: {
          get: vi.fn().mockReturnValue(undefined),
        } as any,
      })
      const { handleStart } = createMissionAgentLifecycle(deps)
      const { ws, sent } = mockWs()

      const result = await handleStart(ws, {
        agentId: 'nonexistent-agent',
        task: 'task',
        chatId: 'chat-1',
      }, 'conn-1')

      expect(result.started).toBe(false)
      expect(sent.some(m => m.type === 'agent:error')).toBe(true)
    })
  })

  // ── Cross-connection same agent → kill old, spawn new ──

  describe('cross-connection duplicate agent', () => {
    it('kills existing agent on different connection before spawning', async () => {
      const killFn = vi.fn()
      const findByChatMock = vi.fn()
        .mockReturnValueOnce({
          connectionId: 'conn-OLD',
          killReason: undefined,
          streamManager: { kill: killFn },
        })
        .mockReturnValue(null)
      const deps = createMockDeps(store, {
        sessionRegistry: {
          register: vi.fn(),
          get: vi.fn().mockReturnValue(null),
          remove: vi.fn(),
          findByChat: findByChatMock,
          onSessionRemoved: vi.fn(),
        } as any,
      })
      const { handleStart } = createMissionAgentLifecycle(deps)
      const { ws } = mockWs()

      const result = await handleStart(ws, {
        agentId: 'agent-a',
        task: 'take over',
        chatId: 'chat-1',
      }, 'conn-NEW')

      expect(result.started).toBe(true)
      expect(result.method).toBe('spawned')
      expect(killFn).toHaveBeenCalled()
    })
  })

  // ── Multiple starts of same agent in sequence (dispatch → complete → dispatch again) ──

  describe('sequential re-assignment: dispatch → complete → dispatch same agent', () => {
    it('second dispatch after first completion succeeds with method=spawned', async () => {
      const deps = createMockDeps(store)
      const { handleStart } = createMissionAgentLifecycle(deps)
      const { ws } = mockWs()

      // First dispatch
      const first = await handleStart(ws, {
        agentId: 'agent-a',
        task: 'first task',
        chatId: 'chat-1',
      }, 'conn-1')
      expect(first.started).toBe(true)
      expect(first.method).toBe('spawned')

      // Simulate completion: cleanup running entry, set completed
      const key = compositeKey('conn-1', 'chat-1', 'agent-a')
      store.cleanupWithStop(key, 'conn-1')
      expect(store.has(key)).toBe(false)
      expect(store.getCompleted(key)).toBeDefined()

      // Second dispatch — should spawn again, not be blocked by completed entry
      const second = await handleStart(ws, {
        agentId: 'agent-a',
        task: 'second task',
        chatId: 'chat-1',
      }, 'conn-1')
      expect(second.started).toBe(true)
      expect(second.method).toBe('spawned')
      expect(store.has(key)).toBe(true)
    })
  })

  describe('codex resume propagation', () => {
    it('passes resumeSessionId into configCompiler context for codex spawn', async () => {
      const compileMock = vi.fn().mockResolvedValue({
        command: 'codex',
        args: ['exec', '--json', '--resume', 'thread-xyz'],
        cwd: '/tmp/test',
        env: {},
        cleanup: vi.fn(),
      })
      const deps = createMockDeps(store, {
        configCompiler: { compile: compileMock } as any,
        agentRegistry: {
          get: vi.fn().mockReturnValue({
            name: 'Codex Agent',
            icon: 'C',
            description: 'test',
            provider: 'codex',
            subAgentNames: [],
            tags: [],
          }),
        } as any,
      })
      const { handleStart } = createMissionAgentLifecycle(deps)
      const { ws } = mockWs()

      const result = await handleStart(ws, {
        agentId: 'agent-codex',
        task: 'resume this',
        chatId: 'chat-1',
        resumeSessionId: 'thread-xyz',
      }, 'conn-1')

      expect(result.started).toBe(true)
      expect(result.method).toBe('spawned')
      expect(compileMock).toHaveBeenCalledTimes(1)
      expect(compileMock.mock.calls[0][1].resumeSessionId).toBe('thread-xyz')
      expect(compileMock.mock.calls[0][2]).toBe('codex')
    })
  })
})
