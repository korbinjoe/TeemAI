import { useState, useCallback, useMemo, useRef } from 'react'
import type { Message } from '../types/chat'

/**
 * Per-agent message store for a chat.
 *
 * A Mission (chat) hosts N independent agent conversations, each mapping 1:1 to a
 * Claude/Codex JSONL session. We keep them in separate slots so that:
 *   - Single-agent surfaces (Quad tile, agent-locked URL) read one slot directly
 *     and are guaranteed not to bleed into another agent's stream.
 *   - The aggregate Mission view merges by timestamp without losing per-agent
 *     ordering or threading.
 */

export type AgentMessagesMap = Record<string, Message[]>

const SYSTEM_AGENT_KEY = '__chat__'

export interface AgentMessagesAPI {
  agentMessages: AgentMessagesMap
  agentMessagesRef: React.MutableRefObject<AgentMessagesMap>
  setAgentMessages: React.Dispatch<React.SetStateAction<AgentMessagesMap>>
  /** Append a single message to one agent slot. Tags msg.agentId if missing. */
  addMessage: (agentId: string, msg: Message) => void
  /** Updater-form mutate for one agent slot. */
  updateAgent: (agentId: string, updater: (prev: Message[]) => Message[]) => void
  /** Read snapshot for an agent slot (empty array if absent). */
  getAgentMessages: (agentId: string) => Message[]
  /** All messages flattened and timestamp-sorted — for aggregate Mission view. */
  mergedMessages: Message[]
}

export const SYSTEM_MESSAGE_AGENT = SYSTEM_AGENT_KEY

/**
 * Merge k already-sorted (ascending timestamp) lists into one sorted list.
 * Each per-agent slot is kept in timestamp order by the delta/replay merge, so
 * a linear k-way merge (O(n)) reproduces the same result a full sort would —
 * with a stable tie-break (lower slot index first) matching the previous
 * `a.timestamp - b.timestamp` sort's behavior for equal timestamps.
 */
const kWayMergeByTimestamp = (slots: Message[][]): Message[] => {
  const nonEmpty = slots.filter((s) => s.length > 0)
  if (nonEmpty.length === 0) return []
  if (nonEmpty.length === 1) return nonEmpty[0]

  let total = 0
  for (const s of nonEmpty) total += s.length
  const out: Message[] = new Array(total)
  const cursors = new Array(nonEmpty.length).fill(0)
  let written = 0

  while (written < total) {
    let bestSlot = -1
    let bestTs = 0
    for (let i = 0; i < nonEmpty.length; i++) {
      const c = cursors[i]
      if (c >= nonEmpty[i].length) continue
      const ts = nonEmpty[i][c].timestamp
      // Strictly-less keeps the earliest slot on ties → stable order.
      if (bestSlot === -1 || ts < bestTs) {
        bestSlot = i
        bestTs = ts
      }
    }
    out[written++] = nonEmpty[bestSlot][cursors[bestSlot]++]
  }
  return out
}

export const useAgentMessages = (): AgentMessagesAPI => {
  const [agentMessages, setAgentMessages] = useState<AgentMessagesMap>({})
  const agentMessagesRef = useRef(agentMessages)
  agentMessagesRef.current = agentMessages

  const addMessage = useCallback((agentId: string, msg: Message) => {
    const tagged: Message = msg.agentId ? msg : { ...msg, agentId }
    setAgentMessages((prev) => {
      const list = prev[agentId] ?? []
      return { ...prev, [agentId]: [...list, tagged] }
    })
  }, [])

  const updateAgent = useCallback((agentId: string, updater: (prev: Message[]) => Message[]) => {
    setAgentMessages((prev) => {
      const list = prev[agentId] ?? []
      const next = updater(list)
      if (next === list) return prev
      return { ...prev, [agentId]: next }
    })
  }, [])

  const getAgentMessages = useCallback((agentId: string): Message[] => {
    return agentMessagesRef.current[agentId] ?? []
  }, [])

  const mergedMessages = useMemo(() => {
    const slots = Object.values(agentMessages)
    if (slots.length <= 1) return slots[0] ?? []
    const merged = kWayMergeByTimestamp(slots)
    if (import.meta.env.DEV) {
      const reference = ([] as Message[]).concat(...slots).sort((a, b) => a.timestamp - b.timestamp)
      if (reference.length !== merged.length || reference.some((m, i) => m.id !== merged[i].id)) {
        // TODO(perf-rollout): remove after incremental-merge soak passes.
        console.warn('[useAgentMessages] incremental merge diverged from full sort')
      }
    }
    return merged
  }, [agentMessages])

  return {
    agentMessages,
    agentMessagesRef,
    setAgentMessages,
    addMessage,
    updateAgent,
    getAgentMessages,
    mergedMessages,
  }
}
