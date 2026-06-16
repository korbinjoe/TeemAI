import type { Message } from '../../../types/chat'
import { buildContentKey, buildMessageInstanceKey } from '../../../utils/messageDedup'
import { formatTimeDivider } from '../../../utils/format'

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
  const lastGroupByAgent = new Map<string, MessageGroup>()
  // ConversationParser ids (msg-<line>-<block>) can collide across multiple
  // expert sessions sharing the same chat; suffix on collision so React keys
  // stay unique without losing either message.
  const usedIds = new Set<string>()
  const claimId = (base: string): string => {
    if (!usedIds.has(base)) { usedIds.add(base); return base }
    let n = 1
    while (usedIds.has(`${base}#${n}`)) n++
    const id = `${base}#${n}`
    usedIds.add(id)
    return id
  }

  for (const msg of deduped) {
    if (msg.role === 'user') {
      const agentId = msg.agentId || msg.mentions?.[0]?.id
      currentGroup = {
        id: claimId(`group-${msg.id}`),
        userMessage: msg,
        agentMessages: [],
        isStreaming: false,
        agentId: agentId,
      }
      groups.push(currentGroup)
      if (agentId) lastGroupByAgent.set(agentId, currentGroup)
    } else {
      if (!currentGroup && msg.type !== 'error') {
        currentGroup = {
          id: claimId(`group-orphan-${msg.id}`),
          userMessage: null,
          agentMessages: [],
          isStreaming: false,
          agentId: msg.agentId,
        }
        groups.push(currentGroup)
        if (msg.agentId) lastGroupByAgent.set(msg.agentId, currentGroup)
      }
      if (currentGroup && currentGroup.agentId === msg.agentId) {
        currentGroup.agentMessages.push(msg)
      } else {
        // The merged Mission view interleaves messages from agents running in
        // parallel, so the current group often belongs to a different agent.
        // Attach to the most recent group bound to this agent in O(1) instead
        // of scanning all prior groups on every interleaved agent message.
        const target = msg.agentId ? lastGroupByAgent.get(msg.agentId) ?? null : null
        if (target) {
          target.agentMessages.push(msg)
        } else if (msg.type !== 'error') {
          const orphan: MessageGroup = {
            id: claimId(`group-orphan-${msg.id}`),
            userMessage: null,
            agentMessages: [msg],
            isStreaming: false,
            agentId: msg.agentId,
          }
          groups.push(orphan)
          if (msg.agentId) lastGroupByAgent.set(msg.agentId, orphan)
          currentGroup = orphan
        }
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

/** Anchor timestamp for a group: its user message, else its first agent message. */
export const getGroupTimestamp = (g: MessageGroup): number =>
  g.userMessage?.timestamp ?? g.agentMessages[0]?.timestamp ?? 0

/** A new time divider is inserted between groups separated by this gap, so a
 *  mission resumed after a break shows when work picked back up. */
const DIVIDER_GAP_MS = 30 * 60 * 1000

const isSameDay = (a: number, b: number): boolean => {
  const da = new Date(a)
  const db = new Date(b)
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate()
}

/** Per-group divider labels (null = no divider). Shows on the first group, on a
 *  day change, or after a >30min gap — giving the message stream a time pulse
 *  without labeling every message. */
export function computeDividerLabels(groups: MessageGroup[]): (string | null)[] {
  let prevTs = 0
  return groups.map((g) => {
    const ts = getGroupTimestamp(g)
    if (!ts) return null
    const show = prevTs === 0 || !isSameDay(prevTs, ts) || ts - prevTs >= DIVIDER_GAP_MS
    prevTs = ts
    return show ? formatTimeDivider(ts) : null
  })
}
