import type BetterSqlite3 from 'better-sqlite3'
import { getSchemaVersion } from './utils'
import { createLogger } from '../../lib/logger'

const log = createLogger('Migration:V29')

const tableExists = (db: BetterSqlite3.Database, name: string): boolean =>
  !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name)

const columnExists = (db: BetterSqlite3.Database, table: string, column: string): boolean => {
  if (!tableExists(db, table)) return false
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  return cols.some((c) => c.name === column)
}

/**
 * V29 — WS-3a persisted axes for agents.
 *
 * AgentStore reads/writes `transport` and `surface` alongside `provider`; v27
 * only normalized legacy provider values and did not add these columns.
 */
export const migrateToV29 = (db: BetterSqlite3.Database): void => {
  if (getSchemaVersion(db) >= 29) return

  db.transaction(() => {
    if (tableExists(db, 'agents')) {
      if (!columnExists(db, 'agents', 'transport')) {
        db.exec('ALTER TABLE agents ADD COLUMN transport TEXT')
      }
      if (!columnExists(db, 'agents', 'surface')) {
        db.exec('ALTER TABLE agents ADD COLUMN surface TEXT')
      }
    }

    db.prepare("UPDATE _meta SET value = '29' WHERE key = 'schema_version'").run()
    log.info('Schema upgraded to V29: agents.transport + agents.surface')
  })()
}
