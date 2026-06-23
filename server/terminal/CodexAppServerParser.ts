/**
 * CodexAppServerParser - maps `codex app-server` JSON-RPC notifications to
 * ParsedMessage[] / partialText, mirroring StreamJsonHandlers (Claude) for UI
 * parity: agent text streams live via partialText; thinking + tools render only
 * at item/completed. Unlike `exec --json`, app-server is camelCase and emits
 * token-level deltas.
 */

import type { ParsedMessage, ParsedStats } from './ConversationParser'
import type { StreamParserState, ParseLineResult } from './StreamJsonParser'
import { createLogger } from '../lib/logger'

const log = createLogger('CodexAppServerParser')

const stableId = (prefix: string, seq: number) => `${prefix}-${seq}`

const clamp = (s: string, max: number) => (s.length > max ? s.slice(0, max) + '…' : s)

export const handleAppServerNotification = (
  method: string,
  params: any,
  state: StreamParserState,
): ParseLineResult => {
  const ts = Date.now()
  const currentTurn = Math.max(state.turnIndex, 0)

  switch (method) {
    case 'turn/started': {
      state.turnIndex++
      state.codexUsage = null
      return { newMessages: [] }
    }

    case 'item/agentMessage/delta': {
      const delta = params?.delta
      if (typeof delta !== 'string' || !delta) return { newMessages: [] }
      return { newMessages: [], partialText: { blockIndex: state.codexBlockIndex, text: delta } }
    }

    case 'item/completed': {
      const item = params?.item
      if (!item) return { newMessages: [] }
      const newMessages = mapCompletedItem(item, state, ts, currentTurn)
      state.messages.push(...newMessages)
      return { newMessages }
    }

    case 'thread/tokenUsage/updated': {
      const last = params?.tokenUsage?.last
      if (last) {
        state.codexUsage = {
          input: last.inputTokens || 0,
          output: last.outputTokens || 0,
        }
      }
      return { newMessages: [] }
    }

    case 'turn/completed': {
      const stats: ParsedStats = {}
      if (state.codexUsage) {
        stats.inputTokens = state.codexUsage.input
        stats.outputTokens = state.codexUsage.output
      }
      const statsMsg: ParsedMessage = {
        id: `stats-${state.idPrefix}-${currentTurn}`, role: 'agent', content: '',
        timestamp: ts, type: 'stats', stats, turnIndex: currentTurn, isTurnEnd: true,
      }
      state.messages.push(statsMsg)
      return { newMessages: [statsMsg] }
    }

    case 'error': {
      const errorText = params?.error?.message || 'Unknown error'
      const willRetry = params?.willRetry === true
      const errorMsg: ParsedMessage = {
        id: stableId(state.idPrefix, state.messageSeq++), role: 'agent', content: `Error: ${errorText}`,
        timestamp: ts, type: 'text', turnIndex: currentTurn,
      }
      state.messages.push(errorMsg)
      if (willRetry) return { newMessages: [errorMsg] }
      const statsMsg: ParsedMessage = {
        id: `stats-${state.idPrefix}-${currentTurn}`, role: 'agent', content: '',
        timestamp: ts, type: 'stats', turnIndex: currentTurn, isTurnEnd: true,
      }
      state.messages.push(statsMsg)
      return { newMessages: [errorMsg, statsMsg] }
    }

    default:
      return { newMessages: [] }
  }
}

