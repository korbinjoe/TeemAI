import type BetterSqlite3 from 'better-sqlite3'
import { getSchemaVersion } from './utils'
import { createLogger } from '../../lib/logger'

const log = createLogger('Migration:V12')

export function migrateToV12(db: BetterSqlite3.Database): void {
  if (getSchemaVersion(db) >= 12) return

  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id          TEXT PRIMARY KEY,
        category    TEXT NOT NULL,
        event       TEXT NOT NULL,
        properties  TEXT,
        created_at  TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_category ON events(category);
      CREATE INDEX IF NOT EXISTS idx_events_event ON events(event);
      CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
    `)

    db.prepare("UPDATE _meta SET value = '12' WHERE key = 'schema_version'").run()
    log.info('Schema upgraded to V12: added events table')
  })()
}
