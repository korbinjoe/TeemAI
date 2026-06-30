import type BetterSqlite3 from 'better-sqlite3'
import { getSchemaVersion } from './utils'
import { createLogger } from '../../lib/logger'

const log = createLogger('Migration:V34')

export const migrateToV34 = (db: BetterSqlite3.Database): void => {
  if (getSchemaVersion(db) >= 34) return

  db.transaction(() => {
    const columns = db.prepare('PRAGMA table_info(evolution_review_jobs)').all() as Array<{ name: string }>
    const names = new Set(columns.map((column) => column.name))

    if (!names.has('applied_actions_json')) {
      db.exec('ALTER TABLE evolution_review_jobs ADD COLUMN applied_actions_json TEXT')
    }

    db.prepare("UPDATE _meta SET value = '34' WHERE key = 'schema_version'").run()
    log.info('Schema upgraded to V34: evolution review applied actions')
  })()
}
