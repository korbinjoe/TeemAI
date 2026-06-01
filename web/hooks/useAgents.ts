import { useState, useEffect, useCallback, useMemo } from 'react'
import type { AgentSummary, AgentPersonality } from '../types/agentConfig'
import { API_BASE, authFetch } from '@/config/api'
import { parseInstanceId } from '../../shared/utils'
import { initDefaultHiredAgents } from '@/utils/teamStorage'

const instanceFallbackHandler = <T,>(): ProxyHandler<Record<string, T>> => ({
  get(target, prop, receiver) {
    if (typeof prop !== 'string') return Reflect.get(target, prop, receiver)
    if (prop in target) return target[prop]
    const { baseId } = parseInstanceId(prop)
    return baseId !== prop ? target[baseId] : undefined
  },
})

/**
 * Agent  +
 * -  API  Agent
 * -  selectedAgentId  targetAgentIdper-instance  localStorage
 *    Tab  ls  agent
 * -  agent —  useChatWebSocket  workspace init
 *   (primary → fullstack-engineer → first) effect
 * -  agentNames / agentPersonalities
 */
export const useAgents = () => {
  const [availableAgents, setAvailableAgents] = useState<AgentSummary[]>([])
  const [hiredAgentIds, setHiredAgentIds] = useState<string[]>([])
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
      .then((agents: AgentSummary[]) => {
        setAvailableAgents(agents)
        initDefaultHiredAgents(agents as Array<AgentSummary & { source: string }>).then(setHiredAgentIds)
      })
      .catch(() => {})
  }, [availableAgents.length])

  const hiredAgents = useMemo(
    () => availableAgents.filter((a) => hiredAgentIds.includes(a.id)),
    [availableAgents, hiredAgentIds],
  )

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
    return new Proxy(map, instanceFallbackHandler<string>())
  }, [availableAgents])

  const resolveAgentName = useCallback((id: string): string => {
    const direct = agentNames[id]
    if (direct) return direct
    const { baseId } = parseInstanceId(id)
    return agentNames[baseId] ?? id
  }, [agentNames])

  const agentPersonalities = useMemo(() => {
    const map: Record<string, AgentPersonality> = {}
    for (const a of availableAgents) {
      if (a.personality) map[a.id] = a.personality
    }
    return new Proxy(map, instanceFallbackHandler<AgentPersonality>())
  }, [availableAgents])

  return {
    availableAgents,
    hiredAgents,
    setAvailableAgents,
    selectedAgentId,
    targetAgentId,
    setTargetAgentId,
    handleSetSelectedAgentId,
    currentAgentName,
    agentNames,
    resolveAgentName,
    agentPersonalities,
  }
}
