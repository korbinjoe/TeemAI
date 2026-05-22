import { toast } from 'sonner'
import i18n from '@/i18n'
import type { Message, AgentActivity } from '../types/chat'
import { buildContentKey, buildMessageInstanceKey } from '../utils/messageDedup'

export interface ExpertEventContext {
  isCurrentChatEvent: (payload?: { chatId?: string }) => boolean
  addMessage: (msg: Message) => void
  uid: (prefix: string) => string
  t: (key: string, opts?: Record<string, unknown>) => string
  setExpertActivities: React.Dispatch<React.SetStateAction<Record<string, AgentActivity>>>
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
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

export const createExpertEventHandlers = (ctx: ExpertEventContext) => {
  const {
    isCurrentChatEvent, addMessage, uid, t,
    setExpertActivities, setMessages, setLoading, setThinking,
    setAgentSlashCommands, setAgentPlans, setAgentModes,
    setAgentAvailableCommands, setAgentSessionInfo,
  } = ctx

  const deltaBuffer = { messages: [] as Message[], replacedIds: new Set<string>() }
  let deltaFlushTimer: ReturnType<typeof setTimeout> | null = null
  const DELTA_FLUSH_MS = 16

  const flushDeltaBuffer = () => {
    deltaFlushTimer = null
    const { messages: batch, replacedIds } = deltaBuffer
    if (batch.length === 0) return
    const flushed = batch.splice(0)
    const ids = new Set(replacedIds)
    replacedIds.clear()

    setMessages((prev) => {
      const flushAgentIds = new Set(flushed.map((m) => m.agentId))
      const base = prev.filter((m) => !(m.streaming && m.agentId && flushAgentIds.has(m.agentId)))

      const existingInstanceKeys = new Set(base.map((m) => buildMessageInstanceKey(m)))
      const existingContentKeys = new Set<string>()
      for (const m of base) {
        const ck = buildContentKey(m)
        if (ck) existingContentKeys.add(ck)
      }
      const filtered = ids.size > 0 ? base.filter((m) => !ids.has(m.id)) : base
      const seenInBatch = new Set<string>()
      const seenContentInBatch = new Set<string>()
      const deduped = flushed.filter((m) => {
        const ik = buildMessageInstanceKey(m)
        if (existingInstanceKeys.has(ik) || seenInBatch.has(ik)) return false
        const ck = buildContentKey(m)
        if (ck && (existingContentKeys.has(ck) || seenContentInBatch.has(ck))) return false
        if (ck) seenContentInBatch.add(ck)
        seenInBatch.add(ik)
        return true
      })
      if (deduped.length === 0 && filtered.length === prev.length) return prev
      const merged: Message[] = []
      let i = 0, j = 0
      while (i < filtered.length && j < deduped.length) {
        if (filtered[i].timestamp <= deduped[j].timestamp) {
          merged.push(filtered[i++])
        } else {
          merged.push(deduped[j++])
        }
      }
      while (i < filtered.length) merged.push(filtered[i++])
      while (j < deduped.length) merged.push(deduped[j++])
      return merged
    })
  }

  const cleanupDeltaTimer = () => {
    if (deltaFlushTimer) {
      clearTimeout(deltaFlushTimer)
      deltaFlushTimer = null
    }
    flushDeltaBuffer()
  }

  const handleExpertActivity = (payload: { agentId: string; chatId?: string; activity: AgentActivity }) => {
    if (!isCurrentChatEvent(payload)) return
    if (!payload?.agentId || !payload?.activity) return
    setExpertActivities((prev) => {
      const existing = prev[payload.agentId]
      if (existing && isSameActivity(existing, payload.activity)) return prev
      return { ...prev, [payload.agentId]: payload.activity }
    })
  }

  const handleExpertExit = (payload: { agentId: string; chatId?: string; finalActivity?: AgentActivity }) => {
    if (!isCurrentChatEvent(payload)) return
    if (!payload?.agentId) return
    setExpertActivities((prev) => {
      if (!prev[payload.agentId]) return prev
      return {
        ...prev,
        [payload.agentId]: {
          ...(payload.finalActivity || prev[payload.agentId]),
          phase: 'completed' as const,
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
      addMessage({ id: uid('err'), role: 'agent', content: `Error: ${payload?.message ?? 'unknown'}`, timestamp: Date.now(), type: 'error' })
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
    if (payload.status === 'completed') return

    setExpertActivities((prev) => {
      const existing = prev[payload.agentId]
      if (existing && existing.phase !== 'completed' && existing.phase !== 'error') return prev
      const next: AgentActivity = {
        phase: 'initializing',
        background: false,
        toolCount: 0,
        toolCompleted: 0,
        hasText: false,
        updatedAt: Date.now(),
      }
      if (existing && isSameActivity(existing, next)) return prev
      return { ...prev, [payload.agentId]: next }
    })
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
      const agentOnly = payload.messages.filter((m) => m.role !== 'user')
      if (agentOnly.length === 0) return
      const tagged = agentOnly.map((m) => ({ ...m, agentId: payload.agentId }))

      deltaBuffer.messages.push(...tagged)
      if (payload.replacedStatsId) {
        deltaBuffer.replacedIds.add(payload.replacedStatsId)
      }
      if (!deltaFlushTimer) {
        deltaFlushTimer = setTimeout(flushDeltaBuffer, DELTA_FLUSH_MS)
      }
    } else {
      if (deltaFlushTimer) {
        clearTimeout(deltaFlushTimer)
        deltaFlushTimer = null
      }
      deltaBuffer.messages = deltaBuffer.messages.filter((m) => m.agentId !== payload.agentId)
      if (deltaBuffer.messages.length > 0) {
        deltaFlushTimer = setTimeout(flushDeltaBuffer, DELTA_FLUSH_MS)
      }

      const tagged = payload.messages.map((m) => {
        return { ...m, agentId: payload.agentId }
      })
      if (tagged.length === 0) return

      setMessages((prev) => {
        const replayUserIds = new Set(
          tagged.filter((m) => m.role === 'user').map((m) => m.jsonlUuid || m.id),
        )
        const replayUserContents = new Set(
          tagged.filter((m) => m.role === 'user').map((m) => m.content),
        )
        const maxReplayTs = tagged.reduce((max, m) => Math.max(max, m.timestamp), 0)
        const others = prev.filter((m) => {
          if (m.agentId === payload.agentId && m.role !== 'user') {
            return m.timestamp > maxReplayTs
          }
          if (m.streaming && m.agentId === payload.agentId) return false
          if (m.role === 'user') {
            if (m.jsonlUuid && replayUserIds.has(m.jsonlUuid)) return false
            if (replayUserIds.has(m.id)) return false
            if (replayUserContents.has(m.content)) return false
          }
          return true
        })
        const result: Message[] = []
        let i = 0, j = 0
        while (i < others.length && j < tagged.length) {
          if (others[i].timestamp <= tagged[j].timestamp) {
            result.push(others[i++])
          } else {
            result.push(tagged[j++])
          }
        }
        while (i < others.length) result.push(others[i++])
        while (j < tagged.length) result.push(tagged[j++])

        result.sort((a, b) => a.timestamp - b.timestamp)
        return result
      })
    }
  }

  const handleExpertPartialText = (payload: { agentId: string; chatId?: string; sessionId?: string; blockIndex: number; text: string }) => {
    if (!isCurrentChatEvent(payload)) return
    if (!payload?.agentId || !payload?.text) return
    if (deltaBuffer.messages.some((m) => m.agentId === payload.agentId)) return
    setMessages((prev) => {
      const last = prev[prev.length - 1]
      if (last?.role === 'agent' && last.agentId === payload.agentId && last.streaming) {
        const next = prev.slice()
        next[next.length - 1] = { ...last, content: last.content + payload.text }
        return next
      }
      return [...prev, {
        id: uid('stream'),
        role: 'agent',
        agentId: payload.agentId,
        content: payload.text,
        timestamp: Date.now(),
        type: 'text',
        streaming: true,
      }]
    })
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

export type ExpertEventHandlers = ReturnType<typeof createExpertEventHandlers>
