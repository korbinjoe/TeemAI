import type BetterSqlite3 from 'better-sqlite3'
import { getSchemaVersion } from './utils'
import { createLogger } from '../../lib/logger'

const log = createLogger('Migration:V16')

/**
 * V16 chats
 *
 * - whiteboard_path:  ~/.openteam/whiteboard/{chatId}/entries.jsonl
 * - whiteboard_goal:  active goal  summary JSONL
 *
 *  JSONL / SQLite
 */
export function migrateToV16(db: BetterSqlite3.Database): void {
  if (getSchemaVersion(db) >= 16) return

  db.transaction(() => {
    const cols = (db.prepare("PRAGMA table_info(chats)").all() as Array<{ name: string }>)
      .map((c) => c.name)

    if (!cols.includes('whiteboard_path')) {
      db.exec("ALTER TABLE chats ADD COLUMN whiteboard_path TEXT")
    }
    if (!cols.includes('whiteboard_goal')) {
      db.exec("ALTER TABLE chats ADD COLUMN whiteboard_goal TEXT")
    }

    db.prepare("UPDATE _meta SET value = '16' WHERE key = 'schema_version'").run()
    log.info('Schema upgraded to V16: chats.whiteboard_path / whiteboard_goal')
  })()
}
