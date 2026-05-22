import { useCallback, useEffect, useState } from 'react'
import type { AgentSummary } from '../types/agentConfig'
import type { ChatActivityPayload } from '../types/chat'
import type { RecentChat, WorkspaceInfo } from '../components/home/types'
import { API_BASE, authFetch } from '@/config/api'
import { getWebSocketClient } from '@/services/WebSocketClient'
import { sortAgents, initDefaultHiredAgents } from '../utils/teamStorage'

export const useHomeData = () => {
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([])
  const [recentChats, setRecentChats] = useState<RecentChat[]>([])
  const [agents, setAgents] = useState<AgentSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    setLoading(true)
    const loadData = async () => {
      try {
        const [ws, chats, agentList] = await Promise.all([
          authFetch(`${API_BASE}/api/workspaces`, { signal }).then((r) => r.ok ? r.json() : []).catch(() => []),
          authFetch(`${API_BASE}/api/chats/recent?limit=8`, { signal }).then((r) => r.ok ? r.json() : []).catch(() => []),
          authFetch(`${API_BASE}/api/agents`, { signal }).then((r) => r.ok ? r.json() : []).catch(() => []),
        ])
        if (signal.aborted) return
        setWorkspaces(ws)
        setRecentChats(chats)
        const hiredIds = await initDefaultHiredAgents(agentList)
        const hired = hiredIds.length > 0
          ? agentList.filter((a: AgentSummary) => hiredIds.includes(a.id))
          : agentList
        setAgents(sortAgents(hired))
      } finally {
        if (!signal.aborted) setLoading(false)
      }
    }
    loadData()
    return () => controller.abort()
  }, [])

  const refreshRecentChats = useCallback(() => {
    authFetch(`${API_BASE}/api/chats/recent?limit=8`)
      .then((r) => r.ok ? r.json() : null)
      .then((chats) => { if (chats) setRecentChats(chats) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const wsClient = getWebSocketClient()
    wsClient.connect().catch(() => {})

    const handleChatStatusChanged = ({ chatId, status, taskStatus }: { chatId: string; status: string; taskStatus?: string }) => {
      setRecentChats((prev) =>
        prev.map((chat) => chat.id === chatId
          ? { ...chat, status, taskStatus: taskStatus ?? chat.taskStatus, activity: (status === 'stopped') ? undefined : chat.activity }
          : chat),
      )
    }

    const handleChatActivity = (payload: ChatActivityPayload) => {
      const { chatId, ...activity } = payload
      const isActive = ['thinking', 'tool_running', 'responding', 'initializing'].includes(activity.phase)
      const isTerminal = activity.phase === 'completed' || activity.phase === 'error'
      const isIdle = activity.phase === 'waiting_input' || activity.phase === 'waiting_confirmation'
      setRecentChats((prev) =>
        prev.map((chat) => {
          if (chat.id !== chatId) return chat
          if (isTerminal) return {
            ...chat, activity: undefined, status: 'stopped',
            taskStatus: activity.phase === 'error' ? 'error' : 'success',
          }
          if (isIdle) return {
            ...chat, activity, status: 'idle',
            taskStatus: activity.phase === 'waiting_confirmation' ? 'waiting_confirm' : 'waiting_input',
          }
          if (isActive) return { ...chat, activity, status: 'running', taskStatus: 'running' }
          return { ...chat, activity }
        }),
      )
    }

    wsClient.on('chat:status-changed', handleChatStatusChanged)
    wsClient.on('chat:activity', handleChatActivity)

    const timer = setInterval(() => {
      if (!document.hidden) refreshRecentChats()
    }, 60_000)
    const handleVisibility = () => { if (!document.hidden) refreshRecentChats() }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      wsClient.off('chat:status-changed', handleChatStatusChanged)
      wsClient.off('chat:activity', handleChatActivity)
      clearInterval(timer)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [refreshRecentChats])

  return { workspaces, setWorkspaces, recentChats, agents, setAgents, loading }
}
