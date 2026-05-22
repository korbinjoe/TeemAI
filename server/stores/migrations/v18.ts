import type BetterSqlite3 from 'better-sqlite3'
import { getSchemaVersion } from './utils'
import { createLogger } from '../../lib/logger'

const log = createLogger('Migration:V18')

export function migrateToV18(db: BetterSqlite3.Database): void {
  if (getSchemaVersion(db) >= 18) return

  db.transaction(() => {
    const cols = db.prepare("PRAGMA table_info(chats)").all() as Array<{ name: string }>
    const names = cols.map(c => c.name)

    if (!names.includes('task_location'))
      db.exec("ALTER TABLE chats ADD COLUMN task_location TEXT DEFAULT 'local'")
    if (!names.includes('device_id'))
      db.exec("ALTER TABLE chats ADD COLUMN device_id TEXT")

    db.prepare("UPDATE _meta SET value = '18' WHERE key = 'schema_version'").run()
    log.info('Schema upgraded to V18: added task_location + device_id to chats')
  })()
}
