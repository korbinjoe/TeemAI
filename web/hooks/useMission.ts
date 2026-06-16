/**
 * useMission — single-mission slice of useAllMissions.
 *
 * Returns the chat (with server-derived `members[]`) for a given missionId, plus
 * loading state. Used by V2 MissionOverview / GroupChat / WorkspaceToolbar to read
 * real data without each component refetching.
 *
 * Backed by useAllMissions so cache + WS subscriptions are shared.
 */

import { useEffect, useMemo, useState } from 'react'
import { useAllMissions } from './useAllMissions'
import { API_BASE, authFetch } from '@/config/api'
import type { Chat, MissionAgent } from '@/components/workspace/types'

export interface V2MissionResult {
  chat: Chat | null
  members: MissionAgent[]
  loading: boolean
}

export const useMission = (missionId: string | null | undefined): V2MissionResult => {
  const { chats, loading } = useAllMissions()
  const [fallbackChat, setFallbackChat] = useState<Chat | null>(null)
  const [fallbackLoading, setFallbackLoading] = useState(false)

  const cachedChat = useMemo(
    () => missionId ? chats.find((c) => c.id === missionId) ?? null : null,
    [chats, missionId],
  )

  useEffect(() => {
    if (!missionId || cachedChat) {
      setFallbackChat(null)
      setFallbackLoading(false)
      return
    }
    let cancelled = false
    setFallbackLoading(true)
    authFetch(`${API_BASE}/api/missions/${encodeURIComponent(missionId)}`)
      .then(async (res) => {
        if (!res.ok) return null
        return await res.json() as Chat
      })
      .then((chat) => {
        if (!cancelled) setFallbackChat(chat)
      })
      .catch(() => {
        if (!cancelled) setFallbackChat(null)
      })
      .finally(() => {
        if (!cancelled) setFallbackLoading(false)
      })
    return () => { cancelled = true }
  }, [missionId, cachedChat])

  return useMemo(() => {
    const chat = cachedChat ?? fallbackChat
    return {
      chat,
      members: chat?.members ?? [],
      loading: loading || fallbackLoading,
    }
  }, [cachedChat, fallbackChat, loading, fallbackLoading])
}
