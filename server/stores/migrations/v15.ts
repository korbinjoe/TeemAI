import type BetterSqlite3 from 'better-sqlite3'
import { getSchemaVersion } from './utils'
import { createLogger } from '../../lib/logger'

const log = createLogger('Migration:V15')

/**
 * V15 execution_logs  synced_at
 *
 */
export function migrateToV15(db: BetterSqlite3.Database): void {
  if (getSchemaVersion(db) >= 15) return

  db.transaction(() => {
    const cols = (db.prepare("PRAGMA table_info(execution_logs)").all() as Array<{ name: string }>)
      .map((c) => c.name)

    if (!cols.includes('synced_at')) {
      db.exec("ALTER TABLE execution_logs ADD COLUMN synced_at TEXT")
    }

    db.prepare("UPDATE _meta SET value = '15' WHERE key = 'schema_version'").run()
    log.info('Schema upgraded to V15: execution_logs.synced_at')
  })()
}
