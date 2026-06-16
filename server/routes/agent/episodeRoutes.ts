import { Router } from 'express'
import type { EpisodicMemoryService } from '../../services/agent-evolution/EpisodicMemoryService'

export const createEpisodeRoutes = (episodicMemoryService: EpisodicMemoryService): Router => {
  const router = Router()

  router.get('/api/episodes/search', (req, res) => {
    const agentId = typeof req.query.agentId === 'string' ? req.query.agentId : ''
    const query = typeof req.query.q === 'string' ? req.query.q : ''
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 3
    if (!agentId || !query) {
      res.status(400).json({ error: 'agentId and q are required' })
      return
    }
    res.json({
      episodes: episodicMemoryService.search(agentId, query, Number.isFinite(limit) ? limit : 3),
    })
  })

  return router
}
