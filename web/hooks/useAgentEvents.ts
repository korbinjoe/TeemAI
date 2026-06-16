import { toast } from 'sonner'
import i18n from '@/i18n'
import type { Message, AgentActivity } from '../types/chat'
import { buildContentKey, buildMessageInstanceKey } from '../utils/messageDedup'
import type { AgentMessagesMap } from './useAgentMessages'
import { SYSTEM_MESSAGE_AGENT } from './useAgentMessages'
import { missionSwitchPerf } from '../lib/missionSwitchPerf'

export interface AgentEventContext {
  isCurrentChatEvent: (payload?: { chatId?: string }) => boolean
  /** Append a chat-level message (errors, system notices) to a specific or default slot. */
  addSystemMessage: (msg: Message) => void
  uid: (prefix: string) => string
  t: (key: string, opts?: Record<string, unknown>) => string
  setExpertActivities: React.Dispatch<React.SetStateAction<Record<string, AgentActivity>>>
  /** Per-agent message store updater. */
  setAgentMessages: React.Dispatch<React.SetStateAction<AgentMessagesMap>>
  setLoading: React.Dispatch<React.SetStateAction<boolean>>
  setThinking: React.Dispatch<React.SetStateAction<boolean>>
  setAgentSlashCommands: React.Dispatch<React.SetStateAction<Record<string, string[]>>>
  setAgentPlans: React.Dispatch<React.SetStateAction<Record<string, { entries: Array<{ content: string; status: 'pending' | 'in_progress' | 'completed'; priority?: 'low' | 'medium' | 'high' }> }>>>
  setAgentModes: React.Dispatch<React.SetStateAction<Record<string, string>>>
  setAgentAvailableCommands: React.Dispatch<React.SetStateAction<Record<string, string[]>>>
  setAgentSessionInfo: React.Dispatch<React.SetStateAction<Record<string, { title?: string; updatedAt?: string }>>>
}

const isSameActivity = (a: AgentActivity, b: AgentActivity): boolean =>
  a.phase === b.phase &&
  a.background === b.background &&
  a.currentTool === b.currentTool &&
  a.toolCount === b.toolCount &&
  a.toolCompleted === b.toolCompleted &&
  a.hasText === b.hasText &&
  a.cost === b.cost

/** Merge a fresh batch into an existing per-agent list. */
const mergeAgentBatch = (
  base: Message[],
  batch: Message[],
  replacedIds: Set<string>,
  dropStreamingForAgent: boolean,
): Message[] => {
  const filteredBase = base.filter((m) => {
    if (replacedIds.size > 0 && replacedIds.has(m.id)) return false
    if (dropStreamingForAgent && m.streaming) return false
    return true
  })

  const existingInstanceKeys = new Set(filteredBase.map((m) => buildMessageInstanceKey(m)))
  const existingContentKeys = new Set<string>()
  // Optimistic user messages (typed in the input box) carry a client id and no
  // jsonlUuid; the parser later echoes the same turn with a stable id. Dedup
  // user turns by content so we drop that echo while keeping genuinely new
  // turns — e.g. a re-dispatch/handoff prompt that has no optimistic copy.
  const existingUserContents = new Set<string>()
  for (const m of filteredBase) {
    const ck = buildContentKey(m)
    if (ck) existingContentKeys.add(ck)
    if (m.role === 'user') existingUserContents.add(m.content)
  }

  const seenInBatch = new Set<string>()
  const seenContentInBatch = new Set<string>()
  const deduped = batch.filter((m) => {
    const ik = buildMessageInstanceKey(m)
    if (existingInstanceKeys.has(ik) || seenInBatch.has(ik)) return false
    if (m.role === 'user') {
      if (existingUserContents.has(m.content) || seenContentInBatch.has(`u:${m.content}`)) return false
      seenContentInBatch.add(`u:${m.content}`)
      seenInBatch.add(ik)
      return true
    }
    const ck = buildContentKey(m)
    if (ck && (existingContentKeys.has(ck) || seenContentInBatch.has(ck))) return false
    if (ck) seenContentInBatch.add(ck)
    seenInBatch.add(ik)
    return true
  })

  if (deduped.length === 0 && filteredBase.length === base.length) return base

  const merged: Message[] = []
  let i = 0, j = 0
  while (i < filteredBase.length && j < deduped.length) {
    if (filteredBase[i].timestamp <= deduped[j].timestamp) merged.push(filteredBase[i++])
    else merged.push(deduped[j++])
  }
  while (i < filteredBase.length) merged.push(filteredBase[i++])
  while (j < deduped.length) merged.push(deduped[j++])
  return merged
}

