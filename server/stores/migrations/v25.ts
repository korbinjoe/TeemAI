import type BetterSqlite3 from 'better-sqlite3'
import { getSchemaVersion } from './utils'
import { createLogger } from '../../lib/logger'

const log = createLogger('Migration:V25')

export function migrateToV25(db: BetterSqlite3.Database): void {
  if (getSchemaVersion(db) >= 25) return

  db.transaction(() => {
    const cols = db.prepare('PRAGMA table_info(workspaces)').all() as Array<{ name: string }>
    const names = cols.map((c) => c.name)

    if (!names.includes('hidden_at'))
      db.exec('ALTER TABLE workspaces ADD COLUMN hidden_at INTEGER')

    db.prepare("UPDATE _meta SET value = '25' WHERE key = 'schema_version'").run()
    log.info('Schema upgraded to V25: workspaces.hidden_at')
  })()
}
