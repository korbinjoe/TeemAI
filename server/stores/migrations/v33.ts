import type BetterSqlite3 from 'better-sqlite3'
import { getSchemaVersion } from './utils'
import { createLogger } from '../../lib/logger'

const log = createLogger('Migration:V33')

export const migrateToV33 = (db: BetterSqlite3.Database): void => {
  if (getSchemaVersion(db) >= 33) return

  db.transaction(() => {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_chats_workspace_last_message
      ON missions(workspace_id, last_message_at DESC);
    `)

    db.prepare("UPDATE _meta SET value = '33' WHERE key = 'schema_version'").run()
    log.info('Schema upgraded to V33: mission workspace recency index')
  })()
}