/** Replay (full) into an existing per-agent list. */
const applyAgentReplay = (base: Message[], tagged: Message[], agentId: string): Message[] => {
  const replayUserIds = new Set(
    tagged.filter((m) => m.role === 'user').map((m) => m.jsonlUuid || m.id),
  )
  const replayUserContents = new Set(
    tagged.filter((m) => m.role === 'user').map((m) => m.content),
  )
  const maxReplayTs = tagged.reduce((max, m) => Math.max(max, m.timestamp), 0)

  const others = base.filter((m) => {
    if (m.role !== 'user') {
      return m.timestamp > maxReplayTs
    }
    if (m.streaming) return false
    if (m.jsonlUuid && replayUserIds.has(m.jsonlUuid)) return false
    if (replayUserIds.has(m.id)) return false
    if (replayUserContents.has(m.content)) return false
    return true
  })

  const result: Message[] = []
  let i = 0, j = 0
  while (i < others.length && j < tagged.length) {
    if (others[i].timestamp <= tagged[j].timestamp) result.push(others[i++])
    else result.push(tagged[j++])
  }
  while (i < others.length) result.push(others[i++])
  while (j < tagged.length) result.push(tagged[j++])
  result.sort((a, b) => a.timestamp - b.timestamp)

  // Drop residual streaming entries for this agent — a full replay supersedes them.
  return result.filter((m) => !(m.streaming && m.agentId === agentId))
}

const messagesSignature = (msgs: Message[]): string => {
  if (msgs.length === 0) return '0'
  const last = msgs[msgs.length - 1]
  return `${msgs.length}:${last.id}:${last.timestamp}`
}

