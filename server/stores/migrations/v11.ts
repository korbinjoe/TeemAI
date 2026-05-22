import type BetterSqlite3 from 'better-sqlite3'
import { getSchemaVersion } from './utils'
import { createLogger } from '../../lib/logger'

const log = createLogger('Migration:V11')

/** V11  workspace_templates  */
export function migrateToV11(db: BetterSqlite3.Database): void {
  if (getSchemaVersion(db) >= 11) return

  db.transaction(() => {
    db.exec('DROP TABLE IF EXISTS workspace_templates')
    db.exec('DROP TABLE IF EXISTS team_presets')

    db.prepare("UPDATE _meta SET value = '11' WHERE key = 'schema_version'").run()
    log.info('Schema upgraded to V11: dropped workspace_templates + team_presets')
  })()
}
