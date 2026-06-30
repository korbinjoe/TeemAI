/**
 * useWorkspaceMissions — Live list of chats belonging to a workspace, used as
 * the "missions" data source in workspace sidebar/cards.
 *
 * Backed by a single shared provider (WorkspaceChatsProvider) that owns one
 * fetch + one set of WS subscriptions (chat:status-changed, chat:activity,
 * chat:title-updated) and the teemai:chat-* / visibility listeners, scoped per
 * workspaceId. Each consuming component registers its workspaceId (refcounted);
 * the first registration triggers the single fetch, and every WS event updates
 * the shared store once instead of re-running one reducer per consumer.
 *
 * The hook keeps its original return shape so all call sites are untouched.
 */

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { API_BASE, authFetch } from '@/config/api'
import { getWebSocketClient } from '@/services/WebSocketClient'
import type { ChatActivityPayload } from '@/types/chat'
import type { Chat } from '@/components/workspace/types'
import { ACTIVE_PHASES, reconcileAgentsFromActivity } from '@/lib/agentStatus'

const WAITING_TASK_STATUSES = new Set(['waiting_input', 'waiting_confirm'])

export interface WorkspaceChatsResult {
  chats: Chat[]
  loading: boolean
  refresh: () => Promise<void>
  /** Chats currently waiting for the user (input or confirmation). */
  awaitingReview: Chat[]
  /** Chats actively running an agent. */
  running: Chat[]
  /** Chats stopped/idle but not awaiting user. */
  done: Chat[]
}

interface WorkspaceSlice {
  chats: Chat[]
  loading: boolean
}

const EMPTY_SLICE: WorkspaceSlice = { chats: [], loading: false }

interface ChatIndexEntry {
  workspaceId: string
  index: number
}

interface WorkspaceChatsStore {
  slices: Record<string, WorkspaceSlice>
  register: (workspaceId: string) => () => void
  refresh: (workspaceId: string) => Promise<void>
}

const WorkspaceChatsContext = createContext<WorkspaceChatsStore | null>(null)

const buildChatIndex = (slices: Record<string, WorkspaceSlice>): Map<string, ChatIndexEntry> => {
  const index = new Map<string, ChatIndexEntry>()
  for (const [workspaceId, slice] of Object.entries(slices)) {
    slice.chats.forEach((chat, i) => index.set(chat.id, { workspaceId, index: i }))
  }
  return index
}

const indexWorkspaceChats = (
  existing: Map<string, ChatIndexEntry>,
  workspaceId: string,
  chats: Chat[],
): Map<string, ChatIndexEntry> => {
  const next = new Map(existing)
  for (const [chatId, entry] of next.entries()) {
    if (entry.workspaceId === workspaceId) next.delete(chatId)
  }
  chats.forEach((chat, i) => next.set(chat.id, { workspaceId, index: i }))
  return next
}

