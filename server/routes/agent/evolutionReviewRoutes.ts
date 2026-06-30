import { Router } from 'express'
import type { EvolutionReviewJobStore } from '../../stores/EvolutionReviewJobStore'
import type { EvolutionReviewService } from '../../services/agent-evolution/EvolutionReviewService'

interface EvolutionReviewRouteDeps {
  reviewJobStore: EvolutionReviewJobStore
  reviewService: EvolutionReviewService
}

export const createEvolutionReviewRoutes = (deps: EvolutionReviewRouteDeps): Router => {
  const router = Router()

  router.get('/api/evolution/review-jobs', (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    res.json(deps.reviewJobStore.list({ status: status as never }))
  })

  router.post('/api/evolution/review-jobs/:id/approve', (req, res) => {
    try {
      res.json(deps.reviewService.approve(req.params.id))
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to approve review job' })
    }
  })

  router.post('/api/evolution/review-jobs/:id/reject', (req, res) => {
    try {
      res.json(deps.reviewService.reject(req.params.id))
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to reject review job' })
    }
  })

  router.post('/api/evolution/review-jobs/:id/apply', async (req, res) => {
    try {
      res.json(await deps.reviewService.apply(req.params.id))
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to apply review job' })
    }
  })

  router.post('/api/evolution/review-jobs/run-next', async (_req, res) => {
    const job = await deps.reviewService.runNext()
    res.json({ job })
  })

  return router
}
