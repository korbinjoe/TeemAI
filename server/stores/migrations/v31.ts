import type BetterSqlite3 from 'better-sqlite3'
import { getSchemaVersion } from './utils'
import { createLogger } from '../../lib/logger'

const log = createLogger('Migration:V31')

export const migrateToV31 = (db: BetterSqlite3.Database): void => {
  if (getSchemaVersion(db) >= 31) return

  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS evolution_review_jobs (
        id TEXT PRIMARY KEY,
        target_type TEXT NOT NULL CHECK (target_type IN ('agent', 'skill', 'team')),
        target_id TEXT NOT NULL,
        trigger_type TEXT NOT NULL,
        evidence_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'proposal_ready', 'approved', 'rejected', 'applied', 'failed')),
        proposal_json TEXT,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        approved_at TEXT,
        rejected_at TEXT,
        applied_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_evolution_review_jobs_status ON evolution_review_jobs(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_evolution_review_jobs_target ON evolution_review_jobs(target_type, target_id, created_at DESC);
    `)

    db.prepare("UPDATE _meta SET value = '31' WHERE key = 'schema_version'").run()
    log.info('Schema upgraded to V31: evolution review jobs')
  })()
}
