import { Router } from 'express'
import type { MemoryStore } from '../../stores/MemoryStore'
import type { EvolutionEventStore, EvolutionEventType } from '../../stores/EvolutionEventStore'

type EvolutionType = EvolutionEventType

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
  evolutionEventStore?: EvolutionEventStore
}

const EVOLUTION_LIMIT = 100

export const createEvolutionRoutes = (deps: EvolutionRouteDeps): Router => {
  const router = Router()
  const { memoryStore, evolutionEventStore } = deps

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

    const eventEntries = evolutionEventStore?.listByAgent(agentId, EVOLUTION_LIMIT) ?? []
    for (const event of eventEntries) {
      entries.push({
        id: `event-${event.id}`,
        type: event.type,
        title: event.title,
        description: event.description,
        agentName: event.agentId,
        timestamp: new Date(event.createdAt).getTime(),
      })
    }

    entries.sort((a, b) => b.timestamp - a.timestamp)
    res.json(entries.slice(0, EVOLUTION_LIMIT))
  })

  return router
}
