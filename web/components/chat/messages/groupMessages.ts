import type { Message } from '../../../types/chat'
import { buildContentKey, buildMessageInstanceKey } from '../../../utils/messageDedup'

export interface MessageGroup {
  id: string
  userMessage: Message | null
  agentMessages: Message[]
  isStreaming: boolean
  agentId?: string
}

export function groupMessages(messages: Message[]): MessageGroup[] {
  const seen = new Set<string>()
  const seenContent = new Set<string>()
  const deduped = messages.filter((m) => {
    if (m.role === 'user') return true
    const ik = buildMessageInstanceKey(m)
    if (seen.has(ik)) return false
    seen.add(ik)
    const contentKey = buildContentKey(m)
    if (contentKey) {
      if (seenContent.has(contentKey)) return false
      seenContent.add(contentKey)
    }
    return true
  })

  const groups: MessageGroup[] = []
  let currentGroup: MessageGroup | null = null

  for (const msg of deduped) {
    if (msg.role === 'user') {
      const agentId = msg.agentId || msg.mentions?.[0]?.id
      currentGroup = {
        id: `group-${msg.id}`,
        userMessage: msg,
        agentMessages: [],
        isStreaming: false,
        agentId: agentId,
      }
      groups.push(currentGroup)
    } else {
      if (!currentGroup && msg.type !== 'error') {
        currentGroup = {
          id: `group-orphan-${msg.id}`,
          userMessage: null,
          agentMessages: [],
          isStreaming: false,
          agentId: msg.agentId,
        }
        groups.push(currentGroup)
      }
      if (currentGroup && currentGroup.agentId === msg.agentId) {
        currentGroup.agentMessages.push(msg)
      }
    }
  }

  if (groups.length > 0) {
    const lastGroup = groups[groups.length - 1]
    if (lastGroup.agentMessages.length > 0) {
      const hasRunning = lastGroup.agentMessages.some((m) => m.toolUse?.status === 'running')
      const hasStats = lastGroup.agentMessages.some((m) => m.type === 'stats')
      if (hasRunning || !hasStats) {
        lastGroup.isStreaming = true
      }
    }
  }

  return groups
}
