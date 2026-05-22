import { describe, it, expect } from 'vitest'
import {
  parseNewLines,
  createParserState,
} from '../terminal/ConversationParser'
import type { ParsedMessage } from '../terminal/ConversationParser'

/**  state parseNewLines newMessages push  state */
function parse(lines: string[]): ParsedMessage[] {
  const state = createParserState()
  const { newMessages } = parseNewLines(lines, 0, state)
  state.messages.push(...newMessages)
  return state.messages
}

function userText(text: string, ts = '2024-01-01T00:00:00Z', uuid = 'u1'): string {
  return JSON.stringify({ type: 'user', uuid, timestamp: ts, message: { content: text } })
}

function userTextArray(
  blocks: Array<{ type: string; text?: string; tool_use_id?: string; content?: string; is_error?: boolean }>,
  ts = '2024-01-01T00:00:00Z',
  uuid = 'u2',
): string {
  return JSON.stringify({ type: 'user', uuid, timestamp: ts, message: { content: blocks } })
}

function assistantText(
  text: string,
  model = 'claude-3-5',
  msgId = 'msg1',
  ts = '2024-01-01T00:01:00Z',
  uuid = 'a1',
  stopReason?: string,
): string {
  return JSON.stringify({
    type: 'assistant', uuid, timestamp: ts,
    message: {
      id: msgId, model, stop_reason: stopReason,
      content: [{ type: 'text', text }],
    },
  })
}

function assistantToolUse(
  toolName: string,
  toolId: string,
  input: Record<string, unknown>,
  model = 'claude-3-5',
  msgId = 'msg2',
  ts = '2024-01-01T00:02:00Z',
  uuid = 'a2',
): string {
  return JSON.stringify({
    type: 'assistant', uuid, timestamp: ts,
    message: { id: msgId, model, content: [{ type: 'tool_use', id: toolId, name: toolName, input }] },
  })
}

function userToolResult(toolUseId: string, content: string, ts = '2024-01-01T00:03:00Z', uuid = 'u3'): string {
  return JSON.stringify({
    type: 'user', uuid, timestamp: ts,
    message: { content: [{ type: 'tool_result', tool_use_id: toolUseId, content }] },
  })
}

function assistantWithUsage(
  text: string,
  usage: { input_tokens: number; output_tokens: number },
  stopReason = 'end_turn',
  ts = '2024-01-01T00:04:00Z',
  uuid = 'a4',
): string {
  return JSON.stringify({
    type: 'assistant', uuid, timestamp: ts,
    message: {
      id: 'msg4', model: 'claude-3-5', stop_reason: stopReason, usage,
      content: [{ type: 'text', text }],
    },
  })
}

function assistantThinking(thinking: string, ts = '2024-01-01T00:00:30Z', uuid = 'a0'): string {
  return JSON.stringify({
    type: 'assistant', uuid, timestamp: ts,
    message: { id: 'msg0', model: 'claude-3-5', content: [{ type: 'thinking', thinking }] },
  })
}

function lastPrompt(ts = '2024-01-01T00:05:00Z'): string {
  return JSON.stringify({ type: 'last-prompt', timestamp: ts })
}

