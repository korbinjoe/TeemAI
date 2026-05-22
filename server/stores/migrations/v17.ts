import type BetterSqlite3 from 'better-sqlite3'
import { getSchemaVersion } from './utils'
import { createLogger } from '../../lib/logger'

const log = createLogger('Migration:V17')

/**
 * V17
 *
 *  /  /  / Tab Toast
 *  chat_*
 */
export function migrateToV17(db: BetterSqlite3.Database): void {
  if (getSchemaVersion(db) >= 17) return

  db.transaction(() => {
    const result = db
      .prepare("DELETE FROM notifications WHERE category LIKE 'chat\\_%' ESCAPE '\\'")
      .run()

    db.prepare("UPDATE _meta SET value = '17' WHERE key = 'schema_version'").run()
    log.info(`Schema upgraded to V17: removed ${result.changes} chat_* notifications`)
  })()
}
