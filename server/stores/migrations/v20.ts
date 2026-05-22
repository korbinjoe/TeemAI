import type BetterSqlite3 from 'better-sqlite3'
import { getSchemaVersion } from './utils'
import { createLogger } from '../../lib/logger'

const log = createLogger('Migration:V20')

export function migrateToV20(db: BetterSqlite3.Database): void {
  if (getSchemaVersion(db) >= 20) return

  db.transaction(() => {
    const cols = db.prepare("PRAGMA table_info(chats)").all() as Array<{ name: string }>
    const names = cols.map(c => c.name)

    if (!names.includes('location_history'))
      db.exec("ALTER TABLE chats ADD COLUMN location_history TEXT")

    db.prepare("UPDATE _meta SET value = '20' WHERE key = 'schema_version'").run()
    log.info('Schema upgraded to V20: added location_history to chats')
  })()
}
