import { Router } from 'express'
import type { CronJobStore } from '../../stores/CronJobStore'
import type { CronScheduler } from '../../services/cron/CronScheduler'
import type { NLCronParser } from '../../services/cron/NLCronParser'
import type { WorkspaceStore } from '../../stores/WorkspaceStore'
import type { AgentStore } from '../../stores/AgentStore'
import { createLogger } from '../../lib/logger'

const log = createLogger('CronJobRoutes')

interface CronJobRoutesDeps {
  cronJobStore: CronJobStore
  cronScheduler: CronScheduler
  nlCronParser: NLCronParser
  workspaceStore: WorkspaceStore
  agentStore: AgentStore
}

export const createCronJobRoutes = ({ cronJobStore, cronScheduler, nlCronParser, workspaceStore, agentStore }: CronJobRoutesDeps): Router => {
  const router = Router()

  router.get('/api/cron-jobs', (_req, res) => {
    res.json(cronJobStore.list())
  })

  router.get('/api/cron-jobs/:id', (req, res) => {
    const job = cronJobStore.get(req.params.id)
    if (!job) return res.status(404).json({ error: 'Job not found' })
    res.json(job)
  })

  router.post('/api/cron-jobs', async (req, res) => {
    try {
      const { name, description, workspaceId, agentId, model, trigger, prompt, retryOnFailure, maxRetries } = req.body
      if (!name || !workspaceId || !trigger || !prompt) {
        return res.status(400).json({ error: 'Missing required fields: name, workspaceId, trigger, prompt' })
      }
      const job = await cronJobStore.create({
        name, description, workspaceId, agentId, model,
        trigger, prompt, retryOnFailure, maxRetries,
      })
      res.status(201).json(job)
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Create failed' })
    }
  })

  router.put('/api/cron-jobs/:id', async (req, res) => {
    try {
      const allowedFields = ['name', 'description', 'workspaceId', 'agentId', 'model', 'trigger', 'prompt', 'retryOnFailure', 'maxRetries']
      const updates: Record<string, unknown> = {}
      for (const key of allowedFields) {
        if (req.body[key] !== undefined) updates[key] = req.body[key]
      }
      const job = await cronJobStore.update(req.params.id, updates)
      if (!job) return res.status(404).json({ error: 'Job not found' })
      res.json(job)
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Update failed' })
    }
  })

  router.delete('/api/cron-jobs/:id', async (req, res) => {
    const removed = await cronJobStore.remove(req.params.id)
    if (!removed) return res.status(404).json({ error: 'Job not found' })
    res.json({ ok: true })
  })

  router.post('/api/cron-jobs/:id/enable', async (req, res) => {
    const job = cronJobStore.get(req.params.id)
    if (!job) return res.status(404).json({ error: 'Job not found' })
    await cronJobStore.setEnabled(req.params.id, true)
    res.json({ ok: true })
  })

  router.post('/api/cron-jobs/:id/disable', async (req, res) => {
    const job = cronJobStore.get(req.params.id)
    if (!job) return res.status(404).json({ error: 'Job not found' })
    await cronJobStore.setEnabled(req.params.id, false)
    res.json({ ok: true })
  })

  router.post('/api/cron-jobs/:id/run-now', async (req, res) => {
    try {
      await cronScheduler.runNow(req.params.id)
      res.json({ ok: true })
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Run failed' })
    }
  })

  router.get('/api/cron-jobs/:id/executions', (req, res) => {
    const job = cronJobStore.get(req.params.id)
    if (!job) return res.status(404).json({ error: 'Job not found' })
    res.json(job.executions)
  })

  router.post('/api/cron-jobs/parse-nl', async (req, res) => {
    try {
      const { input } = req.body as { input: string }
      if (!input || typeof input !== 'string') {
        return res.status(400).json({ success: false, error: 'input string is required' })
      }
      if (input.length > 2000) {
        return res.status(400).json({ success: false, error: 'input too long (max 2000 chars)' })
      }

      const workspaces = workspaceStore.list().map((ws) => ({
        id: ws.id,
        name: ws.name,
      }))
      const agents = agentStore.list()
        .map((a) => ({ name: a.name, description: a.description }))

      const result = await nlCronParser.parse(input, workspaces, agents)
      res.json(result)
    } catch (err) {
      log.error('NLCronParser error', { error: err instanceof Error ? err.message : String(err) })
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Parse failed',
      })
    }
  })

  return router
}