export const createAgentEventHandlers = (ctx: AgentEventContext) => {
  const {
    isCurrentChatEvent, addSystemMessage, uid, t,
    setExpertActivities, setAgentMessages, setLoading, setThinking,
    setAgentSlashCommands, setAgentPlans, setAgentModes,
    setAgentAvailableCommands, setAgentSessionInfo,
  } = ctx

  // Per-agent delta buffering. Flush coalesces by agent so multiple agents
  // running in parallel never overwrite each other's pending stream.
  const deltaBuffers = new Map<string, { messages: Message[]; replacedIds: Set<string> }>()
  let deltaFlushTimer: ReturnType<typeof setTimeout> | null = null
  const DELTA_FLUSH_MS = 16

  // Partial-text coalescing. Streaming chunks arrive faster than one frame;
  // accumulating concatenated text per agent and flushing on the same 16ms
  // cadence collapses N per-chunk setStates into one, while preserving the
  // append-to-last-streaming-bubble shape the UI renders.
  const partialTextBuffers = new Map<string, string>()
  let partialFlushTimer: ReturnType<typeof setTimeout> | null = null

  const flushPartialText = () => {
    partialFlushTimer = null
    if (partialTextBuffers.size === 0) return
    const snapshot = new Map(partialTextBuffers)
    partialTextBuffers.clear()

    setAgentMessages((prev) => {
      const next = { ...prev }
      let changed = false
      for (const [agentId, text] of snapshot.entries()) {
        if (!text) continue
        const list = next[agentId] ?? []
        const last = list[list.length - 1]
        if (last?.role === 'agent' && last.agentId === agentId && last.streaming) {
          const nextList = list.slice()
          nextList[nextList.length - 1] = { ...last, content: last.content + text }
          next[agentId] = nextList
        } else {
          next[agentId] = [
            ...list,
            {
              id: uid('stream'),
              role: 'agent',
              agentId,
              content: text,
              timestamp: Date.now(),
              type: 'text',
              streaming: true,
            },
          ]
        }
        changed = true
      }
      return changed ? next : prev
    })
  }

  const flushDeltaBuffer = () => {
    deltaFlushTimer = null
    if (deltaBuffers.size === 0) return
    const snapshot = new Map(deltaBuffers)
    deltaBuffers.clear()

    setAgentMessages((prev) => {
      const next = { ...prev }
      let changed = false
      for (const [agentId, { messages: batch, replacedIds }] of snapshot.entries()) {
        if (batch.length === 0 && replacedIds.size === 0) continue
        const base = next[agentId] ?? []
        // Only drop the streamed bubble when this batch actually carries the
        // committed text that supersedes it. A turn-end stats-only (or tool-only)
        // delta must not discard streamed text that was never committed — that
        // would erase the final reply the user already watched stream in.
        const batchSupersedesStream = batch.some((m) => m.role === 'agent' && m.type === 'text' && !!m.content)
        const merged = mergeAgentBatch(base, batch, replacedIds, batchSupersedesStream)
        if (merged !== base) {
          next[agentId] = merged
          changed = true
        }
      }
      return changed ? next : prev
    })
  }

  const cleanupDeltaTimer = () => {
    if (deltaFlushTimer) {
      clearTimeout(deltaFlushTimer)
      deltaFlushTimer = null
    }
    flushDeltaBuffer()
    if (partialFlushTimer) {
      clearTimeout(partialFlushTimer)
      partialFlushTimer = null
    }
    flushPartialText()
  }

  const pushDelta = (agentId: string, messages: Message[], replacedStatsId?: string | null) => {
    // Only drop buffered partial text when this delta carries the committed text
    // that supersedes it. A stats-only/tool-only delta (e.g. turn-end) must keep
    // the buffer so the streamed final reply isn't erased before it commits.
    if (messages.some((m) => m.role === 'agent' && m.type === 'text' && !!m.content)) {
      partialTextBuffers.delete(agentId)
    }
    let bucket = deltaBuffers.get(agentId)
    if (!bucket) {
      bucket = { messages: [], replacedIds: new Set() }
      deltaBuffers.set(agentId, bucket)
    }
    bucket.messages.push(...messages)
    if (replacedStatsId) bucket.replacedIds.add(replacedStatsId)
    if (!deltaFlushTimer) {
      deltaFlushTimer = setTimeout(flushDeltaBuffer, DELTA_FLUSH_MS)
    }
  }

  const handleExpertActivity = (payload: { agentId: string; chatId?: string; startedAt?: number; activity: AgentActivity }) => {
    if (!isCurrentChatEvent(payload)) return
    if (!payload?.agentId || !payload?.activity) return
    const activity = payload.startedAt
      ? { ...payload.activity, startedAt: payload.startedAt }
      : payload.activity
    setExpertActivities((prev) => {
      const existing = prev[payload.agentId]
      if (existing && isSameActivity(existing, activity)) return prev
      if (existing?.startedAt && !activity.startedAt) {
        return { ...prev, [payload.agentId]: { ...activity, startedAt: existing.startedAt } }
      }
      return { ...prev, [payload.agentId]: activity }
    })
  }

  const handleExpertExit = (payload: { agentId: string; chatId?: string; finalActivity?: AgentActivity; exitReason?: AgentActivity['exitReason'] }) => {
    if (!isCurrentChatEvent(payload)) return
    if (!payload?.agentId) return
    setExpertActivities((prev) => {
      const existing = prev[payload.agentId]
      const base = payload.finalActivity || existing || {
        background: false,
        toolCount: 0,
        toolCompleted: 0,
        hasText: false,
      }
      return {
        ...prev,
        [payload.agentId]: {
          ...base,
          phase: 'completed' as const,
          ...(payload.exitReason ? { exitReason: payload.exitReason } : {}),
          updatedAt: Date.now(),
        },
      }
    })
  }

  const handleExpertResumeFailed = (payload: { agentId: string; chatId?: string; agentName: string; reason: string; sessionId?: string; message?: string }) => {
    if (!isCurrentChatEvent(payload)) return
    if (!payload?.agentId) return
    if (payload.reason === 'command_not_found') {
      toast.error(payload.message || t('chat:cliNotInstalled'), { duration: 10000 })
    } else if (payload.reason === 'cwd_not_found') {
      toast.info(t('chat:expertResumeCwdNotFound', { name: payload.agentName || payload.agentId, message: payload.message }))
    } else {
      toast.info(t('chat:expertResumeExpired', { name: payload.agentName || payload.agentId }))
    }
  }

  const handleExpertError = (payload: { agentId?: string; chatId?: string; error?: string; message?: string }) => {
    if (!isCurrentChatEvent(payload)) return
    if (payload?.error === 'command_not_found') {
      toast.error(payload.message || t('chat:cliNotInstalled'), { duration: 10000 })
    } else {
      const errorMsg: Message = {
        id: uid('err'),
        role: 'agent',
        content: `Error: ${payload?.message ?? 'unknown'}`,
        timestamp: Date.now(),
        type: 'error',
        agentId: payload?.agentId,
      }
      if (payload?.agentId) {
        setAgentMessages((prev) => {
          const list = prev[payload.agentId!] ?? []
          return { ...prev, [payload.agentId!]: [...list, errorMsg] }
        })
      } else {
        addSystemMessage(errorMsg)
      }
      setLoading(false); setThinking(false)
    }
    if (payload?.agentId) {
      setExpertActivities((prev) => {
        if (!prev[payload.agentId!]) return prev
        return { ...prev, [payload.agentId!]: { ...prev[payload.agentId!], phase: 'completed' as const, updatedAt: Date.now() } }
      })
    }
  }

  const handleVersionBlocked = (payload: { agentId?: string; chatId?: string; clientVersion?: string; minClientVersion?: string; upgradeMessage?: string; upgradeUrl?: string }) => {
    if (!isCurrentChatEvent(payload)) return
    const msg = payload?.upgradeMessage || i18n.t('common:upgrade.versionTooLow', { clientVersion: payload?.clientVersion, minVersion: payload?.minClientVersion })
    toast.error(msg, { duration: 15000 })
    setLoading(false); setThinking(false)
  }

  const handleExpertStarted = (payload: { agentId: string; chatId?: string; agentName: string; sessionId: string; status?: string }) => {
    if (!isCurrentChatEvent(payload)) return
    if (!payload?.agentId) return

    if (payload.status === 'completed') {
      setExpertActivities((prev) => {
        if (prev[payload.agentId]?.phase === 'completed') return prev
        return {
          ...prev,
          [payload.agentId]: {
            phase: 'completed' as const,
            background: false,
            toolCount: 0,
            toolCompleted: 0,
            hasText: false,
            updatedAt: Date.now(),
          },
        }
      })
      setAgentMessages((prev) => {
        if (!prev[payload.agentId]?.length) return prev
        const { [payload.agentId]: _, ...rest } = prev
        return rest
      })
      return
    }

    let shouldClearMessages = false

    setExpertActivities((prev) => {
      const existing = prev[payload.agentId]
      if (existing && existing.phase !== 'completed' && existing.phase !== 'error' && existing.phase !== 'waiting_input') return prev

      // New session for a previously-completed/errored agent — must clear
      // stale messages so their line-based IDs don't collide with the new
      // session's IDs in mergeAgentBatch's instance-key dedup.
      if (existing && (existing.phase === 'completed' || existing.phase === 'error')) {
        shouldClearMessages = true
      }

      const next: AgentActivity = {
        phase: 'initializing',
        background: false,
        toolCount: 0,
        toolCompleted: 0,
        hasText: false,
        startedAt: Date.now(),
        updatedAt: Date.now(),
      }
      if (existing && isSameActivity(existing, next)) return prev
      return { ...prev, [payload.agentId]: next }
    })

    if (shouldClearMessages) {
      setAgentMessages((prev) => {
        if (!prev[payload.agentId]?.length) return prev
        const { [payload.agentId]: _, ...rest } = prev
        return rest
      })
    }
  }

  const onExpertStructuredMessage = (payload: {
    agentId: string
    sessionId: string
    chatId?: string
    type?: 'full' | 'delta'
    messages: Message[]
    replacedStatsId?: string | null
  }) => {
    if (!payload?.agentId || !payload?.messages?.length) return
    if (!payload.chatId || !isCurrentChatEvent(payload)) return

    if (payload.type === 'delta') {
      // Keep user messages: a re-dispatch/handoff injects a new user turn on the
      // server with no optimistic client copy, so dropping it here would erase
      // the turn boundary and merge the new turn into the previous group.
      // mergeAgentBatch dedups the optimistic echo of typed messages by content.
      const tagged = payload.messages.map((m) => ({ ...m, agentId: payload.agentId }))
      if (tagged.length === 0) return
      pushDelta(payload.agentId, tagged, payload.replacedStatsId ?? null)
      return
    }

    // Full replay — drop any pending delta for this agent so we don't double-apply.
    if (deltaFlushTimer) {
      const bucket = deltaBuffers.get(payload.agentId)
      if (bucket) deltaBuffers.delete(payload.agentId)
      if (deltaBuffers.size === 0) {
        clearTimeout(deltaFlushTimer)
        deltaFlushTimer = null
      }
    }
    // ...and drop pending partial text — the replay supersedes the stream.
    if (partialTextBuffers.delete(payload.agentId) && partialTextBuffers.size === 0 && partialFlushTimer) {
      clearTimeout(partialFlushTimer)
      partialFlushTimer = null
    }

    const tagged = payload.messages.map((m) => ({ ...m, agentId: payload.agentId }))
    if (tagged.length === 0) return

    const replayT0 = performance.now()
    setAgentMessages((prev) => {
      const base = prev[payload.agentId] ?? []
      const next = applyAgentReplay(base, tagged, payload.agentId)
      if (next === base || messagesSignature(next) === messagesSignature(base)) return prev
      return { ...prev, [payload.agentId]: next }
    })
    if (payload.chatId) {
      missionSwitchPerf.markReplay(
        payload.chatId,
        tagged.length,
        performance.now() - replayT0,
      )
    }
  }

  const handleExpertPartialText = (payload: { agentId: string; chatId?: string; sessionId?: string; blockIndex: number; text: string }) => {
    if (!isCurrentChatEvent(payload)) return
    if (!payload?.agentId || !payload?.text) return
    // If we already have a queued delta batch for this agent, partial text would
    // race with the structured update; let the delta win.
    if (deltaBuffers.get(payload.agentId)?.messages.length) return

    // Coalesce chunks within a frame; flushPartialText applies the same
    // append-to-last-streaming-bubble shape in one setState.
    const existing = partialTextBuffers.get(payload.agentId) ?? ''
    partialTextBuffers.set(payload.agentId, existing + payload.text)
    if (!partialFlushTimer) {
      partialFlushTimer = setTimeout(flushPartialText, DELTA_FLUSH_MS)
    }
  }

  const handleExpertSlashCommands = (payload: { agentId: string; chatId?: string; commands: string[] }) => {
    if (!isCurrentChatEvent(payload)) return
    if (!payload?.agentId || !Array.isArray(payload.commands)) return
    setAgentSlashCommands((prev) => {
      const existing = prev[payload.agentId]
      if (existing && existing.length === payload.commands.length && existing.every((c, i) => c === payload.commands[i])) return prev
      return { ...prev, [payload.agentId]: payload.commands }
    })
  }

  const handleExpertPlanUpdate = (payload: {
    agentId: string
    chatId?: string
    sessionId: string
    plan: { entries: Array<{ content: string; status: 'pending' | 'in_progress' | 'completed'; priority?: 'low' | 'medium' | 'high' }> }
  }) => {
    if (!isCurrentChatEvent(payload)) return
    if (!payload?.agentId || !payload?.plan) return
    setAgentPlans((prev) => ({ ...prev, [payload.agentId]: payload.plan }))
  }

  const handleExpertModeChange = (payload: { agentId: string; chatId?: string; sessionId: string; currentModeId: string }) => {
    if (!isCurrentChatEvent(payload)) return
    if (!payload?.agentId || !payload?.currentModeId) return
    setAgentModes((prev) => {
      if (prev[payload.agentId] === payload.currentModeId) return prev
      return { ...prev, [payload.agentId]: payload.currentModeId }
    })
  }

  const handleExpertCommandsUpdate = (payload: { agentId: string; chatId?: string; sessionId: string; availableCommands: string[] }) => {
    if (!isCurrentChatEvent(payload)) return
    if (!payload?.agentId || !Array.isArray(payload.availableCommands)) return
    setAgentAvailableCommands((prev) => {
      const existing = prev[payload.agentId]
      if (existing && existing.length === payload.availableCommands.length && existing.every((c, i) => c === payload.availableCommands[i])) return prev
      return { ...prev, [payload.agentId]: payload.availableCommands }
    })
  }

  const handleExpertSessionInfo = (payload: { agentId: string; chatId?: string; sessionId: string; title?: string; updatedAt?: string }) => {
    if (!isCurrentChatEvent(payload)) return
    if (!payload?.agentId) return
    setAgentSessionInfo((prev) => ({
      ...prev,
      [payload.agentId]: { title: payload.title, updatedAt: payload.updatedAt },
    }))
  }

  return {
    handleExpertActivity,
    handleExpertExit,
    handleExpertResumeFailed,
    handleExpertError,
    handleVersionBlocked,
    handleExpertStarted,
    onExpertStructuredMessage,
    handleExpertPartialText,
    handleExpertSlashCommands,
    handleExpertPlanUpdate,
    handleExpertModeChange,
    handleExpertCommandsUpdate,
    handleExpertSessionInfo,
    flushDeltaBuffer,
    cleanupDeltaTimer,
  }
}

export type AgentEventHandlers = ReturnType<typeof createAgentEventHandlers>
export { SYSTEM_MESSAGE_AGENT }
