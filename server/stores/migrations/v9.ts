import type BetterSqlite3 from 'better-sqlite3'
import { getSchemaVersion } from './utils'
import { createLogger } from '../../lib/logger'

const log = createLogger('Migration:V9')

/** V9 agents  personality  +  */
export function migrateToV9(db: BetterSqlite3.Database): void {
  if (getSchemaVersion(db) >= 9) return

  db.transaction(() => {
    const agentCols = (db.prepare("PRAGMA table_info(agents)").all() as Array<{ name: string }>).map((c) => c.name)
    if (!agentCols.includes('personality')) {
      db.exec('ALTER TABLE agents ADD COLUMN personality TEXT')
    }

    db.exec('CREATE INDEX IF NOT EXISTS idx_cron_jobs_enabled ON cron_jobs(enabled)')

    db.exec('DROP INDEX IF EXISTS idx_token_usage_model')
    db.exec('CREATE INDEX IF NOT EXISTS idx_token_usage_updated ON token_usage(updated_at)')

    db.exec('CREATE INDEX IF NOT EXISTS idx_memories_agent_importance ON agent_memories(agent_id, importance DESC, updated_at DESC)')

    db.exec('DROP TABLE IF EXISTS team_presets')

    const tmplExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='workspace_templates'").get()
    if (tmplExists) {
      const tmplCols = (db.prepare("PRAGMA table_info(workspace_templates)").all() as Array<{ name: string }>).map((c) => c.name)
      if (tmplCols.includes('agent_team_preset_id')) {
        db.exec('ALTER TABLE workspace_templates DROP COLUMN agent_team_preset_id')
      }
    }

    db.prepare("UPDATE _meta SET value = '9' WHERE key = 'schema_version'").run()
    log.info('Schema upgraded to V9: agents.personality + index optimizations + removed team_presets')
  })()
}
