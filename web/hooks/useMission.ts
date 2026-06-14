/**
 * useMission — single-mission slice of useAllMissions.
 *
 * Returns the chat (with server-derived `members[]`) for a given missionId, plus
 * loading state. Used by V2 MissionOverview / GroupChat / WorkspaceToolbar to read
 * real data without each component refetching.
 *
 * Backed by useAllMissions so cache + WS subscriptions are shared.
 */

import { useMemo } from 'react'
import { useAllMissions } from './useAllMissions'
import type { Chat, MissionAgent } from '@/components/workspace/types'

export interface V2MissionResult {
  chat: Chat | null
  members: MissionAgent[]
  loading: boolean
}

export const useMission = (missionId: string | null | undefined): V2MissionResult => {
  const { chats, loading } = useAllMissions()
  return useMemo(() => {
    const chat = missionId ? chats.find((c) => c.id === missionId) ?? null : null
    return {
      chat,
      members: chat?.members ?? [],
      loading,
    }
  }, [chats, missionId, loading])
}