describe('parseNewLines (full parse)', () => {
  it('empty input returns empty message list', () => {
    expect(parse([])).toHaveLength(0)
  })

  it('ignores invalid JSON lines and empty lines', () => {
    expect(parse(['not-json', '', '  '])).toHaveLength(0)
  })

  it('Parse user string content', () => {
    const messages = parse([userText('hello')])
    expect(messages).toHaveLength(1)
    expect(messages[0].type).toBe('text')
    expect(messages[0].role).toBe('user')
    expect(messages[0].content).toBe('hello')
    expect(messages[0].turnIndex).toBe(0)
  })

  it('Parse assistant text response', () => {
    const messages = parse([
      userText('hi'),
      assistantText('world', 'claude-3-5', 'msg1'),
    ])
    const agentMsg = messages.find((m) => m.role === 'agent' && m.type === 'text')
    expect(agentMsg).toBeDefined()
    expect(agentMsg!.content).toBe('world')
    expect(agentMsg!.model).toBe('claude-3-5')
    expect(agentMsg!.turnIndex).toBe(0)
  })

  it('multi-turn: each user text starts new turnIndex', () => {
    const messages = parse([
      userText('turn0', '2024-01-01T00:00:00Z', 'u1'),
      assistantText('reply0', 'c', 'm1', '2024-01-01T00:01:00Z', 'a1'),
      userText('turn1', '2024-01-01T00:02:00Z', 'u2'),
      assistantText('reply1', 'c', 'm2', '2024-01-01T00:03:00Z', 'a2'),
    ])
    const userMsgs = messages.filter((m) => m.role === 'user')
    expect(userMsgs).toHaveLength(2)
    expect(userMsgs[0].turnIndex).toBe(0)
    expect(userMsgs[1].turnIndex).toBe(1)
  })

  it('Parse toolUse Message', () => {
    const messages = parse([
      userText('do something'),
      assistantToolUse('Bash', 'tool-1', { command: 'ls' }),
    ])
    const toolMsg = messages.find((m) => m.type === 'toolUse')
    expect(toolMsg).toBeDefined()
    expect(toolMsg!.toolUse?.toolName).toBe('Bash')
    expect(toolMsg!.toolUse?.toolId).toBe('tool-1')
    expect(JSON.parse(toolMsg!.toolUse!.input)).toEqual({ command: 'ls' })
  })

  it('toolResult follows corresponding toolUse (reorder)', () => {
    const messages = parse([
      userText('task'),
      assistantToolUse('Read', 'tid-1', { file_path: 'foo.ts' }),
      userToolResult('tid-1', 'file content here'),
    ])
    const toolUseIdx = messages.findIndex((m) => m.type === 'toolUse')
    const toolResultIdx = messages.findIndex((m) => m.type === 'toolResult')
    expect(toolUseIdx).toBeGreaterThanOrEqual(0)
    expect(toolResultIdx).toBe(toolUseIdx + 1)
  })

  it('parses thinking block, truncates beyond 200 chars', () => {
    const messages = parse([
      userText('think'),
      assistantThinking('a'.repeat(300)),
    ])
    const thinkMsg = messages.find((m) => m.type === 'thinking')
    expect(thinkMsg).toBeDefined()
    expect(thinkMsg!.thinkingSummary?.length).toBeLessThanOrEqual(203) // 200 + '…'
    expect(thinkMsg!.thinkingSummary?.endsWith('…')).toBe(true)
  })

  it('inserts stats message on isTurnEnd', () => {
    const messages = parse([
      userText('go'),
      assistantWithUsage('done', { input_tokens: 100, output_tokens: 50 }, 'end_turn'),
    ])
    const statMsg = messages.find((m) => m.type === 'stats')
    expect(statMsg).toBeDefined()
    expect(statMsg!.isTurnEnd).toBe(true)
    expect(statMsg!.stats?.inputTokens).toBe(100)
    expect(statMsg!.stats?.outputTokens).toBe(50)
  })

  it('non end_turn does not insert stats', () => {
    const messages = parse([
      userText('go'),
      assistantText('partial', 'm', 'msg1', '2024-01-01T00:00:00Z', 'a1', 'tool_use'),
    ])
    const statMsg = messages.find((m) => m.type === 'stats')
    expect(statMsg).toBeUndefined()
  })

  it('last-prompt marks current turn as ended and inserts stats', () => {
    const messages = parse([
      userText('cmd'),
      assistantText('ok'),
      lastPrompt(),
    ])
    const statMsg = messages.find((m) => m.type === 'stats')
    expect(statMsg).toBeDefined()
    expect(statMsg!.isTurnEnd).toBe(true)
  })

  it('user array content: text block starts new turn', () => {
    const messages = parse([
      userTextArray([{ type: 'text', text: 'array hello' }]),
    ])
    const userMsg = messages.find((m) => m.role === 'user')
    expect(userMsg?.content).toBe('array hello')
  })

  it('user array content: tool_result block parsed as toolResult message', () => {
    const messages = parse([
      userText('base'),
      assistantToolUse('Bash', 'tr-1', { command: 'echo hi' }),
      userTextArray([{ type: 'tool_result', tool_use_id: 'tr-1', content: 'hi' }]),
    ])
    const tr = messages.find((m) => m.type === 'toolResult')
    expect(tr?.toolResult?.toolUseId).toBe('tr-1')
    expect(tr?.toolResult?.content).toBe('hi')
  })

  it('apiCallId aligns with message.id', () => {
    const messages = parse([
      userText('q'),
      assistantText('ans', 'c', 'call-id-123'),
    ])
    const agentMsg = messages.find((m) => m.role === 'agent' && m.type === 'text')
    expect(agentMsg?.apiCallId).toBe('call-id-123')
  })
})

describe('parseNewLines (incremental parse)', () => {
  it('First call linesProcessed equals line count', () => {
    const state = createParserState()
    const lines = [userText('hello')]
    const { newMessages } = parseNewLines(lines, 0, state)
    expect(state.linesProcessed).toBe(1)
    expect(newMessages.length).toBeGreaterThan(0)
    state.messages.push(...newMessages)
  })

  it('Second call only parses new lines', () => {
    const state = createParserState()
    const lines = [userText('msg1')]
    const r1 = parseNewLines(lines, 0, state)
    state.messages.push(...r1.newMessages)

    const allLines = [...lines, assistantText('reply1')]
    const r2 = parseNewLines(allLines, state.linesProcessed, state)
    state.messages.push(...r2.newMessages)

    expect(r2.newMessages.some((m) => m.content === 'reply1')).toBe(true)
    expect(state.linesProcessed).toBe(2)
  })

  it('replacedStatsId points to old stats when new message arrives in same turn', () => {
    const state = createParserState()
    // batch1: user + end_turn assistant（Generate stats）
    const batch1 = [
      userText('q'),
      assistantWithUsage('first reply', { input_tokens: 10, output_tokens: 5 }, 'end_turn'),
    ]
    const r1 = parseNewLines(batch1, 0, state)
    state.messages.push(...r1.newMessages)

    const statsId = state.messages.find((m) => m.type === 'stats')?.id
    expect(statsId).toBeDefined()

    const moreAgentLine = assistantText(
      'second chunk', 'claude-3-5', 'msg5', '2024-01-01T00:02:00Z', 'a5',
    )
    const allLines = [...batch1, moreAgentLine]
    const r2 = parseNewLines(allLines, state.linesProcessed, state)
    expect(r2.replacedStatsId).toBe(statsId)
  })

  it('incremental message ID based on line number: deterministic and unique', () => {
    const state = createParserState()
    const lines = [
      userText('a', '2024-01-01T00:00:00Z', 'u1'),
      userText('b', '2024-01-01T00:01:00Z', 'u2'),
    ]
    const { newMessages } = parseNewLines(lines, 0, state)
    const ids = newMessages.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
