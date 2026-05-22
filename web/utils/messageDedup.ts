/**
 *  content key
 *
 *  flushDeltaBuffer / onExpertStructuredMessage / groupMessages
 */

import type { Message } from '../types/chat'

/**
 *  agent  stream-0  id
 *  agentId  groupMessages  user
 */
export const buildMessageInstanceKey = (m: Pick<Message, 'id' | 'role' | 'agentId'>): string => {
  if (m.role === 'user') return `u:${m.id}`
  return `${m.agentId ?? ''}-${m.id}`
}

/**
 *  agent  key
 *  parserStreamJson / ConversationParser ID
 *  content key
 *
 * @returns content key  null agent  /  key
 */
export const buildContentKey = (m: Message): string | null => {
  if (m.role !== 'agent' || !m.agentId) return null

  switch (m.type) {
    case 'toolUse':
      return m.toolUse ? `${m.agentId}:toolUse:${m.toolUse.toolId}` : null
    case 'toolResult':
      return m.toolResult ? `${m.agentId}:toolResult:${m.toolResult.toolUseId}` : null
    case 'text':
      return m.content ? `${m.agentId}:text:${m.apiCallId ?? ''}:${m.content}` : null
    case 'thinking':
      return m.thinkingSummary ? `${m.agentId}:thinking:${m.apiCallId ?? ''}:${m.thinkingSummary}` : null
    case 'stats':
      return m.stats ? `${m.agentId}:stats:${m.turnIndex ?? ''}:${m.stats.inputTokens ?? 0}:${m.stats.outputTokens ?? 0}` : null
    default:
      return null
  }
}
