import type BetterSqlite3 from 'better-sqlite3'
import { getSchemaVersion } from './utils'
import { createLogger } from '../../lib/logger'

const log = createLogger('Migration:V10')

export function migrateToV10(db: BetterSqlite3.Database): void {
  if (getSchemaVersion(db) >= 10) return

  db.transaction(() => {
    db.exec('DROP TABLE IF EXISTS team_presets')
    db.exec('DROP TABLE IF EXISTS workspace_templates')

    db.prepare("UPDATE _meta SET value = '10' WHERE key = 'schema_version'").run()
    log.info('Schema upgraded to V10: dropped team_presets + workspace_templates')
  })()
}
