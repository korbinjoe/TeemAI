/**
 * StreamJsonHandlers - stream-json
 *
 *  StreamJsonParser system / assistant / stream_event / user / result
 *  tool  id
 */

import type { ParsedMessage, ParsedStats } from './ConversationParser'
import type { ParseLineResult, StreamParserState } from './StreamJsonParser'
import { createLogger } from '../lib/logger'

const log = createLogger('StreamJsonHandlers')

export interface PartialBlock {
  index: number
  type: 'text' | 'tool_use' | 'thinking'
  text: string
  toolName?: string
  toolId?: string
  inputJson?: string
}

export const stableId = (prefix: string, seq: number) => `${prefix}-${seq}`

// ── system Event ──

export const handleSystemEvent = (
  data: any,
  state: StreamParserState,
): ParseLineResult => {
  const subtype = data.subtype as string
  if (subtype === 'init') {
    state.sessionId = data.session_id || null
    state.turnIndex++
    state.currentBlocks.clear()
    state.currentApiCallId = null
    state.streamedApiCalls.clear()
    state.emittedTextSinceResult = false
    log.debug('System init', { sessionId: state.sessionId, turn: state.turnIndex })
  }
  return {
    newMessages: [],
    systemEvent: {
      subtype,
      sessionId: data.session_id,
      model: data.model,
      tools: data.tools,
      slashCommands: data.slash_commands,
    },
  }
}

export const handleAssistantEvent = (
  data: any,
  state: StreamParserState,
): ParseLineResult => {
  const msg = data.message
  if (!msg) return { newMessages: [] }

  const model = msg.model as string | undefined
  if (model) state.model = model

  const apiCallId = msg.id as string | undefined

  // Skip only if THIS api call was already streamed via stream_event. The old
  // per-turn boolean discarded authoritative `assistant` messages that were
  // never streamed — the root cause of missing messages.
  if (apiCallId && state.streamedApiCalls.has(apiCallId)) {
    return { newMessages: [] }
  }

  const ts = Date.now()
  const blocks = Array.isArray(msg.content) ? msg.content : []
  const currentTurn = Math.max(state.turnIndex, 0)

  const newMessages: ParsedMessage[] = []

  for (const block of blocks) {
    if (block.type === 'text' && block.text) {
      newMessages.push({
        id: stableId(state.idPrefix, state.messageSeq++),
        role: 'agent',
        content: block.text,
        timestamp: ts,
        type: 'text',
        model,
        turnIndex: currentTurn,
        apiCallId,
      })
    } else if (block.type === 'tool_use') {
      const inputStr = typeof block.input === 'string' ? block.input : JSON.stringify(block.input)
      newMessages.push({
        id: stableId(state.idPrefix, state.messageSeq++),
        role: 'agent',
        content: '',
        timestamp: ts,
        type: 'toolUse',
        toolUse: {
          toolName: block.name || 'unknown',
          toolId: block.id || stableId(state.idPrefix, state.messageSeq),
          input: inputStr,
          status: 'completed',
        },
        model,
        turnIndex: currentTurn,
        apiCallId,
      })
    } else if (block.type === 'tool_result') {
      const resultContent = typeof block.content === 'string'
        ? block.content
        : Array.isArray(block.content)
          ? block.content.map((c: any) => c.text || '').join('\n')
          : JSON.stringify(block.content)

      newMessages.push({
        id: stableId(state.idPrefix, state.messageSeq++),
        role: 'agent',
        content: '',
        timestamp: ts,
        type: 'toolResult',
        toolResult: {
          toolUseId: block.tool_use_id || '',
          content: resultContent.length > 2000
            ? resultContent.slice(0, 2000) + '...'
            : resultContent,
          isError: block.is_error === true,
        },
        turnIndex: currentTurn,
      })
    } else if (block.type === 'thinking' && block.thinking) {
      const thinking = block.thinking as string
      newMessages.push({
        id: stableId(state.idPrefix, state.messageSeq++),
        role: 'agent',
        content: '',
        timestamp: ts,
        type: 'thinking',
        thinkingSummary: thinking.length > 200 ? thinking.slice(0, 200) + '...' : thinking,
        model,
        turnIndex: currentTurn,
        apiCallId,
      })
    }
  }

  const reordered = reorderToolMessages(newMessages)
  state.messages.push(...reordered)

  if (reordered.length > 0) {
    if (apiCallId) state.streamedApiCalls.add(apiCallId)
    if (reordered.some((m) => m.type === 'text')) state.emittedTextSinceResult = true
  }

  return { newMessages: reordered }
}

