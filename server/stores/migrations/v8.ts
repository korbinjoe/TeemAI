import type BetterSqlite3 from 'better-sqlite3'
import { getSchemaVersion } from './utils'
import { createLogger } from '../../lib/logger'

const log = createLogger('Migration:V8')

export function migrateToV8(db: BetterSqlite3.Database): void {
  if (getSchemaVersion(db) >= 8) return

  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS token_usage (
        id                            TEXT PRIMARY KEY,
        chat_id                       TEXT NOT NULL,
        workspace_id                  TEXT NOT NULL,
        agent_id                      TEXT NOT NULL,
        model                         TEXT NOT NULL,
        input_tokens                  INTEGER NOT NULL DEFAULT 0,
        output_tokens                 INTEGER NOT NULL DEFAULT 0,
        cache_read_input_tokens       INTEGER NOT NULL DEFAULT 0,
        cache_creation_input_tokens   INTEGER NOT NULL DEFAULT 0,
        cost_usd                      REAL NOT NULL DEFAULT 0,
        turn_count                    INTEGER NOT NULL DEFAULT 0,
        synced_at                     TEXT,
        updated_at                    TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_token_usage_chat ON token_usage(chat_id);
      CREATE INDEX IF NOT EXISTS idx_token_usage_workspace ON token_usage(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_token_usage_model ON token_usage(model);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_token_usage_unique ON token_usage(chat_id, agent_id, model);
    `)

    db.prepare("UPDATE _meta SET value = '8' WHERE key = 'schema_version'").run()
    log.info('Schema upgraded to V8: added token_usage table')
  })()
}
