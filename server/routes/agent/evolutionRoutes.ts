import { Router } from 'express'
import type { MemoryStore } from '../../stores/MemoryStore'

type EvolutionType = 'skill_acquired' | 'memory_updated' | 'strategy_evolved' | 'milestone'

interface EvolutionEntry {
  id: string
  type: EvolutionType
  title: string
  description: string
  agentName: string
  timestamp: number
}

interface EvolutionRouteDeps {
  memoryStore: MemoryStore
}

const EVOLUTION_LIMIT = 100

export const createEvolutionRoutes = (deps: EvolutionRouteDeps): Router => {
  const router = Router()
  const { memoryStore } = deps

  router.get('/api/agents/:id/evolution', (req, res) => {
    const agentId = req.params.id
    const entries: EvolutionEntry[] = []

    const memories = memoryStore.listByAgent(agentId)
    for (const mem of memories) {
      entries.push({
        id: `mem-${mem.id}`,
        type: 'memory_updated' as EvolutionType,
        title: mem.category,
        description: mem.content.slice(0, 160),
        agentName: agentId,
        timestamp: new Date(mem.updatedAt).getTime(),
      })
    }

    entries.sort((a, b) => b.timestamp - a.timestamp)
    res.json(entries.slice(0, EVOLUTION_LIMIT))
  })

  return router
}