const mapCompletedItem = (
  item: any,
  state: StreamParserState,
  ts: number,
  currentTurn: number,
): ParsedMessage[] => {
  const newMessages: ParsedMessage[] = []
  const itemType = item.type as string
  const itemId = (item.id as string | undefined) || stableId(state.idPrefix, state.messageSeq)

  if (itemType === 'agentMessage') {
    const text = typeof item.text === 'string' ? item.text : ''
    if (text) {
      newMessages.push({
        id: stableId(state.idPrefix, state.messageSeq++), role: 'agent', content: text,
        timestamp: ts, type: 'text', turnIndex: currentTurn,
      })
    }
    // Advance the streaming block so the next agent message streams into a fresh
    // bubble; the value itself is cosmetic (frontend coalesces partialText per agent).
    state.codexBlockIndex++
  } else if (itemType === 'reasoning') {
    const summary = Array.isArray(item.summary) ? item.summary.join('\n').trim() : ''
    const content = Array.isArray(item.content) ? item.content.join('\n').trim() : ''
    const thinking = summary || content
    if (thinking) {
      newMessages.push({
        id: stableId(state.idPrefix, state.messageSeq++), role: 'agent', content: '',
        timestamp: ts, type: 'thinking', thinkingSummary: clamp(thinking, 500),
        turnIndex: currentTurn,
      })
    }
  } else if (itemType === 'commandExecution') {
    const command = (item.command as string | undefined) || ''
    const output = (item.aggregatedOutput as string | undefined) || ''
    const exitCode = item.exitCode as number | null | undefined
    newMessages.push({
      id: stableId(state.idPrefix, state.messageSeq++), role: 'agent', content: '',
      timestamp: ts, type: 'toolUse',
      toolUse: { toolName: 'Bash', toolId: itemId, input: JSON.stringify({ command }), status: 'completed' },
      turnIndex: currentTurn,
    })
    newMessages.push({
      id: stableId(state.idPrefix, state.messageSeq++), role: 'agent', content: '',
      timestamp: ts, type: 'toolResult',
      toolResult: {
        toolUseId: itemId, content: clamp(output, 2000),
        isError: typeof exitCode === 'number' && exitCode !== 0,
      },
      turnIndex: currentTurn,
    })
  } else if (itemType === 'fileChange') {
    const changes = Array.isArray(item.changes) ? item.changes : []
    const kindOf = (c: any): string => (typeof c?.kind === 'string' ? c.kind : c?.kind?.type) || 'change'
    const kinds = new Set(changes.map(kindOf))
    const toolName = kinds.has('add') && !kinds.has('update') && !kinds.has('delete') ? 'Write' : 'Edit'
    newMessages.push({
      id: stableId(state.idPrefix, state.messageSeq++), role: 'agent', content: '',
      timestamp: ts, type: 'toolUse',
      toolUse: { toolName, toolId: itemId, input: JSON.stringify({ changes }), status: 'completed' },
      turnIndex: currentTurn,
    })
    const summary = changes
      .map((c: any) => `${kindOf(c)} ${c?.path || ''}`.trim())
      .filter(Boolean).join('\n')
    newMessages.push({
      id: stableId(state.idPrefix, state.messageSeq++), role: 'agent', content: '',
      timestamp: ts, type: 'toolResult',
      toolResult: { toolUseId: itemId, content: summary || 'file change completed', isError: item.status === 'failed' },
      turnIndex: currentTurn,
    })
  } else if (itemType === 'mcpToolCall') {
    const toolName = `${item.server || 'mcp'}.${item.tool || 'call'}`
    const args = item.arguments ?? {}
    newMessages.push({
      id: stableId(state.idPrefix, state.messageSeq++), role: 'agent', content: '',
      timestamp: ts, type: 'toolUse',
      toolUse: { toolName, toolId: itemId, input: typeof args === 'string' ? args : JSON.stringify(args), status: 'completed' },
      turnIndex: currentTurn,
    })
    const result = item.result ?? item.error ?? ''
    const resultStr = typeof result === 'string' ? result : JSON.stringify(result)
    newMessages.push({
      id: stableId(state.idPrefix, state.messageSeq++), role: 'agent', content: '',
      timestamp: ts, type: 'toolResult',
      toolResult: { toolUseId: itemId, content: clamp(resultStr, 2000), isError: item.status === 'failed' || item.error != null },
      turnIndex: currentTurn,
    })
  } else if (itemType === 'webSearch') {
    const query = (item.query as string | undefined) || ''
    newMessages.push({
      id: stableId(state.idPrefix, state.messageSeq++), role: 'agent', content: '',
      timestamp: ts, type: 'toolUse',
      toolUse: { toolName: 'WebSearch', toolId: itemId, input: JSON.stringify({ query }), status: 'completed' },
      turnIndex: currentTurn,
    })
  } else if (itemType === 'plan') {
    const text = (item.text as string | undefined) || ''
    if (text) {
      newMessages.push({
        id: stableId(state.idPrefix, state.messageSeq++), role: 'agent', content: '',
        timestamp: ts, type: 'toolUse',
        toolUse: { toolName: 'TodoWrite', toolId: itemId, input: JSON.stringify({ plan: text }), status: 'completed' },
        turnIndex: currentTurn,
      })
    }
  } else if (itemType === 'userMessage' || itemType === 'hookPrompt') {
    // Echoed input / hook fragments — not rendered as agent output.
  } else {
    log.debug('Codex app-server unknown item.type', { itemType })
  }

  return newMessages
}
