/**
 * Preferences REST API
 *
 * _meta
 * hired-agents ID
 */

import { Router } from 'express'
import type BetterSqlite3 from 'better-sqlite3'

interface PreferencesRouteDeps {
  db: BetterSqlite3.Database
}

const META_KEY_HIRED_IDS = 'hired_agent_ids'
const META_KEY_HIRED_INIT = 'hired_agents_initialized'
const META_KEY_AVATAR_STYLE = 'avatar_style'

const VALID_AVATAR_STYLES = ['default', 'brush']

export const createPreferencesRoutes = ({ db }: PreferencesRouteDeps): Router => {
  const router = Router()

  const getMeta = (key: string): string | undefined => {
    const row = db.prepare('SELECT value FROM _meta WHERE key = ?').get(key) as { value: string } | undefined
    return row?.value
  }

  const setMeta = (key: string, value: string) => {
    db.prepare('INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)').run(key, value)
  }

  /** GET /api/preferences/hired-agents */
  router.get('/api/preferences/hired-agents', (_req, res) => {
    const raw = getMeta(META_KEY_HIRED_IDS)
    const initialized = getMeta(META_KEY_HIRED_INIT) === 'true'
    let ids: string[] = []
    if (raw) {
      try { ids = JSON.parse(raw) } catch { /* ignore */ }
    }
    res.json({ ids, initialized })
  })

  /** PUT /api/preferences/hired-agents */
  router.put('/api/preferences/hired-agents', (req, res) => {
    const { ids } = req.body as { ids: string[] }
    if (!Array.isArray(ids)) {
      res.status(400).json({ error: 'ids must be an array' })
      return
    }
    setMeta(META_KEY_HIRED_IDS, JSON.stringify(ids))
    setMeta(META_KEY_HIRED_INIT, 'true')
    res.json({ ids })
  })

  /** GET /api/preferences/avatar-style */
  router.get('/api/preferences/avatar-style', (_req, res) => {
    const style = getMeta(META_KEY_AVATAR_STYLE) || 'default'
    res.json({ style })
  })

  /** PUT /api/preferences/avatar-style */
  router.put('/api/preferences/avatar-style', (req, res) => {
    const { style } = req.body as { style: string }
    if (!VALID_AVATAR_STYLES.includes(style)) {
      res.status(400).json({ error: 'Invalid style' })
      return
    }
    setMeta(META_KEY_AVATAR_STYLE, style)
    res.json({ style })
  })

  return router
}
