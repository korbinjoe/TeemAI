import { useState, useEffect, useRef } from 'react'
import { WebSocketClient } from '@/services/WebSocketClient'
import { getWsUrl } from '@/config/api'

export interface AgentStatusInfo {
  agentId: string
  agentName: string
  phase: string
  currentTool?: string
  toolCount: number
  toolCompleted: number
  cost?: number
}

export interface ChatActivityInfo {
  chatId: string
  phase: string
  currentTool?: string
  toolCount: number
  toolCompleted: number
  cost?: number
  expertActivities?: AgentStatusInfo[]
}

export interface NotchNotification {
  id: string
  title: string
  body: string
  createdAt: string
}

export const useAgentStatus = () => {
  const [chatActivity, setChatActivity] = useState<ChatActivityInfo | null>(null)
  const [notifications, setNotifications] = useState<NotchNotification[]>([])
  const wsRef = useRef<WebSocketClient | null>(null)

  useEffect(() => {
    const ws = new WebSocketClient(getWsUrl())
    wsRef.current = ws
    ws.connect()

    ws.on('chat:activity', (data) => {
      setChatActivity(data as ChatActivityInfo)
    })

    ws.on('notification:new', (data) => {
      const n = data as NotchNotification
      setNotifications((prev) => [n, ...prev].slice(0, 5))

      window.notchBridge?.onNotification?.(() => {})
    })

    return () => {
      ws.disconnect()
      wsRef.current = null
    }
  }, [])

  const activeAgents: AgentStatusInfo[] = chatActivity?.expertActivities ?? []

  const agentSummary = activeAgents.map((a) => ({
    agentId: a.agentId,
    agentName: a.agentName,
    phase: a.phase,
    currentTool: a.currentTool,
    toolCount: a.toolCount,
    toolCompleted: a.toolCompleted,
    cost: a.cost,
  }))

  return {
    chatActivity,
    agents: agentSummary,
    notifications,
  }
}
