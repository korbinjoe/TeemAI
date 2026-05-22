/**
 * Admin REST API
 *
 *  SQLite
 *  SQL
 */

import { Router } from 'express'
import type BetterSqlite3 from 'better-sqlite3'

interface AdminRouteDeps {
  db: BetterSqlite3.Database
}

export const createAdminRoutes = ({ db }: AdminRouteDeps): Router => {
  const router = Router()

  const getAllTableNames = (): string[] => {
    const rows = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all() as Array<{ name: string }>
    return rows.map((r) => r.name)
  }

  router.get('/api/admin/tables', (_req, res) => {
    const tables = getAllTableNames()
    res.json({ tables })
  })

  /** GET /api/admin/tables/:tableName —  +  */
  router.get('/api/admin/tables/:tableName', (req, res) => {
    const { tableName } = req.params
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50))

    const validTables = getAllTableNames()
    if (!validTables.includes(tableName)) {
      res.status(404).json({ error: `Table "${tableName}" not found` })
      return
    }

    const columns = db.prepare(`PRAGMA table_info("${tableName}")`).all() as Array<{
      cid: number
      name: string
      type: string
      notnull: number
      dflt_value: string | null
      pk: number
    }>

    const countRow = db.prepare(`SELECT COUNT(*) as total FROM "${tableName}"`).get() as { total: number }
    const total = countRow.total

    const offset = (page - 1) * pageSize
    const rows = db.prepare(`SELECT * FROM "${tableName}" ORDER BY rowid DESC LIMIT ? OFFSET ?`).all(pageSize, offset)

    res.json({
      tableName,
      columns,
      rows,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  })

  return router
}
