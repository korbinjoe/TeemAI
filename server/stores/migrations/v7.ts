import type BetterSqlite3 from 'better-sqlite3'
import { getSchemaVersion } from './utils'
import { createLogger } from '../../lib/logger'

const log = createLogger('Migration:V7')

export function migrateToV7(db: BetterSqlite3.Database): void {
  if (getSchemaVersion(db) >= 7) return

  db.transaction(() => {
    const cols = (db.prepare("PRAGMA table_info(agents)").all() as Array<{ name: string }>).map((c) => c.name)
    if (!cols.includes('provider')) {
      db.exec('ALTER TABLE agents ADD COLUMN provider TEXT')
    }

    db.prepare("UPDATE _meta SET value = '7' WHERE key = 'schema_version'").run()
    log.info('Schema upgraded to V7: added provider column to agents')
  })()
}