export const WorkspaceChatsProvider = ({ children }: { children: ReactNode }) => {
  const [slices, setSlices] = useState<Record<string, WorkspaceSlice>>({})
  const refCounts = useRef<Record<string, number>>({})
  const chatIndexRef = useRef<Map<string, ChatIndexEntry>>(new Map())
  const pendingActivityRef = useRef<Map<string, ChatActivityPayload>>(new Map())
  const activityFrameRef = useRef<number | null>(null)

  const refresh = useCallback(async (workspaceId: string) => {
    if (!workspaceId) return
    setSlices((prev) => ({
      ...prev,
      [workspaceId]: { ...(prev[workspaceId] ?? EMPTY_SLICE), loading: true },
    }))
    try {
      const res = await authFetch(`${API_BASE}/api/workspaces/${workspaceId}/chats`)
      if (!res.ok) return
      const data: Chat[] = await res.json()
      chatIndexRef.current = indexWorkspaceChats(chatIndexRef.current, workspaceId, data)
      setSlices((prev) => ({ ...prev, [workspaceId]: { chats: data, loading: false } }))
    } finally {
      setSlices((prev) => {
        const slice = prev[workspaceId]
        if (!slice || !slice.loading) return prev
        return { ...prev, [workspaceId]: { ...slice, loading: false } }
      })
    }
  }, [])

  const register = useCallback((workspaceId: string) => {
    const count = (refCounts.current[workspaceId] ?? 0) + 1
    refCounts.current[workspaceId] = count
    if (count === 1) void refresh(workspaceId)
    return () => {
      const next = (refCounts.current[workspaceId] ?? 1) - 1
      if (next > 0) {
        refCounts.current[workspaceId] = next
        return
      }
      delete refCounts.current[workspaceId]
      chatIndexRef.current = indexWorkspaceChats(chatIndexRef.current, workspaceId, [])
      setSlices((prev) => {
        if (!(workspaceId in prev)) return prev
        const { [workspaceId]: _removed, ...rest } = prev
        return rest
      })
    }
  }, [refresh])

  const updateChatById = useCallback((chatId: string, updater: (chat: Chat) => Chat) => {
    setSlices((prev) => {
      let entry = chatIndexRef.current.get(chatId)
      if (!entry || prev[entry.workspaceId]?.chats[entry.index]?.id !== chatId) {
        chatIndexRef.current = buildChatIndex(prev)
        entry = chatIndexRef.current.get(chatId)
      }
      if (!entry) return prev

      const slice = prev[entry.workspaceId]
      const current = slice?.chats[entry.index]
      if (!slice || current?.id !== chatId) return prev

      const updated = updater(current)
      if (updated === current) return prev

      const nextChats = slice.chats.slice()
      nextChats[entry.index] = updated
      return {
        ...prev,
        [entry.workspaceId]: { ...slice, chats: nextChats },
      }
    })
  }, [])

  const applyActivityPayload = useCallback((payload: ChatActivityPayload) => {
    const { chatId, phase } = payload
    updateChatById(chatId, (c) => {
      const updated = { ...c } as Chat & { missionStatus?: string }
      if (phase === 'completed') { updated.status = 'stopped'; updated.missionStatus = 'success'; updated.waitingReason = undefined }
      else if (phase === 'error') { updated.status = 'stopped'; updated.missionStatus = 'error'; updated.waitingReason = undefined }
      else if (phase === 'waiting_input') {
        updated.status = 'idle'; updated.missionStatus = 'waiting_input'
        updated.waitingReason = payload.latestMessage?.text
      }
      else if (phase === 'waiting_confirmation') {
        updated.status = 'idle'; updated.missionStatus = 'waiting_confirm'
        updated.waitingReason = payload.latestMessage?.text
      }
      else if (ACTIVE_PHASES.has(phase)) { updated.status = 'running'; updated.missionStatus = 'running'; updated.waitingReason = undefined }
      updated.members = reconcileAgentsFromActivity(c.members, payload)
      if (updated.status === c.status
        && updated.missionStatus === (c as Chat & { missionStatus?: string }).missionStatus
        && updated.waitingReason === c.waitingReason
        && updated.members === c.members) {
        return c
      }
      return updated
    })
  }, [updateChatById])

  const flushActivityQueue = useCallback(() => {
    activityFrameRef.current = null
    if (pendingActivityRef.current.size === 0) return
    const payloads = Array.from(pendingActivityRef.current.values())
    pendingActivityRef.current.clear()
    for (const payload of payloads) applyActivityPayload(payload)
  }, [applyActivityPayload])

  const scheduleActivityFlush = useCallback(() => {
    if (activityFrameRef.current != null) return
    const requestFrame = window.requestAnimationFrame ?? ((cb: FrameRequestCallback) => window.setTimeout(() => cb(performance.now()), 16))
    activityFrameRef.current = requestFrame(flushActivityQueue)
  }, [flushActivityQueue])

  useEffect(() => {
    const wsClient = getWebSocketClient()
    wsClient.connect().catch(() => {})

    const handleStatusChanged = ({ chatId, status, taskStatus }: { chatId: string; status: string; taskStatus?: string }) => {
      updateChatById(chatId, (chat) => {
        if (chat.status === status && (!taskStatus || (chat as Chat & { missionStatus?: string }).missionStatus === taskStatus)) return chat
        return { ...chat, status: status as Chat['status'], ...(taskStatus ? { missionStatus: taskStatus } : {}) } as Chat
      })
    }

    const handleActivity = (payload: ChatActivityPayload) => {
      if (ACTIVE_PHASES.has(payload.phase)) {
        pendingActivityRef.current.set(payload.chatId, payload)
        scheduleActivityFlush()
        return
      }
      pendingActivityRef.current.delete(payload.chatId)
      applyActivityPayload(payload)
    }

    const handleTitleUpdated = ({ chatId, title }: { chatId: string; title: string }) => {
      updateChatById(chatId, (chat) => {
        if (chat.title === title) return chat
        return { ...chat, title } as Chat
      })
    }

    wsClient.on('mission.status-changed', handleStatusChanged)
    wsClient.on('mission.activity', handleActivity)
    wsClient.on('mission.title-updated', handleTitleUpdated)

    // Refresh every registered workspace on tab re-focus to catch new/deleted
    // chats (no dedicated WS event for create/delete).
    const refreshRegistered = () => {
      for (const wid of Object.keys(refCounts.current)) void refresh(wid)
    }
    const handleVisibility = () => { if (!document.hidden) refreshRegistered() }
    document.addEventListener('visibilitychange', handleVisibility)

    // Local DOM events dispatched by callers that just mutated chats
    // (NewChatForm after create, AddAgentPicker after teamAgentIds update).
    // A single event triggers at most one /chats refresh for the named
    // workspace (or all registered workspaces when unspecified).
    const handleChatMutated = (e: Event) => {
      const detail = (e as CustomEvent<{ workspaceId?: string }>).detail
      const wid = detail?.workspaceId
      if (wid) {
        if (refCounts.current[wid]) void refresh(wid)
      } else {
        refreshRegistered()
      }
    }
    window.addEventListener('teemai:chat-created', handleChatMutated)
    window.addEventListener('teemai:chat-updated', handleChatMutated)

    return () => {
      if (activityFrameRef.current != null) {
        const cancelFrame = window.cancelAnimationFrame ?? window.clearTimeout
        cancelFrame(activityFrameRef.current)
        activityFrameRef.current = null
      }
      pendingActivityRef.current.clear()
      wsClient.off('mission.status-changed', handleStatusChanged)
      wsClient.off('mission.activity', handleActivity)
      wsClient.off('mission.title-updated', handleTitleUpdated)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('teemai:chat-created', handleChatMutated)
      window.removeEventListener('teemai:chat-updated', handleChatMutated)
    }
  }, [applyActivityPayload, flushActivityQueue, refresh, scheduleActivityFlush, updateChatById])

  const store = useMemo<WorkspaceChatsStore>(() => ({ slices, register, refresh }), [slices, register, refresh])

  return createElement(WorkspaceChatsContext.Provider, { value: store }, children)
}

export const useWorkspaceMissions = (workspaceId: string | null | undefined): WorkspaceChatsResult => {
  const store = useContext(WorkspaceChatsContext)
  if (!store) {
    throw new Error('useWorkspaceMissions must be used within a WorkspaceChatsProvider')
  }
  const { slices, register, refresh: storeRefresh } = store

  useEffect(() => {
    if (!workspaceId) return
    return register(workspaceId)
  }, [workspaceId, register])

  const slice = (workspaceId ? slices[workspaceId] : undefined) ?? EMPTY_SLICE
  const chats = slice.chats

  const refresh = useCallback(async () => {
    if (!workspaceId) return
    await storeRefresh(workspaceId)
  }, [workspaceId, storeRefresh])

  const awaitingReview = useMemo(() => chats.filter((c) => {
    const missionStatus = (c as Chat & { missionStatus?: string }).missionStatus
    return missionStatus && WAITING_TASK_STATUSES.has(missionStatus)
  }), [chats])
  const running = useMemo(() => chats.filter((c) => c.status === 'running'), [chats])
  const done = useMemo(() => chats.filter((c) => c.status === 'stopped' || c.status === 'merged'), [chats])

  return { chats, loading: slice.loading, refresh, awaitingReview, running, done }
}
