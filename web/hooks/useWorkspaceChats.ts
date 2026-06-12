/**
 * useWorkspaceChats — Live list of chats belonging to a workspace, used as
 * the "missions" data source in workspace sidebar/cards.
 *
 * Subscribes to chat:status-changed and chat:activity WS events so counts and
 * statuses stay live without polling.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { API_BASE, authFetch } from '@/config/api'
import { getWebSocketClient } from '@/services/WebSocketClient'
import type { ChatActivityPayload } from '@/types/chat'
import type { Chat } from '@/components/workspace/types'
import { ACTIVE_PHASES, reconcileMembersFromActivity } from '@/lib/memberStatus'

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

export const useWorkspaceChats = (workspaceId: string | null | undefined): WorkspaceChatsResult => {
  const [chats, setChats] = useState<Chat[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      setChats([])
      return
    }
    setLoading(true)
    try {
      const res = await authFetch(`${API_BASE}/api/workspaces/${workspaceId}/chats`)
      if (!res.ok) return
      const data: Chat[] = await res.json()
      setChats(data)
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    if (!workspaceId) return
    const wsClient = getWebSocketClient()
    wsClient.connect().catch(() => {})

    const handleStatusChanged = ({ chatId, status, taskStatus }: { chatId: string; status: string; taskStatus?: string }) => {
      setChats((prev) => {
        let changed = false
        const next = prev.map((c) => {
          if (c.id !== chatId) return c
          if (c.status === status && (!taskStatus || (c as Chat & { missionStatus?: string }).missionStatus === taskStatus)) return c
          changed = true
          return { ...c, status: status as Chat['status'], ...(taskStatus ? { missionStatus: taskStatus } : {}) } as Chat
        })
        return changed ? next : prev
      })
    }

    const handleActivity = (payload: ChatActivityPayload) => {
      const { chatId, phase } = payload
      setChats((prev) => {
        let changed = false
        const next = prev.map((c) => {
          if (c.id !== chatId) return c
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
          updated.members = reconcileMembersFromActivity(c.members, payload)
          if (updated.status === c.status
            && updated.missionStatus === (c as Chat & { missionStatus?: string }).missionStatus
            && updated.waitingReason === c.waitingReason
            && updated.members === c.members) {
            return c
          }
          changed = true
          return updated
        })
        return changed ? next : prev
      })
    }

    const handleTitleUpdated = ({ chatId, title }: { chatId: string; title: string }) => {
      setChats((prev) => {
        let changed = false
        const next = prev.map((c) => {
          if (c.id !== chatId) return c
          if (c.title === title) return c
          changed = true
          return { ...c, title } as Chat
        })
        return changed ? next : prev
      })
    }

    wsClient.on('chat:status-changed', handleStatusChanged)
    wsClient.on('chat:activity', handleActivity)
    wsClient.on('chat:title-updated', handleTitleUpdated)

    // Poll on visibility change to catch new/deleted chats (no dedicated WS event)
    const handleVisibility = () => { if (!document.hidden) void refresh() }
    document.addEventListener('visibilitychange', handleVisibility)

    // Local DOM events dispatched by callers that just mutated chats
    // (NewChatForm after create, AddAgentPicker after teamAgentIds update).
    // Keeps sidebar/quad in sync without a dedicated WS broadcast.
    const handleChatMutated = (e: Event) => {
      const detail = (e as CustomEvent<{ workspaceId?: string }>).detail
      if (!detail || !detail.workspaceId || detail.workspaceId === workspaceId) {
        void refresh()
      }
    }
    window.addEventListener('teemai:chat-created', handleChatMutated)
    window.addEventListener('teemai:chat-updated', handleChatMutated)

    return () => {
      wsClient.off('chat:status-changed', handleStatusChanged)
      wsClient.off('chat:activity', handleActivity)
      wsClient.off('chat:title-updated', handleTitleUpdated)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('teemai:chat-created', handleChatMutated)
      window.removeEventListener('teemai:chat-updated', handleChatMutated)
    }
  }, [workspaceId, refresh])

  const awaitingReview = useMemo(() => chats.filter((c) => {
    const missionStatus = (c as Chat & { missionStatus?: string }).missionStatus
    return missionStatus && WAITING_TASK_STATUSES.has(missionStatus)
  }), [chats])
  const running = useMemo(() => chats.filter((c) => c.status === 'running'), [chats])
  const done = useMemo(() => chats.filter((c) => c.status === 'stopped' || c.status === 'merged'), [chats])

  return { chats, loading, refresh, awaitingReview, running, done }
}
