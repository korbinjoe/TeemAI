import type BetterSqlite3 from 'better-sqlite3'
import { getSchemaVersion } from './utils'
import { createLogger } from '../../lib/logger'

const log = createLogger('Migration:V3')

/** V3 Agent Memory + Growth */
export function migrateToV3(db: BetterSqlite3.Database): void {
  if (getSchemaVersion(db) >= 3) return

  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_memories (
        id          TEXT PRIMARY KEY,
        agent_name  TEXT NOT NULL,
        category    TEXT NOT NULL DEFAULT 'general',
        content     TEXT NOT NULL,
        source      TEXT,
        chat_id     TEXT,
        importance  INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_memories_agent ON agent_memories(agent_name);
      CREATE INDEX IF NOT EXISTS idx_memories_category ON agent_memories(agent_name, category);
      CREATE INDEX IF NOT EXISTS idx_memories_chat ON agent_memories(chat_id);    `)

    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_growth (
        id          TEXT PRIMARY KEY,
        agent_name  TEXT NOT NULL,
        metric      TEXT NOT NULL,
        value       INTEGER NOT NULL DEFAULT 0,
        level       INTEGER NOT NULL DEFAULT 1,
        updated_at  TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_growth_agent_metric ON agent_growth(agent_name, metric);
    `)

    db.prepare("UPDATE _meta SET value = '3' WHERE key = 'schema_version'").run()
    log.info('Schema upgraded to V3: added agent_memories + agent_growth')
  })()
}
