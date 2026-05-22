/**
 * StreamJsonParser - stream-json stdout  → ParsedMessage
 *
 *  Claude Code CLI `--print --output-format stream-json --include-partial-messages`
 *  stdout JSON  ParsedMessage
 *
 * P0
 * - type: system        — init / hook
 * - type: assistant     —  assistant  content blocks
 * - type: stream_event  — --include-partial-messages
 * - type: result        —  usage/cost
 *
 *  StreamJsonHandlers.ts state
 */

import type { ParsedMessage } from './ConversationParser'
import { createLogger } from '../lib/logger'
import { handleCodexExecEvent } from './CodexEventHandler'
import {
  handleSystemEvent,
  handleAssistantEvent,
  handleStreamEvent,
  handleUserEvent,
  handleResultEvent,
  type PartialBlock,
} from './StreamJsonHandlers'

const log = createLogger('StreamJsonParser')

let lastParseWarnAt = 0
let suppressedSinceLastWarn = 0
const PARSE_WARN_INTERVAL_MS = 60_000

export interface StreamParserState {
  turnIndex: number
  currentBlocks: Map<number, PartialBlock>
  messages: ParsedMessage[]
  model: string | null
  sessionId: string | null
  /**  assistant message id apiCallId */
  currentApiCallId: string | null
  messageSeq: number
  /**  stream_event  assistant  */
  streamedCurrentTurn: boolean
  codexUsage: { input: number; output: number } | null
}

export interface ParseLineResult {
  newMessages: ParsedMessage[]
  partialText?: { blockIndex: number; text: string }
  systemEvent?: { subtype: string; sessionId?: string; [key: string]: unknown }
}

export const createStreamParserState = (): StreamParserState => ({
  turnIndex: -1,
  currentBlocks: new Map(),
  messages: [],
  model: null,
  sessionId: null,
  currentApiCallId: null,
  messageSeq: 0,
  streamedCurrentTurn: false,
  codexUsage: null,
})

export const parseStreamJsonLine = (
  line: string,
  state: StreamParserState,
): ParseLineResult => {
  const trimmed = line.trim()
  if (!trimmed) return { newMessages: [] }

  let data: any
  try {
    data = JSON.parse(trimmed)
  } catch {
    const looksLikeJson = trimmed.startsWith('{') || trimmed.startsWith('[')
    if (looksLikeJson) {
      const now = Date.now()
      if (now - lastParseWarnAt >= PARSE_WARN_INTERVAL_MS) {
        log.warn('JSONL parse failed (CLI output format broken?)', {
          preview: trimmed.slice(0, 200),
          suppressedInWindow: suppressedSinceLastWarn,
        })
        lastParseWarnAt = now
        suppressedSinceLastWarn = 0
      } else {
        suppressedSinceLastWarn++
      }
    } else {
      log.debug('Non-JSON line', { preview: trimmed.slice(0, 80) })
    }
    return { newMessages: [] }
  }

  const topType = data.type as string

  if (topType.includes('.') || topType === 'error') {
    return handleCodexExecEvent(data, topType, state)
  }

  switch (topType) {
    case 'system': return handleSystemEvent(data, state)
    case 'assistant': return handleAssistantEvent(data, state)
    case 'stream_event': return handleStreamEvent(data, state)
    case 'user': return handleUserEvent(data, state)
    case 'result': return handleResultEvent(data, state)
    default: return { newMessages: [] }
  }
}
