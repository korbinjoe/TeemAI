import type BetterSqlite3 from 'better-sqlite3'
import { getSchemaVersion } from './utils'
import { createLogger } from '../../lib/logger'

const log = createLogger('Migration:V30')

export const migrateToV30 = (db: BetterSqlite3.Database): void => {
  if (getSchemaVersion(db) >= 30) return

  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS skill_evolution (
        skill_name TEXT PRIMARY KEY,
        source TEXT NOT NULL CHECK (source IN ('bundled', 'user', 'agent')),
        path TEXT NOT NULL,
        source_hash TEXT,
        created_by TEXT,
        updated_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_used_at TEXT,
        last_viewed_at TEXT,
        last_patched_at TEXT,
        use_count INTEGER NOT NULL DEFAULT 0,
        view_count INTEGER NOT NULL DEFAULT 0,
        patch_count INTEGER NOT NULL DEFAULT 0,
        pinned INTEGER NOT NULL DEFAULT 0,
        archived_at TEXT,
        superseded_by TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_skill_evolution_source ON skill_evolution(source);
      CREATE INDEX IF NOT EXISTS idx_skill_evolution_lifecycle ON skill_evolution(archived_at, pinned);

      CREATE TABLE IF NOT EXISTS agent_evolution_events (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('skill_acquired', 'memory_updated', 'strategy_evolved', 'milestone')),
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        changed_file TEXT,
        rollback_ref TEXT,
        source_ref TEXT,
        evidence_json TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_agent_evolution_events_agent ON agent_evolution_events(agent_id, created_at DESC);
    `)

    db.prepare("UPDATE _meta SET value = '30' WHERE key = 'schema_version'").run()
    log.info('Schema upgraded to V30: skill evolution + agent evolution events')
  })()
}
