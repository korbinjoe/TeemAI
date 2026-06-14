// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createAgentEventHandlers, type AgentEventContext } from '../../hooks/useAgentEvents'
import type { AgentActivity, Message } from '../../types/chat'
import type { AgentMessagesMap } from '../../hooks/useAgentMessages'

const { mockToast } = vi.hoisted(() => ({
  mockToast: { error: vi.fn(), info: vi.fn() },
}))
vi.mock('sonner', () => ({ toast: mockToast }))
vi.mock('@/i18n', () => ({ default: { t: (k: string) => k } }))

function createMockCtx(chatId = 'chat-1') {
  let activities: Record<string, AgentActivity> = {}
  let agentMessages: AgentMessagesMap = {}

  const setExpertActivities = vi.fn((updater: React.SetStateAction<Record<string, AgentActivity>>) => {
    activities = typeof updater === 'function' ? updater(activities) : updater
    return activities
  }) as unknown as React.Dispatch<React.SetStateAction<Record<string, AgentActivity>>>

  const setAgentMessages = vi.fn((updater: React.SetStateAction<AgentMessagesMap>) => {
    agentMessages = typeof updater === 'function' ? updater(agentMessages) : updater
    return agentMessages
  }) as unknown as React.Dispatch<React.SetStateAction<AgentMessagesMap>>

  let idCounter = 0
  const ctx: AgentEventContext & {
    readonly _activities: Record<string, AgentActivity>
    readonly _agentMessages: AgentMessagesMap
  } = {
    isCurrentChatEvent: (p?: { chatId?: string }) => p?.chatId === chatId,
    addSystemMessage: vi.fn(),
    uid: (prefix: string) => `${prefix}-${++idCounter}`,
    t: (key: string) => key,
    setExpertActivities,
    setAgentMessages,
    setLoading: vi.fn(),
    setThinking: vi.fn(),
    setAgentSlashCommands: vi.fn(),
    setAgentPlans: vi.fn(),
    setAgentModes: vi.fn(),
    setAgentAvailableCommands: vi.fn(),
    setAgentSessionInfo: vi.fn(),
    get _activities() { return activities },
    get _agentMessages() { return agentMessages },
  }
  return ctx
}

function mkActivity(phase: AgentActivity['phase'], extra: Partial<AgentActivity> = {}): AgentActivity {
  return {
    phase,
    background: false,
    toolCount: 0,
    toolCompleted: 0,
    hasText: false,
    updatedAt: Date.now(),
    ...extra,
  }
}

