import { Router } from 'express'
import type { TokenUsageStore } from '../../stores/TokenUsageStore'

export const createTokenUsageRoutes = ({ tokenUsageStore }: { tokenUsageStore: TokenUsageStore }) => {
  const router = Router()

  router.get('/api/chats/:chatId/token-usage', (req, res) => {
    const records = tokenUsageStore.listByChat(req.params.chatId)
    res.json(records)
  })

  router.get('/api/workspaces/:id/token-usage', (req, res) => {
    const since = req.query.since as string | undefined
    const summary = tokenUsageStore.summaryByWorkspace(req.params.id, since)
    res.json(summary)
  })

  router.get('/api/token-usage/daily', (req, res) => {
    const days = Number(req.query.days) || 7
    const summary = tokenUsageStore.dailySummary(days)
    res.json(summary)
  })

  return router
}
