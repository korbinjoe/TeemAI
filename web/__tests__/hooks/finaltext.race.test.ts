// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createExpertEventHandlers } from '../../hooks/useExpertEvents'
import type { AgentActivity, Message } from '../../types/chat'
import type { AgentMessagesMap } from '../../hooks/useAgentMessages'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn() } }))
vi.mock('@/i18n', () => ({ default: { t: (k: string) => k } }))

function createMockCtx(chatId = 'chat-1') {
  let activities: Record<string, AgentActivity> = {}
  let agentMessages: AgentMessagesMap = {}
  const setExpertActivities = ((u: any) => { activities = typeof u === 'function' ? u(activities) : u }) as any
  const setAgentMessages = ((u: any) => { agentMessages = typeof u === 'function' ? u(agentMessages) : u }) as any
  let idCounter = 0
  const ctx: any = {
    isCurrentChatEvent: (p?: { chatId?: string }) => p?.chatId === chatId,
    addSystemMessage: vi.fn(),
    uid: (prefix: string) => `${prefix}-${++idCounter}`,
    t: (k: string) => k,
    setExpertActivities, setAgentMessages,
    setLoading: vi.fn(), setThinking: vi.fn(),
    setAgentSlashCommands: vi.fn(), setAgentPlans: vi.fn(), setAgentModes: vi.fn(),
    setAgentAvailableCommands: vi.fn(), setAgentSessionInfo: vi.fn(),
    get _agentMessages() { return agentMessages },
  }
  return ctx
}

const FINAL = '已提交并推送。`86f6464..5130543`\n\n⚠️ 影响范围：startBridgeServer 等。完整说明见上方。'
const A = 'lead'

const textMsg = (ts: number, apiCallId?: string): Message =>
  ({ id: 'msg-12-0', role: 'agent', content: FINAL, timestamp: ts, type: 'text', apiCallId } as any)
const statsMsg = (ts: number): Message =>
  ({ id: 'stats-0', role: 'agent', content: '', timestamp: ts, type: 'stats', stats: { outputTokens: 50 } } as any)

const hasFinalText = (ctx: any) =>
  (ctx._agentMessages[A] ?? []).some((m: Message) => m.type === 'text' && (m.content || '').length > 50)

describe('final-text end-of-turn race', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('A: partial chunks → committed text delta → stats delta (committed present)', () => {
    const ctx = createMockCtx()
    const h = createExpertEventHandlers(ctx)
    // partial-text streams
    for (const c of ['已提交', '并推送', '。`86f6464']) {
      h.handleExpertPartialText({ agentId: A, chatId: 'chat-1', blockIndex: 0, text: c })
    }
    // committed text delta (assistant event + content_block_stop dup)
    h.onExpertStructuredMessage({ agentId: A, sessionId: 's', chatId: 'chat-1', type: 'delta', messages: [textMsg(1000, 'api-x')] })
    h.onExpertStructuredMessage({ agentId: A, sessionId: 's', chatId: 'chat-1', type: 'delta', messages: [textMsg(1000, 'api-x')] })
    // stats delta
    h.onExpertStructuredMessage({ agentId: A, sessionId: 's', chatId: 'chat-1', type: 'delta', messages: [statsMsg(1001)] })
    vi.runAllTimers()
    expect(hasFinalText(ctx)).toBe(true)
  })

  it('B: partial chunks flush FIRST, then committed text + stats', () => {
    const ctx = createMockCtx()
    const h = createExpertEventHandlers(ctx)
    for (const c of ['已提交', '并推送', '。`86f6464']) {
      h.handleExpertPartialText({ agentId: A, chatId: 'chat-1', blockIndex: 0, text: c })
    }
    vi.advanceTimersByTime(16) // partial flush fires → streaming bubble created
    h.onExpertStructuredMessage({ agentId: A, sessionId: 's', chatId: 'chat-1', type: 'delta', messages: [textMsg(1000, 'api-x')] })
    h.onExpertStructuredMessage({ agentId: A, sessionId: 's', chatId: 'chat-1', type: 'delta', messages: [statsMsg(1001)] })
    vi.runAllTimers()
    expect(hasFinalText(ctx)).toBe(true)
  })

  it('C: partial chunks buffered, then ONLY stats delta arrives (no committed text delta)', () => {
    const ctx = createMockCtx()
    const h = createExpertEventHandlers(ctx)
    // user watched the FULL final reply stream in via partial chunks
    for (let i = 0; i < FINAL.length; i += 20) {
      h.handleExpertPartialText({ agentId: A, chatId: 'chat-1', blockIndex: 0, text: FINAL.slice(i, i + 20) })
    }
    // stats-only delta arrives — must NOT erase the streamed text
    h.onExpertStructuredMessage({ agentId: A, sessionId: 's', chatId: 'chat-1', type: 'delta', messages: [statsMsg(1001)] })
    vi.runAllTimers()
    expect(hasFinalText(ctx)).toBe(true) // expect text to survive
  })
})
