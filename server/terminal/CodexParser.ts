/**
 * CodexParser - Codex Rollout JSONL
 *
 * Codex TUI  RolloutRecorder
 *   ~/.codex/sessions/YYYY/MM/DD/rollout-<timestamp>-<thread-uuid>.jsonl
 *
 *  JSON 5  type
 *   session_meta    — model, cwd, git info
 *   response_item   — API message, function_call, function_call_output
 *   event_msg       — ExecCommand, PatchApply, TokenUsage, AgentReasoning
 *   turn_context    — cwd
 *   compacted       —
 *
 *  ConversationParser  ParsedMessage[]
 */

import type { OutputParser } from './OutputParser'
import type { ParsedMessage, ParserState } from './ConversationParser'
import { createParserState } from './ConversationParser'
import { createLogger } from '../lib/logger'

const log = createLogger('CodexParser')

let lastParseWarnAt = 0
let suppressedSinceLastWarn = 0
const PARSE_WARN_INTERVAL_MS = 60_000

export const codexOutputParser: OutputParser = {
  createState: createParserState,
  parseNewLines: parseCodexNewLines,
}

const TOOL_MAP: Record<string, string> = {
  shell: 'Bash',
  apply_patch: 'Edit',
  read_file: 'Read',
  list_files: 'Glob',
  write_file: 'Write',
}

const mapTool = (name: string) => TOOL_MAP[name] || name

const stableId = (lineIndex: number, blockIndex: number) =>
  `msg-${lineIndex}-${blockIndex}`

