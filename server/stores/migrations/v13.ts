import type BetterSqlite3 from 'better-sqlite3'
import { getSchemaVersion } from './utils'
import { createLogger } from '../../lib/logger'

const log = createLogger('Migration:V13')

/** V13 execution_logs token  JSON TEXT  4  */
export function migrateToV13(db: BetterSqlite3.Database): void {
  if (getSchemaVersion(db) >= 13) return

  db.transaction(() => {
    const cols = (db.prepare("PRAGMA table_info(execution_logs)").all() as Array<{ name: string }>).map((c) => c.name)
    if (!cols.includes('input_tokens')) {
      db.exec('ALTER TABLE execution_logs ADD COLUMN input_tokens INTEGER NOT NULL DEFAULT 0')
    }
    if (!cols.includes('output_tokens')) {
      db.exec('ALTER TABLE execution_logs ADD COLUMN output_tokens INTEGER NOT NULL DEFAULT 0')
    }
    if (!cols.includes('cache_read_tokens')) {
      db.exec('ALTER TABLE execution_logs ADD COLUMN cache_read_tokens INTEGER NOT NULL DEFAULT 0')
    }
    if (!cols.includes('cache_creation_tokens')) {
      db.exec('ALTER TABLE execution_logs ADD COLUMN cache_creation_tokens INTEGER NOT NULL DEFAULT 0')
    }

    const rows = db.prepare(
      "SELECT id, total_tokens FROM execution_logs WHERE total_tokens IS NOT NULL"
    ).all() as Array<{ id: string; total_tokens: string }>
    const update = db.prepare(
      'UPDATE execution_logs SET input_tokens = ?, output_tokens = ?, cache_read_tokens = ?, cache_creation_tokens = ? WHERE id = ?'
    )
    for (const row of rows) {
      try {
        const t = JSON.parse(row.total_tokens) as { input?: number; output?: number; cacheRead?: number; cacheCreation?: number }
        update.run(t.input || 0, t.output || 0, t.cacheRead || 0, t.cacheCreation || 0, row.id)
      } catch { /* skip malformed */ }
    }

    if (cols.includes('total_tokens')) {
      db.exec('ALTER TABLE execution_logs DROP COLUMN total_tokens')
    }

    db.prepare("UPDATE _meta SET value = '13' WHERE key = 'schema_version'").run()
    log.info('Schema upgraded to V13: execution_logs token fields split into 4 columns')
  })()
}
