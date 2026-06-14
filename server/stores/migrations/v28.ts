import type BetterSqlite3 from 'better-sqlite3'
import { getSchemaVersion } from './utils'
import { createLogger } from '../../lib/logger'

const log = createLogger('Migration:V28')

const tableExists = (db: BetterSqlite3.Database, name: string): boolean =>
  !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name)

const columnExists = (db: BetterSqlite3.Database, table: string, column: string): boolean => {
  if (!tableExists(db, table)) return false
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  return cols.some((c) => c.name === column)
}

/** Tables carrying the FK column `chat_id` that should become `mission_id` (WS-7 / C7.2). */
const CHAT_ID_TABLES = ['execution_logs', 'cron_job_executions', 'agent_memories', 'token_usage']

/**
 * V28 — close the chat→mission epoch (C7.2 + PR-F F6).
 *
 * C7.2: rename the `chat_id` FK column to `mission_id` on every table that
 *   carries it. SQLite RENAME COLUMN preserves data and rewrites the indexes /
 *   FK definitions that reference the column.
 *
 * F6: drop the v27 `chats` rollback-compat VIEW and its INSTEAD OF triggers.
 *   The single-bundled app has no client/server version skew, so the alias is
 *   no longer needed and pre-v27 rollback is intentionally given up.
 */
export const migrateToV28 = (db: BetterSqlite3.Database): void => {
  if (getSchemaVersion(db) >= 28) return

  db.transaction(() => {
    // C7.2: chat_id -> mission_id (guarded so re-runs / fresh canonical DBs no-op).
    for (const table of CHAT_ID_TABLES) {
      if (columnExists(db, table, 'chat_id') && !columnExists(db, table, 'mission_id')) {
        db.exec(`ALTER TABLE ${table} RENAME COLUMN chat_id TO mission_id`)
      }
    }

    // F6: drop the chats rollback-compat view + write-through triggers.
    db.exec('DROP TRIGGER IF EXISTS chats_instead_insert')
    db.exec('DROP TRIGGER IF EXISTS chats_instead_update')
    db.exec('DROP TRIGGER IF EXISTS chats_instead_delete')
    db.exec('DROP VIEW IF EXISTS chats')

    db.prepare("UPDATE _meta SET value = '28' WHERE key = 'schema_version'").run()
    log.info('Schema upgraded to V28: chat_id->mission_id, dropped chats compat view/triggers')
  })()
}
