import type { ParsedMessage, ParsedStats } from './ConversationParser'
import type { StreamParserState, ParseLineResult } from './StreamJsonParser'
import { createLogger } from '../lib/logger'

const log = createLogger('CodexEventHandler')

const stableId = (seq: number) => `stream-${seq}`

export const handleCodexExecEvent = (
  data: any,
  eventType: string,
  state: StreamParserState,
): ParseLineResult => {
  const ts = Date.now()
  const currentTurn = Math.max(state.turnIndex, 0)

  switch (eventType) {
    case 'thread.started': {
      state.turnIndex++
      state.codexUsage = null
      const threadId = data.thread_id as string | undefined
      if (threadId) {
        state.sessionId = threadId
        return { newMessages: [], systemEvent: { subtype: 'init', sessionId: threadId } }
      }
      return { newMessages: [] }
    }

    case 'turn.started': {
      state.codexUsage = null
      return { newMessages: [] }
    }

    case 'item.started':
    case 'item.completed': {
      const item = data.item
      if (!item) return { newMessages: [] }
      if (eventType === 'item.started') return { newMessages: [] }

      const newMessages: ParsedMessage[] = []
      const itemType = item.type as string
      const itemId = (item.id as string | undefined) || stableId(state.messageSeq)

      if (itemType === 'agent_message') {
        const text = item.text as string | undefined
        if (text) {
          newMessages.push({
            id: stableId(state.messageSeq++), role: 'agent', content: text,
            timestamp: ts, type: 'text', turnIndex: currentTurn,
          })
        }
      } else if (itemType === 'reasoning') {
        const summary = item.text || item.summary || ''
        if (summary) {
          newMessages.push({
            id: stableId(state.messageSeq++), role: 'agent', content: '',
            timestamp: ts, type: 'thinking',
            thinkingSummary: summary.length > 500 ? summary.slice(0, 500) + '…' : summary,
            turnIndex: currentTurn,
          })
        }
      } else if (itemType === 'command_execution') {
        const command = item.command as string | undefined || ''
        const output = (item.aggregated_output as string | undefined) || ''
        const exitCode = item.exit_code as number | null | undefined
        const toolId = itemId
        newMessages.push({
          id: stableId(state.messageSeq++), role: 'agent', content: '',
          timestamp: ts, type: 'toolUse',
          toolUse: { toolName: 'Bash', toolId, input: JSON.stringify({ command }), status: 'completed' },
          turnIndex: currentTurn,
        })
        newMessages.push({
          id: stableId(state.messageSeq++), role: 'agent', content: '',
          timestamp: ts, type: 'toolResult',
          toolResult: {
            toolUseId: toolId,
            content: output.length > 2000 ? output.slice(0, 2000) + '…' : output,
            isError: typeof exitCode === 'number' && exitCode !== 0,
          },
          turnIndex: currentTurn,
        })
      } else if (itemType === 'file_change') {
        const changes = Array.isArray(item.changes) ? item.changes : []
        const toolId = itemId
        const kinds = new Set(changes.map((c: any) => c?.kind))
        const toolName = kinds.has('add') && !kinds.has('update') && !kinds.has('delete') ? 'Write' : 'Edit'
        newMessages.push({
          id: stableId(state.messageSeq++), role: 'agent', content: '',
          timestamp: ts, type: 'toolUse',
          toolUse: { toolName, toolId, input: JSON.stringify({ changes }), status: 'completed' },
          turnIndex: currentTurn,
        })
        const summary = changes
          .map((c: any) => `${c?.kind || 'change'} ${c?.path || ''}`.trim())
          .filter(Boolean).join('\n')
        newMessages.push({
          id: stableId(state.messageSeq++), role: 'agent', content: '',
          timestamp: ts, type: 'toolResult',
          toolResult: { toolUseId: toolId, content: summary || 'file change completed', isError: item.status === 'failed' },
          turnIndex: currentTurn,
        })
      } else if (itemType === 'mcp_tool_call') {
        const toolName = `${item.server || 'mcp'}.${item.tool || 'call'}`
        const toolId = itemId
        const args = item.arguments ?? item.input ?? {}
        newMessages.push({
          id: stableId(state.messageSeq++), role: 'agent', content: '',
          timestamp: ts, type: 'toolUse',
          toolUse: { toolName, toolId, input: typeof args === 'string' ? args : JSON.stringify(args), status: 'completed' },
          turnIndex: currentTurn,
        })
        const result = item.result ?? item.output ?? ''
        const resultStr = typeof result === 'string' ? result : JSON.stringify(result)
        newMessages.push({
          id: stableId(state.messageSeq++), role: 'agent', content: '',
          timestamp: ts, type: 'toolResult',
          toolResult: {
            toolUseId: toolId,
            content: resultStr.length > 2000 ? resultStr.slice(0, 2000) + '…' : resultStr,
            isError: item.status === 'failed' || item.is_error === true,
          },
          turnIndex: currentTurn,
        })
      } else if (itemType === 'todo_list') {
        const todos = Array.isArray(item.items) ? item.items : []
        newMessages.push({
          id: stableId(state.messageSeq++), role: 'agent', content: '',
          timestamp: ts, type: 'toolUse',
          toolUse: { toolName: 'TodoWrite', toolId: itemId, input: JSON.stringify({ todos }), status: 'completed' },
          turnIndex: currentTurn,
        })
      } else if (itemType === 'web_search') {
        const query = item.query as string | undefined || ''
        newMessages.push({
          id: stableId(state.messageSeq++), role: 'agent', content: '',
          timestamp: ts, type: 'toolUse',
          toolUse: { toolName: 'WebSearch', toolId: itemId, input: JSON.stringify({ query }), status: 'completed' },
          turnIndex: currentTurn,
        })
      } else {
        const fallbackText = (item.text || item.message || '') as string
        if (fallbackText) {
          newMessages.push({
            id: stableId(state.messageSeq++), role: 'agent', content: fallbackText,
            timestamp: ts, type: 'text', turnIndex: currentTurn,
          })
        } else {
          log.debug('Codex unknown item.type', { itemType })
        }
      }

      state.messages.push(...newMessages)
      return { newMessages }
    }

    case 'turn.completed': {
      const stats: ParsedStats = {}
      const usage = data.usage || state.codexUsage
      if (usage) {
        stats.inputTokens = usage.input_tokens || usage.input || 0
        stats.outputTokens = usage.output_tokens || usage.output || 0
      }
      const statsMsg: ParsedMessage = {
        id: `stats-codex-${currentTurn}`, role: 'agent', content: '',
        timestamp: ts, type: 'stats', stats, turnIndex: currentTurn, isTurnEnd: true,
      }
      state.messages.push(statsMsg)
      return { newMessages: [statsMsg] }
    }

    case 'error': {
      const errorText = data.message || 'Unknown error'
      const errorMsg: ParsedMessage = {
        id: stableId(state.messageSeq++), role: 'agent', content: `Error: ${errorText}`,
        timestamp: ts, type: 'text', turnIndex: currentTurn,
      }
      state.messages.push(errorMsg)
      return { newMessages: [errorMsg] }
    }

    case 'turn.failed': {
      const errorText = data.error?.message || 'Turn failed'
      const errorMsg: ParsedMessage = {
        id: stableId(state.messageSeq++), role: 'agent', content: `Error: ${errorText}`,
        timestamp: ts, type: 'text', turnIndex: currentTurn,
      }
      const statsMsg: ParsedMessage = {
        id: `stats-codex-${currentTurn}`, role: 'agent', content: '',
        timestamp: ts, type: 'stats', turnIndex: currentTurn, isTurnEnd: true,
      }
      state.messages.push(errorMsg, statsMsg)
      return { newMessages: [errorMsg, statsMsg] }
    }

    default:
      return { newMessages: [] }
  }
}
