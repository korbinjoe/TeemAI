import { Router } from 'express'
import type { LanAccessController } from '../../lan/LanAccessController'

export const createLanRoutes = (lanAccess: LanAccessController): Router => {
  const router = Router()

  router.post('/api/lan/enable', (_req, res) => {
    const result = lanAccess.enable()
    res.json(result)
  })

  router.post('/api/lan/disable', (_req, res) => {
    lanAccess.disable()
    res.json({ ok: true })
  })

  router.get('/api/lan/status', (_req, res) => {
    res.json(lanAccess.getStatus())
  })

  return router
}
