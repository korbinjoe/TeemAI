import { describe, it, expect } from 'vitest'
import { handleAppServerNotification } from '../terminal/CodexAppServerParser'
import { createStreamParserState, type StreamParserState } from '../terminal/StreamJsonParser'

const makeState = (): StreamParserState => {
  const state = createStreamParserState()
  state.idPrefix = 's-test'
  return state
}

describe('CodexAppServerParser', () => {
  it('streams agent message deltas as partialText without emitting messages', () => {
    const state = makeState()
    const a = handleAppServerNotification('item/agentMessage/delta', { delta: 'hel' }, state)
    const b = handleAppServerNotification('item/agentMessage/delta', { delta: 'lo' }, state)

    expect(a.newMessages).toHaveLength(0)
    expect(a.partialText).toEqual({ blockIndex: 0, text: 'hel' })
    expect(b.partialText).toEqual({ blockIndex: 0, text: 'lo' })
  })

  it('emits a text message and advances the block on agentMessage completion', () => {
    const state = makeState()
    const out = handleAppServerNotification(
      'item/completed',
      { item: { id: 'm1', type: 'agentMessage', text: 'hello world' } },
      state,
    )

    expect(out.newMessages).toHaveLength(1)
    expect(out.newMessages[0].type).toBe('text')
    expect(out.newMessages[0].content).toBe('hello world')
    expect(state.codexBlockIndex).toBe(1)
  })

  it('maps commandExecution to a Bash toolUse + toolResult pair', () => {
    const state = makeState()
    const out = handleAppServerNotification(
      'item/completed',
      { item: { id: 'c1', type: 'commandExecution', command: 'ls', aggregatedOutput: 'a\nb', exitCode: 0 } },
      state,
    )

    expect(out.newMessages).toHaveLength(2)
    expect(out.newMessages[0].type).toBe('toolUse')
    expect(out.newMessages[0].toolUse?.toolName).toBe('Bash')
    expect(out.newMessages[1].type).toBe('toolResult')
    expect(out.newMessages[1].toolResult?.isError).toBe(false)
  })

  it('flags a non-zero exit code as an error result', () => {
    const state = makeState()
    const out = handleAppServerNotification(
      'item/completed',
      { item: { id: 'c2', type: 'commandExecution', command: 'false', aggregatedOutput: '', exitCode: 1 } },
      state,
    )
    expect(out.newMessages[1].toolResult?.isError).toBe(true)
  })

  it('chooses Write when every file change is an add, else Edit', () => {
    const writeState = makeState()
    const writeOut = handleAppServerNotification(
      'item/completed',
      { item: { id: 'f1', type: 'fileChange', status: 'completed', changes: [{ path: 'a.ts', kind: { type: 'add' } }] } },
      writeState,
    )
    expect(writeOut.newMessages[0].toolUse?.toolName).toBe('Write')

    const editState = makeState()
    const editOut = handleAppServerNotification(
      'item/completed',
      { item: { id: 'f2', type: 'fileChange', status: 'completed', changes: [{ path: 'a.ts', kind: { type: 'update' } }] } },
      editState,
    )
    expect(editOut.newMessages[0].toolUse?.toolName).toBe('Edit')
  })

  it('increments turnIndex and resets usage on turn start', () => {
    const state = makeState()
    handleAppServerNotification('turn/started', { turn: {} }, state)
    expect(state.turnIndex).toBe(0)
    expect(state.codexUsage).toBeNull()
  })

  it('emits an isTurnEnd stats message carrying token usage on turn completion', () => {
    const state = makeState()
    handleAppServerNotification('turn/started', { turn: {} }, state)
    handleAppServerNotification(
      'thread/tokenUsage/updated',
      { tokenUsage: { last: { inputTokens: 12, outputTokens: 34 } } },
      state,
    )
    const out = handleAppServerNotification('turn/completed', { turn: {} }, state)

    expect(out.newMessages).toHaveLength(1)
    const stats = out.newMessages[0]
    expect(stats.type).toBe('stats')
    expect(stats.isTurnEnd).toBe(true)
    expect(stats.stats?.inputTokens).toBe(12)
    expect(stats.stats?.outputTokens).toBe(34)
  })

  it('emits an error message and closes the turn when the error is non-retryable', () => {
    const state = makeState()
    const out = handleAppServerNotification(
      'error',
      { error: { message: 'boom' }, willRetry: false },
      state,
    )
    expect(out.newMessages).toHaveLength(2)
    expect(out.newMessages[0].content).toContain('boom')
    expect(out.newMessages[1].type).toBe('stats')
    expect(out.newMessages[1].isTurnEnd).toBe(true)
  })

  it('does not close the turn for retryable errors', () => {
    const state = makeState()
    const out = handleAppServerNotification(
      'error',
      { error: { message: 'transient' }, willRetry: true },
      state,
    )
    expect(out.newMessages).toHaveLength(1)
    expect(out.newMessages[0].type).toBe('text')
  })
})
