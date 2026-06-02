import { useState, useEffect } from 'react'
import { API_BASE, authFetch } from '@/config/api'

export interface AgentStats {
  totalTasks: number
  successRate: number
}

export type TeamStatsMap = Record<string, AgentStats>

const useTeamStats = () => {
  const [stats, setStats] = useState<TeamStatsMap>({})

  useEffect(() => {
    authFetch(`${API_BASE}/api/agents/team-stats`)
      .then((res) => res.ok ? res.json() : {})
      .then(setStats)
      .catch(() => {})
  }, [])

  return stats
}

export default useTeamStats
