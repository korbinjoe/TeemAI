import type BetterSqlite3 from 'better-sqlite3'
import { getSchemaVersion } from './utils'
import { createLogger } from '../../lib/logger'

const log = createLogger('Migration:V26')

export function migrateToV26(db: BetterSqlite3.Database): void {
  if (getSchemaVersion(db) >= 26) return

  db.transaction(() => {
    const cols = db.prepare('PRAGMA table_info(cron_jobs)').all() as Array<{ name: string }>
    const names = cols.map((c) => c.name)

    if (!names.includes('expires_at'))
      db.exec('ALTER TABLE cron_jobs ADD COLUMN expires_at TEXT')

    db.prepare("UPDATE _meta SET value = '26' WHERE key = 'schema_version'").run()
    log.info('Schema upgraded to V26: cron_jobs.expires_at')
  })()
}
