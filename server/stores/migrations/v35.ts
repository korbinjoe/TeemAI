import type BetterSqlite3 from 'better-sqlite3'
import { getSchemaVersion } from './utils'
import { createLogger } from '../../lib/logger'

const log = createLogger('Migration:V35')

export const migrateToV35 = (db: BetterSqlite3.Database): void => {
  if (getSchemaVersion(db) >= 35) return

  db.transaction(() => {
    const columns = db.prepare('PRAGMA table_info(episodes)').all() as Array<{ name: string }>
    const names = new Set(columns.map((column) => column.name))

    if (!names.has('lesson')) {
      db.exec('ALTER TABLE episodes ADD COLUMN lesson TEXT')
    }
    if (!names.has('has_lesson')) {
      db.exec('ALTER TABLE episodes ADD COLUMN has_lesson INTEGER NOT NULL DEFAULT 0')
    }

    db.prepare("UPDATE _meta SET value = '35' WHERE key = 'schema_version'").run()
    log.info('Schema upgraded to V35: episode lessons')
  })()
}