export const handleStreamEvent = (
  data: any,
  state: StreamParserState,
): ParseLineResult => {
  const event = data.event
  if (!event) return { newMessages: [] }

  const eventType = event.type as string

  switch (eventType) {
    case 'message_start': {
      const msg = event.message
      if (msg?.model) state.model = msg.model
      if (msg?.id) state.currentApiCallId = msg.id
      return { newMessages: [] }
    }

    case 'content_block_start': {
      const idx = event.index as number
      const block = event.content_block || {}
      const blockType = block.type as string

      if (blockType === 'text' || blockType === 'thinking') {
        state.currentBlocks.set(idx, {
          index: idx,
          type: blockType,
          text: block.text || '',
        })
      } else if (blockType === 'tool_use') {
        state.currentBlocks.set(idx, {
          index: idx,
          type: 'tool_use',
          text: '',
          toolName: block.name || 'unknown',
          toolId: block.id || '',
          inputJson: '',
        })
      }
      return { newMessages: [] }
    }

    case 'content_block_delta': {
      const idx = event.index as number
      const delta = event.delta || {}
      const deltaType = delta.type as string
      const partial = state.currentBlocks.get(idx)

      if (deltaType === 'text_delta' && delta.text) {
        if (partial) partial.text += delta.text
        return {
          newMessages: [],
          partialText: { blockIndex: idx, text: delta.text },
        }
      }

      if (deltaType === 'thinking_delta' && delta.thinking) {
        if (partial) partial.text += delta.thinking
      }

      if (deltaType === 'input_json_delta' && delta.partial_json) {
        if (partial) partial.inputJson = (partial.inputJson || '') + delta.partial_json
      }

      return { newMessages: [] }
    }

    case 'content_block_stop': {
      const idx = event.index as number
      const partial = state.currentBlocks.get(idx)
      if (!partial) return { newMessages: [] }

      state.currentBlocks.delete(idx)

      const currentTurn = Math.max(state.turnIndex, 0)
      const ts = Date.now()
      const newMessages: ParsedMessage[] = []

      if (partial.type === 'text' && partial.text) {
        newMessages.push({
          id: stableId(state.idPrefix, state.messageSeq++),
          role: 'agent',
          content: partial.text,
          timestamp: ts,
          type: 'text',
          model: state.model || undefined,
          turnIndex: currentTurn,
          apiCallId: state.currentApiCallId || undefined,
        })
      } else if (partial.type === 'tool_use') {
        newMessages.push({
          id: stableId(state.idPrefix, state.messageSeq++),
          role: 'agent',
          content: '',
          timestamp: ts,
          type: 'toolUse',
          toolUse: {
            toolName: partial.toolName || 'unknown',
            toolId: partial.toolId || stableId(state.idPrefix, state.messageSeq),
            input: partial.inputJson || '{}',
            status: 'completed',
          },
          model: state.model || undefined,
          turnIndex: currentTurn,
          apiCallId: state.currentApiCallId || undefined,
        })
      } else if (partial.type === 'thinking' && partial.text) {
        newMessages.push({
          id: stableId(state.idPrefix, state.messageSeq++),
          role: 'agent',
          content: '',
          timestamp: ts,
          type: 'thinking',
          thinkingSummary: partial.text.length > 200
            ? partial.text.slice(0, 200) + '...'
            : partial.text,
          model: state.model || undefined,
          turnIndex: currentTurn,
          apiCallId: state.currentApiCallId || undefined,
        })
      }

      state.messages.push(...newMessages)
      if (newMessages.length > 0) {
        if (state.currentApiCallId) state.streamedApiCalls.add(state.currentApiCallId)
        if (newMessages.some((m) => m.type === 'text')) state.emittedTextSinceResult = true
      }
      return { newMessages }
    }

    case 'message_delta':
    case 'message_stop':
    default:
      return { newMessages: [] }
  }
}