function parseCodexNewLines(
  lines: string[],
  startLine: number,
  state: ParserState,
): { newMessages: ParsedMessage[]; replacedStatsId: string | null } {
  const rawMessages: ParsedMessage[] = []
  let { turnIndex } = state

  const processedCallIds = new Set<string>()

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i]?.trim()
    if (!line) continue

    let entry: any
    try {
      entry = JSON.parse(line)
    } catch {
      const looksLikeJson = line.startsWith('{') || line.startsWith('[')
      if (looksLikeJson) {
        const now = Date.now()
        if (now - lastParseWarnAt >= PARSE_WARN_INTERVAL_MS) {
          log.warn('Codex JSONL parse failed (rollout write corrupted?)', {
            preview: line.slice(0, 200),
            suppressedInWindow: suppressedSinceLastWarn,
          })
          lastParseWarnAt = now
          suppressedSinceLastWarn = 0
        } else {
          suppressedSinceLastWarn++
        }
      }
      continue
    }

    const ts = entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now()
    let blockIndex = 0
    const currentTurn = Math.max(turnIndex, 0)

    const payload = entry.payload

    switch (entry.type) {
      case 'session_meta': {
        const model = payload?.model
        if (model) state.turnModel.set(currentTurn, model)
        break
      }

      case 'response_item': {
        const item = payload
        if (!item) break

        if (item.type === 'message' && item.role === 'user') {
          turnIndex++
          const text = extractText(item.content)
          if (text) {
            rawMessages.push({
              id: stableId(i, blockIndex++),
              role: 'user',
              content: text,
              timestamp: ts,
              type: 'text',
              turnIndex,
            })
          }
        }
        // ── assistant message → text + usage ──
        else if (item.type === 'message' && item.role === 'assistant') {
          const blocks = Array.isArray(item.content) ? item.content : []
          for (const block of blocks) {
            if (block.type === 'output_text' && block.text) {
              rawMessages.push({
                id: stableId(i, blockIndex++),
                role: 'agent',
                content: block.text,
                timestamp: ts,
                type: 'text',
                turnIndex: currentTurn,
              })
            }
          }

          if (item.usage) {
            const existing = state.turnUsage.get(currentTurn)
            const input = item.usage.input_tokens || 0
            const output = item.usage.output_tokens || 0
            if (existing) {
              existing.input = Math.max(existing.input, input)
              existing.output = Math.max(existing.output, output)
            } else {
              state.turnUsage.set(currentTurn, { input, output })
            }
          }
          if (item.model) state.turnModel.set(currentTurn, item.model)
          state.turnLastTs.set(currentTurn, ts)

          if (item.status === 'completed') {
            state.turnEnded.add(currentTurn)
          }
        }
        // ── function_call → toolUse ──
        else if (item.type === 'function_call') {
          const callId = item.call_id || item.id || stableId(i, blockIndex)
          processedCallIds.add(callId)

          rawMessages.push({
            id: stableId(i, blockIndex++),
            role: 'agent',
            content: '',
            timestamp: ts,
            type: 'toolUse',
            toolUse: {
              toolName: mapTool(item.name || ''),
              toolId: callId,
              input: item.arguments || '{}',
              status: 'completed',
            },
            turnIndex: currentTurn,
          })
        }
        // ── function_call_output → toolResult ──
        else if (item.type === 'function_call_output') {
          const callId = item.call_id || ''
          processedCallIds.add(callId)

          const output = typeof item.output === 'string'
            ? item.output
            : JSON.stringify(item.output || '')

          rawMessages.push({
            id: stableId(i, blockIndex++),
            role: 'agent',
            content: '',
            timestamp: ts,
            type: 'toolResult',
            toolResult: {
              toolUseId: callId,
              content: output.length > 2000 ? output.slice(0, 2000) + '…' : output,
              isError: false,
            },
            turnIndex: currentTurn,
          })
        }
        break
      }

      case 'event_msg': {
        const event = payload
        if (!event) break

        if (event.type === 'token_count') {
          const usage = event.info?.total_token_usage
          if (usage) {
            const existing = state.turnUsage.get(currentTurn)
            const input = usage.input_tokens || 0
            const output = usage.output_tokens || 0
            if (existing) {
              existing.input = Math.max(existing.input, input)
              existing.output = Math.max(existing.output, output)
            } else {
              state.turnUsage.set(currentTurn, { input, output })
            }
          }
        }
        else if (event.type === 'user_message' && event.message) {
        }
        // else if (event.type === 'agent_message') { ... }
        else if (event.type === 'task_complete') {
          state.turnEnded.add(currentTurn)
          state.turnLastTs.set(currentTurn, ts)
        }
        // ── task_started → Record ──
        else if (event.type === 'task_started') {
          // no-op, turn boundary handled by response_item user message
        }
        else if (event.type === 'ExecCommandBegin' || event.type === 'PatchApplyBegin') {
          const callId = event.call_id
          if (callId && processedCallIds.has(callId)) break

          const toolName = event.type === 'ExecCommandBegin' ? 'Bash' : 'Edit'
          const input = event.type === 'ExecCommandBegin'
            ? JSON.stringify({ command: event.command?.join(' ') || '' })
            : JSON.stringify({ file_path: event.path || '' })

          rawMessages.push({
            id: stableId(i, blockIndex++),
            role: 'agent',
            content: '',
            timestamp: ts,
            type: 'toolUse',
            toolUse: {
              toolName,
              toolId: callId || stableId(i, blockIndex),
              input,
              status: 'completed',
            },
            turnIndex: currentTurn,
          })
          if (callId) processedCallIds.add(callId)
        }
        else if (event.type === 'ExecCommandEnd' || event.type === 'PatchApplyEnd') {
          const callId = event.call_id
          if (callId && processedCallIds.has(callId) && !rawMessages.some(
            (m) => m.type === 'toolUse' && m.toolUse?.toolId === callId,
          )) break

          const output = event.stdout || event.stderr || ''
          rawMessages.push({
            id: stableId(i, blockIndex++),
            role: 'agent',
            content: '',
            timestamp: ts,
            type: 'toolResult',
            toolResult: {
              toolUseId: callId || '',
              content: output.length > 2000 ? output.slice(0, 2000) + '…' : output,
              isError: event.exit_code !== undefined ? event.exit_code !== 0 : false,
            },
            turnIndex: currentTurn,
          })
        }
        break
      }

      case 'turn_context': {
        const model = payload?.model
        if (model) state.turnModel.set(currentTurn, model)
        break
      }

      default:
        break
    }
  }

  // ── Update state ──
  state.turnIndex = turnIndex
  state.linesProcessed = lines.length

  const reordered: ParsedMessage[] = []
  const toolResultMap = new Map<string, ParsedMessage>()
  const usedToolResults = new Set<string>()

  for (const msg of rawMessages) {
    if (msg.type === 'toolResult' && msg.toolResult) {
      toolResultMap.set(msg.toolResult.toolUseId, msg)
    }
  }
  for (const msg of rawMessages) {
    if (msg.type === 'toolResult') continue
    reordered.push(msg)
    if (msg.type === 'toolUse' && msg.toolUse) {
      const tr = toolResultMap.get(msg.toolUse.toolId)
      if (tr) { reordered.push(tr); usedToolResults.add(msg.toolUse.toolId) }
    }
  }
  for (const msg of rawMessages) {
    if (msg.type === 'toolResult' && msg.toolResult && !usedToolResults.has(msg.toolResult.toolUseId)) {
      reordered.push(msg)
    }
  }

  let replacedStatsId: string | null = null
  if (state.messages.length > 0 && reordered.length > 0) {
    const lastPrev = state.messages[state.messages.length - 1]
    if (lastPrev.type === 'stats') {
      const firstNewTurn = reordered[0].turnIndex ?? 0
      if (lastPrev.turnIndex === firstNewTurn) {
        state.messages.pop()
        replacedStatsId = lastPrev.id
      }
    }
  }

  const finalMessages: ParsedMessage[] = []
  for (let j = 0; j < reordered.length; j++) {
    const msg = reordered[j]
    const nextMsg = reordered[j + 1]
    finalMessages.push(msg)

    const currentTurn = msg.turnIndex ?? 0
    const isLastInTurn = !nextMsg || (nextMsg.turnIndex ?? 0) !== currentTurn

    if (isLastInTurn && (state.turnUsage.has(currentTurn) || state.turnEnded.has(currentTurn))) {
      const usage = state.turnUsage.get(currentTurn)
      finalMessages.push({
        id: `stats-${currentTurn}`,
        role: 'agent',
        content: '',
        timestamp: state.turnLastTs?.get(currentTurn) || msg.timestamp,
        type: 'stats',
        stats: usage ? {
          inputTokens: usage.input,
          outputTokens: usage.output,
        } : undefined,
        model: state.turnModel.get(currentTurn),
        turnIndex: currentTurn,
        isTurnEnd: state.turnEnded.has(currentTurn),
      })
    }
  }

  return { newMessages: finalMessages, replacedStatsId }
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((b: any) => b.type === 'input_text' || b.type === 'text')
      .map((b: any) => b.text || '')
      .join('')
  }
  return ''
}
