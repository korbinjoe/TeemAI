/**
 * Memory & Growth REST API
 *
 * Agent  CRUD
 */

import { Router } from 'express'
import type { MemoryStore } from '../../stores/MemoryStore'
import type { GrowthStore } from '../../stores/GrowthStore'
import type { MemoryCategory, GrowthMetric } from '../../config/types'

interface MemoryRouteDeps {
  memoryStore: MemoryStore
  growthStore: GrowthStore
}

export const createMemoryRoutes = (deps: MemoryRouteDeps): Router => {
  const router = Router()
  const { memoryStore, growthStore } = deps

  // ── Memory APIs ──

  router.get('/api/agents/:id/memories', (req, res) => {
    const { category } = req.query
    const memories = category
      ? memoryStore.listByCategory(req.params.id, category as MemoryCategory)
      : memoryStore.listByAgent(req.params.id)
    res.json(memories)
  })

  router.post('/api/agents/:id/memories', async (req, res) => {
    const { content, category, source, chatId, importance } = req.body
    if (!content) {
      res.status(400).json({ error: 'content is required' })
      return
    }
    const memory = await memoryStore.create({
      agentId: req.params.id,
      content,
      category,
      source,
      chatId,
      importance,
    })
    res.status(201).json(memory)
  })

  router.put('/api/agents/:agentId/memories/:memoryId', async (req, res) => {
    const { content, category, importance } = req.body
    const updated = await memoryStore.update(req.params.memoryId, { content, category, importance })
    if (!updated) {
      res.status(404).json({ error: 'Memory not found' })
      return
    }
    res.json(updated)
  })

  router.delete('/api/agents/:agentId/memories/:memoryId', async (req, res) => {
    const deleted = await memoryStore.remove(req.params.memoryId)
    res.json({ deleted })
  })

  router.delete('/api/agents/:id/memories', async (req, res) => {
    const count = await memoryStore.clearByAgent(req.params.id)
    res.json({ cleared: count })
  })

  // ── Growth APIs ──

  router.get('/api/agents/:id/growth', (req, res) => {
    const metrics = growthStore.listByAgent(req.params.id)
    const totalXP = growthStore.getTotalXP(req.params.id)
    const overallLevel = growthStore.getOverallLevel(req.params.id)
    res.json({ metrics, totalXP, overallLevel })
  })

  router.post('/api/agents/:id/growth/:metric', async (req, res) => {
    const { amount } = req.body
    const metric = req.params.metric as GrowthMetric
    const result = await growthStore.increment(req.params.id, metric, amount ?? 1)
    res.json(result)
  })

  return router
}
