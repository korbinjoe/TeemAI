/**
 * useAllMissions — Cross-workspace mission list for the V2 sidebar.
 *
 * Aggregates chats from every workspace and tags each with its workspace meta
 * (id + name) so the sidebar can group missions by workspace. Stays live via the
 * same chat:status-changed / chat:activity WS events used by the per-workspace
 * hook, so a status change in any workspace updates the sidebar without polling.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { API_BASE, authFetch } from '@/config/api'
import { getWebSocketClient } from '@/services/WebSocketClient'
import type { ChatActivityPayload } from '@/types/chat'
import type { Chat, Workspace } from '@/components/workspace/types'
import { ACTIVE_PHASES, reconcileAgentsFromActivity } from '@/lib/agentStatus'

export interface WorkspaceLite {
  id: string
  name: string
  hiddenAt?: number | null
}

export interface V2AllChatsResult {
  chats: Chat[]
  workspaces: WorkspaceLite[]
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  refresh: () => Promise<void>
  loadMore: () => Promise<void>
}

const PAGE_LIMIT = 200

interface MissionPage {
  items: Chat[]
  nextOffset: number | null
  hasMore: boolean
}

type IndexedChat = Chat & {
  missionStatus?: string
  archivedAt?: number | null
  pinnedAt?: number | null
}

const parseMissionPage = async (res: Response): Promise<MissionPage> => {
  const body = await res.json()
  if (Array.isArray(body)) {
    return { items: body as Chat[], nextOffset: null, hasMore: false }
  }
  return {
    items: (body.items ?? []) as Chat[],
    nextOffset: typeof body.nextOffset === 'number' ? body.nextOffset : null,
    hasMore: body.hasMore === true,
  }
}

const mergeById = (base: Chat[], incoming: Chat[]): Chat[] => {
  if (incoming.length === 0) return base
  const seen = new Set(base.map((c) => c.id))
  const appended = incoming.filter((c) => {
    if (seen.has(c.id)) return false
    seen.add(c.id)
    return true
  })
  return appended.length === 0 ? base : [...base, ...appended]
}

const buildChatIndex = (items: Chat[]): Map<string, number> => {
  const index = new Map<string, number>()
  items.forEach((chat, i) => index.set(chat.id, i))
  return index
}

export const useAllMissions = (): V2AllChatsResult => {
  const [chats, setChats] = useState<Chat[]>([])
  const [workspaces, setWorkspaces] = useState<WorkspaceLite[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const requestSeq = useRef(0)
  const chatIndexRef = useRef<Map<string, number>>(new Map())
  const pendingActivityRef = useRef<Map<string, ChatActivityPayload>>(new Map())
  const activityFrameRef = useRef<number | null>(null)

  const updateChatById = useCallback((chatId: string, updater: (chat: Chat) => Chat) => {
    setChats((prev) => {
      let index = chatIndexRef.current.get(chatId)
      if (index == null || prev[index]?.id !== chatId) {
        chatIndexRef.current = buildChatIndex(prev)
        index = chatIndexRef.current.get(chatId)
      }
      if (index == null) return prev

      const current = prev[index]
      const updated = updater(current)
      if (updated === current) return prev

      const next = prev.slice()
      next[index] = updated
      return next
    })
  }, [])

  const refresh = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: String(PAGE_LIMIT), offset: '0' })
      const [wsRes, chatsRes] = await Promise.all([
        authFetch(`${API_BASE}/api/workspaces`),
        authFetch(`${API_BASE}/api/all-chats?${params}`),
      ])
      if (seq !== requestSeq.current) return
      if (wsRes.ok) {
        const wsData: Workspace[] = await wsRes.json()
        setWorkspaces(wsData.map((w) => ({ id: w.id, name: w.name, hiddenAt: w.hiddenAt })))
      }
      if (chatsRes.ok) {
        const page = await parseMissionPage(chatsRes)
        chatIndexRef.current = buildChatIndex(page.items)
        setChats(page.items)
        setNextOffset(page.hasMore ? page.nextOffset : null)
      }
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }, [])

  const loadMore = useCallback(async () => {
    if (nextOffset === null || loadingMore) return
    const seq = requestSeq.current
    setLoadingMore(true)
    try {
      const params = new URLSearchParams({ limit: String(PAGE_LIMIT), offset: String(nextOffset) })
      const res = await authFetch(`${API_BASE}/api/all-chats?${params}`)
      if (!res.ok || seq !== requestSeq.current) return
      const page = await parseMissionPage(res)
      setChats((prev) => {
        const merged = mergeById(prev, page.items)
        if (merged !== prev) chatIndexRef.current = buildChatIndex(merged)
        return merged
      })
      setNextOffset(page.hasMore ? page.nextOffset : null)
    } finally {
      if (seq === requestSeq.current) setLoadingMore(false)
    }
  }, [nextOffset, loadingMore])

  const applyActivityPayload = useCallback((payload: ChatActivityPayload) => {
    const { chatId, phase } = payload
    updateChatById(chatId, (chat) => {
      const current = chat as IndexedChat
      const updated = { ...chat } as IndexedChat
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
      updated.members = reconcileAgentsFromActivity(chat.members, payload)
      if (updated.status === chat.status
        && updated.missionStatus === current.missionStatus
        && updated.waitingReason === chat.waitingReason
        && updated.members === chat.members) {
        return chat
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

  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    const wsClient = getWebSocketClient()
    wsClient.connect().catch(() => {})

    const handleStatusChanged = ({ chatId, status, taskStatus }: { chatId: string; status: string; taskStatus?: string }) => {
      updateChatById(chatId, (chat) => {
        const current = chat as IndexedChat
        if (current.status === status && (!taskStatus || current.missionStatus === taskStatus)) return chat
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

    const handleMetaUpdated = ({ chatId, archivedAt, pinnedAt }: { chatId: string; archivedAt: number | null; pinnedAt: number | null }) => {
      updateChatById(chatId, (chat) => {
        const current = chat as IndexedChat
        if (current.archivedAt === archivedAt && current.pinnedAt === pinnedAt) return chat
        return { ...chat, archivedAt, pinnedAt } as Chat
      })
    }

    wsClient.on('mission.status-changed', handleStatusChanged)
    wsClient.on('mission.activity', handleActivity)
    wsClient.on('mission.title-updated', handleTitleUpdated)
    wsClient.on('mission.meta-updated', handleMetaUpdated)

    const handleVisibility = () => { if (!document.hidden) void refresh() }
    document.addEventListener('visibilitychange', handleVisibility)

    // Local DOM events from callers that just mutated chats (NewChatForm,
    // AddAgentPicker). Sidebar refreshes without waiting for a WS broadcast.
    const handleChatMutated = () => { void refresh() }
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
      wsClient.off('mission.meta-updated', handleMetaUpdated)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('teemai:chat-created', handleChatMutated)
      window.removeEventListener('teemai:chat-updated', handleChatMutated)
    }
  }, [applyActivityPayload, refresh, scheduleActivityFlush, updateChatById])

  return { chats, workspaces, loading, loadingMore, hasMore: nextOffset !== null, refresh, loadMore }
}