describe('AgentEventHandlers', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  // ── handleExpertStarted ──

  describe('handleExpertStarted', () => {
    it('first start writes initializing activity', () => {
      const ctx = createMockCtx()
      const { handleExpertStarted } = createAgentEventHandlers(ctx)

      handleExpertStarted({ agentId: 'eng-1', chatId: 'chat-1', agentName: 'Engineer', sessionId: 's1' })

      expect(ctx._activities['eng-1']).toBeDefined()
      expect(ctx._activities['eng-1'].phase).toBe('initializing')
    })

    it('re-start when existing phase=waiting_input → overwrites to initializing (bug regression)', () => {
      const ctx = createMockCtx()
      const { handleExpertStarted } = createAgentEventHandlers(ctx)

      // Seed agent in waiting_input (finished first dispatch, cleanup timer not yet fired)
      ctx.setExpertActivities(() => ({ 'eng-1': mkActivity('waiting_input') }))

      handleExpertStarted({ agentId: 'eng-1', chatId: 'chat-1', agentName: 'Engineer', sessionId: 's2' })

      expect(ctx._activities['eng-1'].phase).toBe('initializing')
    })

    it('re-start when existing phase=completed → overwrites to initializing', () => {
      const ctx = createMockCtx()
      const { handleExpertStarted } = createAgentEventHandlers(ctx)

      handleExpertStarted({ agentId: 'eng-1', chatId: 'chat-1', agentName: 'Engineer', sessionId: 's1' })
      // Simulate completion
      ctx.setExpertActivities(() => ({ 'eng-1': mkActivity('completed') }))

      handleExpertStarted({ agentId: 'eng-1', chatId: 'chat-1', agentName: 'Engineer', sessionId: 's2' })

      expect(ctx._activities['eng-1'].phase).toBe('initializing')
    })

    it('re-start when existing phase=error → overwrites to initializing', () => {
      const ctx = createMockCtx()
      const { handleExpertStarted } = createAgentEventHandlers(ctx)

      ctx.setExpertActivities(() => ({ 'eng-1': mkActivity('error') }))

      handleExpertStarted({ agentId: 'eng-1', chatId: 'chat-1', agentName: 'Engineer', sessionId: 's2' })

      expect(ctx._activities['eng-1'].phase).toBe('initializing')
    })

    it('re-start when existing phase=running → does NOT overwrite (duplicate event)', () => {
      const ctx = createMockCtx()
      const { handleExpertStarted } = createAgentEventHandlers(ctx)

      ctx.setExpertActivities(() => ({ 'eng-1': mkActivity('tool_running', { toolCount: 5, toolCompleted: 3 }) }))

      handleExpertStarted({ agentId: 'eng-1', chatId: 'chat-1', agentName: 'Engineer', sessionId: 's2' })

      expect(ctx._activities['eng-1'].phase).toBe('tool_running')
      expect(ctx._activities['eng-1'].toolCount).toBe(5)
    })

    it('chatId mismatch → event is dropped', () => {
      const ctx = createMockCtx('chat-1')
      const { handleExpertStarted } = createAgentEventHandlers(ctx)

      handleExpertStarted({ agentId: 'eng-1', chatId: 'chat-OTHER', agentName: 'Engineer', sessionId: 's1' })

      expect(ctx._activities['eng-1']).toBeUndefined()
    })

    it('payload.status === completed → sets completed activity for dead session replay', () => {
      const ctx = createMockCtx()
      const { handleExpertStarted } = createAgentEventHandlers(ctx)

      handleExpertStarted({ agentId: 'eng-1', chatId: 'chat-1', agentName: 'Engineer', sessionId: 's1', status: 'completed' })

      expect(ctx._activities['eng-1']).toBeDefined()
      expect(ctx._activities['eng-1'].phase).toBe('completed')
    })
  })

  // ── handleExpertExit ──

  describe('handleExpertExit', () => {
    it('exit sets phase to completed', () => {
      const ctx = createMockCtx()
      const { handleExpertStarted, handleExpertExit } = createAgentEventHandlers(ctx)

      handleExpertStarted({ agentId: 'eng-1', chatId: 'chat-1', agentName: 'Eng', sessionId: 's1' })
      handleExpertExit({ agentId: 'eng-1', chatId: 'chat-1' })

      expect(ctx._activities['eng-1'].phase).toBe('completed')
    })

    it('exit preserves exitReason', () => {
      const ctx = createMockCtx()
      const { handleExpertStarted, handleExpertExit } = createAgentEventHandlers(ctx)

      handleExpertStarted({ agentId: 'eng-1', chatId: 'chat-1', agentName: 'Eng', sessionId: 's1' })
      handleExpertExit({ agentId: 'eng-1', chatId: 'chat-1', exitReason: 'user_stop' })

      expect(ctx._activities['eng-1'].phase).toBe('completed')
      expect(ctx._activities['eng-1'].exitReason).toBe('user_stop')
    })

    it('chatId mismatch → event is dropped', () => {
      const ctx = createMockCtx('chat-1')
      const { handleExpertStarted, handleExpertExit } = createAgentEventHandlers(ctx)

      handleExpertStarted({ agentId: 'eng-1', chatId: 'chat-1', agentName: 'Eng', sessionId: 's1' })
      handleExpertExit({ agentId: 'eng-1', chatId: 'chat-OTHER' })

      // Should still be initializing, not completed
      expect(ctx._activities['eng-1'].phase).toBe('initializing')
    })
  })

  // ── handleExpertError ──

  describe('handleExpertError', () => {
    it('error with agentId writes to agent messages slot', () => {
      const ctx = createMockCtx()
      const { handleExpertError } = createAgentEventHandlers(ctx)

      handleExpertError({ agentId: 'eng-1', chatId: 'chat-1', error: 'runtime_error', message: 'Something broke' })

      expect(ctx._agentMessages['eng-1']).toHaveLength(1)
      expect(ctx._agentMessages['eng-1'][0].content).toContain('Something broke')
      expect(ctx._agentMessages['eng-1'][0].type).toBe('error')
    })

    it('error without agentId writes system message', () => {
      const ctx = createMockCtx()
      const { handleExpertError } = createAgentEventHandlers(ctx)

      handleExpertError({ chatId: 'chat-1', error: 'server_error', message: 'Internal error' })

      expect(ctx.addSystemMessage).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Internal error') }),
      )
    })

    it('command_not_found error triggers toast, not message', () => {
      const ctx = createMockCtx()
      const { handleExpertError } = createAgentEventHandlers(ctx)

      handleExpertError({ agentId: 'eng-1', chatId: 'chat-1', error: 'command_not_found', message: 'CLI not installed' })

      expect(mockToast.error).toHaveBeenCalledWith('CLI not installed', expect.any(Object))
      expect(ctx._agentMessages['eng-1']).toBeUndefined()
    })
  })

  // ── onExpertStructuredMessage ──

  describe('onExpertStructuredMessage', () => {
    it('delta type buffers messages via pushDelta', () => {
      const ctx = createMockCtx()
      const { onExpertStructuredMessage, flushDeltaBuffer } = createAgentEventHandlers(ctx)

      const msg: Message = { id: 'm1', role: 'agent', content: 'Hello', timestamp: Date.now(), agentId: 'eng-1' }
      onExpertStructuredMessage({
        agentId: 'eng-1',
        sessionId: 's1',
        chatId: 'chat-1',
        type: 'delta',
        messages: [msg],
      })

      // Not yet flushed
      expect(ctx._agentMessages['eng-1']).toBeUndefined()

      // Manually flush
      flushDeltaBuffer()
      expect(ctx._agentMessages['eng-1']).toHaveLength(1)
      expect(ctx._agentMessages['eng-1'][0].content).toBe('Hello')
    })

    it('full type clears delta buffer and applies replay', () => {
      const ctx = createMockCtx()
      const { onExpertStructuredMessage, flushDeltaBuffer } = createAgentEventHandlers(ctx)

      // Queue a delta first
      onExpertStructuredMessage({
        agentId: 'eng-1',
        sessionId: 's1',
        chatId: 'chat-1',
        type: 'delta',
        messages: [{ id: 'd1', role: 'agent', content: 'delta', timestamp: 100, agentId: 'eng-1' }],
      })

      // Then send full replay — should clear the delta
      onExpertStructuredMessage({
        agentId: 'eng-1',
        sessionId: 's1',
        chatId: 'chat-1',
        type: 'full',
        messages: [{ id: 'f1', role: 'agent', content: 'full replay', timestamp: 200, agentId: 'eng-1' }],
      })

      // Flush any remaining delta (should be empty for eng-1)
      flushDeltaBuffer()

      expect(ctx._agentMessages['eng-1']).toHaveLength(1)
      expect(ctx._agentMessages['eng-1'][0].content).toBe('full replay')
    })

    it('non-current chat messages are dropped', () => {
      const ctx = createMockCtx('chat-1')
      const { onExpertStructuredMessage, flushDeltaBuffer } = createAgentEventHandlers(ctx)

      onExpertStructuredMessage({
        agentId: 'eng-1',
        sessionId: 's1',
        chatId: 'chat-OTHER',
        type: 'delta',
        messages: [{ id: 'm1', role: 'agent', content: 'wrong chat', timestamp: Date.now() }],
      })

      flushDeltaBuffer()
      expect(ctx._agentMessages['eng-1']).toBeUndefined()
    })

    it('empty messages array is ignored', () => {
      const ctx = createMockCtx()
      const { onExpertStructuredMessage } = createAgentEventHandlers(ctx)

      onExpertStructuredMessage({
        agentId: 'eng-1',
        sessionId: 's1',
        chatId: 'chat-1',
        type: 'delta',
        messages: [],
      })

      expect((ctx.setAgentMessages as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
    })

    it('keeps a re-dispatch user turn in delta so it forms a new boundary', () => {
      const ctx = createMockCtx()
      const { onExpertStructuredMessage, flushDeltaBuffer } = createAgentEventHandlers(ctx)

      // First handoff turn: user prompt + agent reply
      onExpertStructuredMessage({
        agentId: 'eng-1', sessionId: 's1', chatId: 'chat-1', type: 'delta',
        messages: [
          { id: 'u1', role: 'user', content: 'first handoff', timestamp: 100, jsonlUuid: 'j-u1' },
          { id: 'a1', role: 'agent', content: 'reply 1', timestamp: 110, agentId: 'eng-1' },
        ],
      })
      flushDeltaBuffer()

      // Second handoff to the SAME agent: server-injected user turn (no optimistic copy)
      onExpertStructuredMessage({
        agentId: 'eng-1', sessionId: 's1', chatId: 'chat-1', type: 'delta',
        messages: [
          { id: 'u2', role: 'user', content: 'second handoff', timestamp: 200, jsonlUuid: 'j-u2' },
          { id: 'a2', role: 'agent', content: 'reply 2', timestamp: 210, agentId: 'eng-1' },
        ],
      })
      flushDeltaBuffer()

      const list = ctx._agentMessages['eng-1']
      const userTurns = list.filter((m) => m.role === 'user')
      expect(userTurns.map((m) => m.content)).toEqual(['first handoff', 'second handoff'])
    })

    it('dedups the parsed echo of an optimistic typed user message by content', () => {
      const ctx = createMockCtx()
      const { onExpertStructuredMessage, flushDeltaBuffer } = createAgentEventHandlers(ctx)

      // Optimistic user message added client-side when the user types
      ctx.setAgentMessages(() => ({
        'eng-1': [{ id: 'usr-1', role: 'user', content: 'hello', timestamp: 100, type: 'text' }],
      }))

      // Parser later echoes the same turn (stable id + jsonlUuid) via delta
      onExpertStructuredMessage({
        agentId: 'eng-1', sessionId: 's1', chatId: 'chat-1', type: 'delta',
        messages: [
          { id: 'msg-3-0', role: 'user', content: 'hello', timestamp: 100, jsonlUuid: 'j-1' },
          { id: 'a1', role: 'agent', content: 'reply', timestamp: 110, agentId: 'eng-1' },
        ],
      })
      flushDeltaBuffer()

      const userTurns = ctx._agentMessages['eng-1'].filter((m) => m.role === 'user')
      expect(userTurns).toHaveLength(1)
      expect(userTurns[0].id).toBe('usr-1')
    })
  })

  // ── handleExpertPartialText ──

  describe('handleExpertPartialText', () => {
    it('appends to existing streaming message', () => {
      const ctx = createMockCtx()
      const { handleExpertPartialText } = createAgentEventHandlers(ctx)

      // Seed an existing streaming message
      ctx.setAgentMessages(() => ({
        'eng-1': [{
          id: 's1',
          role: 'agent' as const,
          agentId: 'eng-1',
          content: 'Hello ',
          timestamp: Date.now(),
          type: 'text' as const,
          streaming: true,
        }],
      }))

      handleExpertPartialText({ agentId: 'eng-1', chatId: 'chat-1', sessionId: 's1', blockIndex: 0, text: 'world' })
      vi.runAllTimers() // partial text is coalesced and flushed on a 16ms timer

      expect(ctx._agentMessages['eng-1'][0].content).toBe('Hello world')
    })

    it('creates new streaming message when none exists', () => {
      const ctx = createMockCtx()
      const { handleExpertPartialText } = createAgentEventHandlers(ctx)

      handleExpertPartialText({ agentId: 'eng-1', chatId: 'chat-1', sessionId: 's1', blockIndex: 0, text: 'First chunk' })
      vi.runAllTimers() // partial text is coalesced and flushed on a 16ms timer

      expect(ctx._agentMessages['eng-1']).toHaveLength(1)
      expect(ctx._agentMessages['eng-1'][0].content).toBe('First chunk')
      expect(ctx._agentMessages['eng-1'][0].streaming).toBe(true)
    })

    it('skips when delta buffer has pending messages (delta wins)', () => {
      const ctx = createMockCtx()
      const { onExpertStructuredMessage, handleExpertPartialText } = createAgentEventHandlers(ctx)

      // Queue a delta first
      onExpertStructuredMessage({
        agentId: 'eng-1',
        sessionId: 's1',
        chatId: 'chat-1',
        type: 'delta',
        messages: [{ id: 'd1', role: 'agent', content: 'delta msg', timestamp: Date.now() }],
      })

      // partialText should be skipped because delta buffer has messages
      handleExpertPartialText({ agentId: 'eng-1', chatId: 'chat-1', sessionId: 's1', blockIndex: 0, text: 'partial' })

      expect(ctx._agentMessages['eng-1']).toBeUndefined()
    })
  })

  // ── Delta buffer behavior ──

  describe('delta buffer behavior', () => {
    it('multiple agents delta buffers are independent', () => {
      const ctx = createMockCtx()
      const { onExpertStructuredMessage, flushDeltaBuffer } = createAgentEventHandlers(ctx)

      onExpertStructuredMessage({
        agentId: 'eng-1',
        sessionId: 's1',
        chatId: 'chat-1',
        type: 'delta',
        messages: [{ id: 'm1', role: 'agent', content: 'From eng-1', timestamp: 100 }],
      })
      onExpertStructuredMessage({
        agentId: 'eng-2',
        sessionId: 's2',
        chatId: 'chat-1',
        type: 'delta',
        messages: [{ id: 'm2', role: 'agent', content: 'From eng-2', timestamp: 200 }],
      })

      flushDeltaBuffer()

      expect(ctx._agentMessages['eng-1']).toHaveLength(1)
      expect(ctx._agentMessages['eng-1'][0].content).toBe('From eng-1')
      expect(ctx._agentMessages['eng-2']).toHaveLength(1)
      expect(ctx._agentMessages['eng-2'][0].content).toBe('From eng-2')
    })

    it('flushDeltaBuffer merges into agentMessages', () => {
      const ctx = createMockCtx()
      const { onExpertStructuredMessage, flushDeltaBuffer } = createAgentEventHandlers(ctx)

      // Seed existing messages
      ctx.setAgentMessages(() => ({
        'eng-1': [{ id: 'existing', role: 'agent' as const, content: 'Old', timestamp: 50, agentId: 'eng-1' }],
      }))

      // Add delta
      onExpertStructuredMessage({
        agentId: 'eng-1',
        sessionId: 's1',
        chatId: 'chat-1',
        type: 'delta',
        messages: [{ id: 'new', role: 'agent', content: 'New', timestamp: 100 }],
      })

      flushDeltaBuffer()

      expect(ctx._agentMessages['eng-1'].length).toBeGreaterThanOrEqual(2)
      expect(ctx._agentMessages['eng-1'][0].content).toBe('Old')
      expect(ctx._agentMessages['eng-1'][1].content).toBe('New')
    })
  })
})
