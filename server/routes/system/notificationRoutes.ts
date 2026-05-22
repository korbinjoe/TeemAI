import { Router } from 'express'
import type { NotificationStore } from '../../stores/NotificationStore'

interface NotificationRoutesDeps {
  notificationStore: NotificationStore
  broadcast: (msg: Record<string, unknown>) => void
}

export const createNotificationRoutes = ({ notificationStore, broadcast }: NotificationRoutesDeps): Router => {
  const router = Router()

  router.get('/api/notifications', (req, res) => {
    if (req.query.unread === 'true') {
      return res.json(notificationStore.listUnread())
    }
    res.json(notificationStore.list())
  })

  router.post('/api/notifications/:id/read', async (req, res) => {
    await notificationStore.markRead(req.params.id)
    broadcast({ type: 'notification:read', payload: { id: req.params.id } })
    res.json({ ok: true })
  })

  router.post('/api/notifications/read-all', async (_req, res) => {
    await notificationStore.markAllRead()
    broadcast({ type: 'notification:read-all', payload: {} })
    res.json({ ok: true })
  })

  router.delete('/api/notifications/:id', async (req, res) => {
    const removed = await notificationStore.remove(req.params.id)
    if (!removed) return res.status(404).json({ error: 'Notification not found' })
    res.json({ ok: true })
  })

  router.delete('/api/notifications/read', async (_req, res) => {
    await notificationStore.clearRead()
    res.json({ ok: true })
  })

  return router
}