export const handleUserEvent = (
  data: any,
  state: StreamParserState,
): ParseLineResult => {
  const msg = data.message
  if (!msg) return { newMessages: [] }

  const blocks = Array.isArray(msg.content) ? msg.content : []
  if (blocks.length === 0) return { newMessages: [] }

  const currentTurn = Math.max(state.turnIndex, 0)
  const ts = Date.now()
  const newMessages: ParsedMessage[] = []

  for (const block of blocks) {
    if (block.type === 'tool_result' && block.tool_use_id) {
      const resultContent = typeof block.content === 'string'
        ? block.content
        : Array.isArray(block.content)
          ? block.content.map((c: any) => c.text || '').join('\n')
          : JSON.stringify(block.content)

      newMessages.push({
        id: stableId(state.idPrefix, state.messageSeq++),
        role: 'agent',
        content: '',
        timestamp: ts,
        type: 'toolResult',
        toolResult: {
          toolUseId: block.tool_use_id,
          content: resultContent.length > 2000
            ? resultContent.slice(0, 2000) + '...'
            : resultContent,
          isError: block.is_error === true,
        },
        turnIndex: currentTurn,
      })
    }
  }

  state.messages.push(...newMessages)
  return { newMessages }
}

export const handleResultEvent = (
  data: any,
  state: StreamParserState,
): ParseLineResult => {
  const currentTurn = Math.max(state.turnIndex, 0)
  const ts = Date.now()
  const newMessages: ParsedMessage[] = []

  const resultText = data.result as string | undefined
  if (resultText && !state.emittedTextSinceResult) {
    const textMsg: ParsedMessage = {
      id: stableId(state.idPrefix, state.messageSeq++),
      role: 'agent',
      content: resultText,
      timestamp: ts,
      type: 'text',
      model: state.model || undefined,
      turnIndex: currentTurn,
    }
    newMessages.push(textMsg)
    state.messages.push(textMsg)
  }

  const stats: ParsedStats = {}

  if (data.total_cost_usd != null) stats.costUsd = data.total_cost_usd
  if (data.num_turns != null) stats.numTurns = data.num_turns

  const usage = data.usage
  if (usage) {
    stats.inputTokens = usage.input_tokens || 0
    stats.outputTokens = usage.output_tokens || 0
    stats.cacheReadInputTokens = usage.cache_read_input_tokens || 0
    stats.cacheCreationInputTokens = usage.cache_creation_input_tokens || 0
  }

  const statsMsg: ParsedMessage = {
    id: `stats-${state.idPrefix}-${currentTurn}`,
    role: 'agent',
    content: '',
    timestamp: ts,
    type: 'stats',
    stats,
    model: state.model || undefined,
    turnIndex: currentTurn,
    // The stream-json `result` event IS the per-turn boundary and carries no
    // stop_reason field (only subtype/is_error/usage/...). Persistent claude
    // sessions never exit between turns, so this stats message is the only
    // terminal signal the ActivityDeriver gets — mirror codex's turn.completed.
    isTurnEnd: true,
  }

  newMessages.push(statsMsg)
  state.messages.push(statsMsg)

  // `result` is the per-turn boundary for persistent claude sessions. Reset
  // per-call dedup so the next turn starts clean.
  state.streamedApiCalls.clear()
  state.emittedTextSinceResult = false

  return { newMessages }
}

const reorderToolMessages = (messages: ParsedMessage[]): ParsedMessage[] => {
  if (messages.length <= 1) return messages

  const resultMap = new Map<string, ParsedMessage>()
  const usedResults = new Set<string>()

  for (const msg of messages) {
    if (msg.type === 'toolResult' && msg.toolResult) {
      resultMap.set(msg.toolResult.toolUseId, msg)
    }
  }

  if (resultMap.size === 0) return messages

  const reordered: ParsedMessage[] = []
  for (const msg of messages) {
    if (msg.type === 'toolResult') continue
    reordered.push(msg)
    if (msg.type === 'toolUse' && msg.toolUse) {
      const tr = resultMap.get(msg.toolUse.toolId)
      if (tr) {
        reordered.push(tr)
        usedResults.add(msg.toolUse.toolId)
      }
    }
  }

  for (const msg of messages) {
    if (msg.type === 'toolResult' && msg.toolResult && !usedResults.has(msg.toolResult.toolUseId)) {
      reordered.push(msg)
    }
  }

  return reordered
}
