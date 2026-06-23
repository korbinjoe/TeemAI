import { describe, it, expect } from 'vitest'
import { handleCodexExecEvent } from '../terminal/CodexEventHandler'
import type { StreamParserState } from '../terminal/StreamJsonParser'

const makeState = (): StreamParserState => ({
  turnIndex: 0,
  currentBlocks: new Map(),
  messages: [],
  model: null,
  sessionId: null,
  currentApiCallId: null,
  messageSeq: 0,
  streamedApiCalls: new Set(),
  emittedTextSinceResult: false,
  codexUsage: null,
  codexBlockIndex: 0,
  idPrefix: 's-test',
})

describe('CodexEventHandler', () => {
  it('parses item.completed message with output_text blocks', () => {
    const state = makeState()
    const out = handleCodexExecEvent(
      {
        item: {
          id: 'm1',
          type: 'message',
          role: 'assistant',
          content: [
            { type: 'output_text', text: 'hello ' },
            { type: 'output_text', text: 'world' },
          ],
        },
      },
      'item.completed',
      state,
    )

    expect(out.newMessages).toHaveLength(1)
    expect(out.newMessages[0].type).toBe('text')
    expect(out.newMessages[0].content).toBe('hello world')
    expect(out.newMessages[0].role).toBe('agent')
  })
})
