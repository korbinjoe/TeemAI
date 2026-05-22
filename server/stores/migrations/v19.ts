import type BetterSqlite3 from 'better-sqlite3'
import { getSchemaVersion } from './utils'
import { createLogger } from '../../lib/logger'

const log = createLogger('Migration:V19')

export function migrateToV19(db: BetterSqlite3.Database): void {
  if (getSchemaVersion(db) >= 19) return

  db.transaction(() => {
    const cols = db.prepare("PRAGMA table_info(chats)").all() as Array<{ name: string }>
    const names = cols.map(c => c.name)

    if (!names.includes('last_agent_id'))
      db.exec("ALTER TABLE chats ADD COLUMN last_agent_id TEXT")

    db.prepare("UPDATE _meta SET value = '19' WHERE key = 'schema_version'").run()
    log.info('Schema upgraded to V19: added last_agent_id to chats')
  })()
}
