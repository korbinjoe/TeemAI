import type BetterSqlite3 from 'better-sqlite3'
import { getSchemaVersion } from './utils'
import { createLogger } from '../../lib/logger'

const log = createLogger('Migration:V32')

export const migrateToV32 = (db: BetterSqlite3.Database): void => {
  if (getSchemaVersion(db) >= 32) return

  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS episodes (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        mission_id TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failed', 'blocked', 'unknown')),
        tags_json TEXT NOT NULL DEFAULT '[]',
        files_json TEXT NOT NULL DEFAULT '[]',
        source_ref TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_episodes_agent_completed ON episodes(agent_id, completed_at DESC);
      CREATE VIRTUAL TABLE IF NOT EXISTS episodes_fts USING fts5(
        id UNINDEXED,
        title,
        summary,
        tags,
        files
      );
    `)

    db.prepare("UPDATE _meta SET value = '32' WHERE key = 'schema_version'").run()
    log.info('Schema upgraded to V32: episodic memory index')
  })()
}
