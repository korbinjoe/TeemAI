import type BetterSqlite3 from 'better-sqlite3'
import { getSchemaVersion } from './utils'
import { createLogger } from '../../lib/logger'

const log = createLogger('Migration:V5')

/** V5  claudeSessionId → cliSessionIdmulti-CLI provider  */
export function migrateToV5(db: BetterSqlite3.Database): void {
  if (getSchemaVersion(db) >= 5) return

  db.transaction(() => {
    db.prepare(`
      UPDATE chats
      SET expert_sessions = REPLACE(expert_sessions, '"claudeSessionId":', '"cliSessionId":')
      WHERE expert_sessions IS NOT NULL AND expert_sessions LIKE '%"claudeSessionId":%'
    `).run()

    db.prepare("UPDATE _meta SET value = '5' WHERE key = 'schema_version'").run()
    log.info('Schema upgraded to V5: claudeSessionId → cliSessionId in expert_sessions')
  })()
}
