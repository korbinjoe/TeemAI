import { Router } from 'express'
import type { EventStore } from '../../stores/EventStore'

export const createEventRoutes = (store: EventStore): Router => {
  const router = Router()

  router.get('/api/events', (req, res) => {
    const { category, event, from, to, limit } = req.query
    const results = store.query({
      category: category as string | undefined,
      event: event as string | undefined,
      from: from as string | undefined,
      to: to as string | undefined,
      limit: limit ? Number(limit) : undefined,
    })
    res.json(results)
  })

  return router
}
