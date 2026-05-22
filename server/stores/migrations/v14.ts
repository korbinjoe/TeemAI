import type BetterSqlite3 from 'better-sqlite3'
import { getSchemaVersion } from './utils'
import { createLogger } from '../../lib/logger'

const log = createLogger('Migration:V14')

/**
 * V14 chats  task_status  task_summary
 *
 * task_status:  PTY
 * task_summary: JSON
 */
export function migrateToV14(db: BetterSqlite3.Database): void {
  if (getSchemaVersion(db) >= 14) return

  db.transaction(() => {
    const cols = (db.prepare("PRAGMA table_info(chats)").all() as Array<{ name: string }>)
      .map((c) => c.name)

    if (!cols.includes('task_status')) {
      db.exec("ALTER TABLE chats ADD COLUMN task_status TEXT")
    }
    if (!cols.includes('task_summary')) {
      db.exec("ALTER TABLE chats ADD COLUMN task_summary TEXT")
    }

    db.exec(`
      UPDATE chats SET task_status = CASE
        WHEN status = 'running' THEN 'running'
        WHEN status = 'idle' THEN 'waiting_input'
        WHEN status = 'stopped' THEN 'success'
        WHEN status = 'merged' THEN 'success'
        ELSE NULL
      END
      WHERE task_status IS NULL
    `)

    db.prepare("UPDATE _meta SET value = '14' WHERE key = 'schema_version'").run()
    log.info('Schema upgraded to V14: chats.task_status + chats.task_summary')
  })()
}
