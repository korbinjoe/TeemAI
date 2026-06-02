import { useCallback, useEffect, useState } from 'react'
import { API_BASE, authFetch } from '@/config/api'
import { getWebSocketClient } from '@/services/WebSocketClient'
import type { ChatActivityPayload } from '@/types/chat'
import type { Chat } from '@/components/workspace/types'
import { ACTIVE_PHASES, reconcileMembersFromActivity } from '@/lib/memberStatus'

export const useMobileMissions = () => {
  const [missions, setMissions] = useState<Chat[]>([])
  const [workspaceNames, setWorkspaceNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const wsRes = await authFetch(`${API_BASE}/api/workspaces`)
      if (!wsRes.ok) return
      const workspaces: { id: string; name: string }[] = await wsRes.json()

      const nameMap: Record<string, string> = {}
      for (const w of workspaces) nameMap[w.id] = w.name
      setWorkspaceNames(nameMap)

      const results = await Promise.all(
        workspaces.map(async (w) => {
          const r = await authFetch(`${API_BASE}/api/workspaces/${w.id}/chats`)
          if (!r.ok) return [] as Chat[]
          return (await r.json()) as Chat[]
        }),
      )
      setMissions(results.flat())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    const ws = getWebSocketClient()
    ws.connect().catch(() => {})

    const handleStatusChanged = ({ chatId, status }: { chatId: string; status: string }) => {
      setMissions((prev) =>
        prev.map((c) => (c.id === chatId ? { ...c, status: status as Chat['status'] } : c)),
      )
    }

    const handleActivity = (payload: ChatActivityPayload) => {
      const { chatId, phase } = payload
      setMissions((prev) =>
        prev.map((c) => {
          if (c.id !== chatId) return c
          const updated = { ...c } as Chat & { missionStatus?: string }
          if (phase === 'completed') { updated.status = 'stopped'; updated.waitingReason = undefined }
          else if (phase === 'error') { updated.status = 'stopped'; updated.waitingReason = undefined }
          else if (phase === 'waiting_input') {
            updated.status = 'idle'
            updated.waitingReason = payload.latestMessage?.text
          } else if (phase === 'waiting_confirmation') {
            updated.status = 'idle'
            updated.waitingReason = payload.latestMessage?.text
          } else if (ACTIVE_PHASES.has(phase)) {
            updated.status = 'running'
            updated.waitingReason = undefined
          }
          updated.members = reconcileMembersFromActivity(c.members, payload)
          return updated
        }),
      )
    }

    const handleTitleUpdated = ({ chatId, title }: { chatId: string; title: string }) => {
      setMissions((prev) =>
        prev.map((c) => (c.id === chatId ? { ...c, title } : c)),
      )
    }

    ws.on('chat:status-changed', handleStatusChanged)
    ws.on('chat:activity', handleActivity)
    ws.on('chat:title-updated', handleTitleUpdated)

    const handleVisibility = () => { if (!document.hidden) void refresh() }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      ws.off('chat:status-changed', handleStatusChanged)
      ws.off('chat:activity', handleActivity)
      ws.off('chat:title-updated', handleTitleUpdated)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [refresh])

  return { missions, loading, refresh, workspaceNames }
}
