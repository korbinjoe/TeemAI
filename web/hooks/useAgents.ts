import { useState, useEffect, useCallback, useMemo } from 'react'
import type { AgentSummary, AgentPersonality } from '../types/agentConfig'
import { API_BASE, authFetch } from '@/config/api'

/**
 * Agent  +
 * -  API  Agent
 * -  selectedAgentId  targetAgentIdper-instance  localStorage
 *    Tab  ls  agent
 * -  agent —  useChatWebSocket  workspace init
 *   (primary → fullstack-product-engineer → first) effect
 * -  agentNames / agentPersonalities
 */
export const useAgents = () => {
  const [availableAgents, setAvailableAgents] = useState<AgentSummary[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [targetAgentId, setTargetAgentId] = useState<string | null>(null)

  const handleSetSelectedAgentId = useCallback((id: string | null) => {
    setSelectedAgentId(id)
    setTargetAgentId(id)
  }, [])

  useEffect(() => {
    if (availableAgents.length > 0) return
    authFetch(`${API_BASE}/api/agents`)
      .then((res) => res.ok ? res.json() : Promise.reject(new Error()))
      .then((agents: AgentSummary[]) => setAvailableAgents(agents))
      .catch(() => {})
  }, [availableAgents.length])

  const currentAgentName = useMemo(() => {
    const id = targetAgentId || selectedAgentId
    const agent = availableAgents.find((a) => a.id === id)
    return agent?.name || 'Agent'
  }, [availableAgents, selectedAgentId, targetAgentId])

  const agentNames = useMemo(() => {
    const map: Record<string, string> = {}
    for (const a of availableAgents) {
      map[a.id] = a.name
    }
    return map
  }, [availableAgents])

  const agentPersonalities = useMemo(() => {
    const map: Record<string, AgentPersonality> = {}
    for (const a of availableAgents) {
      if (a.personality) map[a.id] = a.personality
    }
    return map
  }, [availableAgents])

  return {
    availableAgents,
    setAvailableAgents,
    selectedAgentId,
    targetAgentId,
    setTargetAgentId,
    handleSetSelectedAgentId,
    currentAgentName,
    agentNames,
    agentPersonalities,
  }
}
