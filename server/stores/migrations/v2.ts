import type BetterSqlite3 from 'better-sqlite3'
import { getSchemaVersion } from './utils'
import { createLogger } from '../../lib/logger'

const log = createLogger('Migration:V2')

export function migrateToV2(db: BetterSqlite3.Database): void {
  if (getSchemaVersion(db) >= 2) return

  const agentCols = db.prepare("PRAGMA table_info(agents)").all() as Array<{ name: string }>
  const colNames = agentCols.map((c) => c.name)

  db.transaction(() => {
    if (colNames.includes('role')) {
      db.exec('ALTER TABLE agents DROP COLUMN role')
    }
    if (colNames.includes('expert_agent_names')) {
      db.exec('ALTER TABLE agents RENAME COLUMN expert_agent_names TO sub_agent_names')
    }

    const chatCols = (db.prepare("PRAGMA table_info(chats)").all() as Array<{ name: string }>).map((c) => c.name)
    if (chatCols.includes('lead_agent_name')) {
      db.exec('ALTER TABLE chats RENAME COLUMN lead_agent_name TO primary_agent_name')
    }
    if (chatCols.includes('expert_agent_names')) {
      db.exec('ALTER TABLE chats RENAME COLUMN expert_agent_names TO team_agent_names')
    }

    const execCols = (db.prepare("PRAGMA table_info(execution_logs)").all() as Array<{ name: string }>).map((c) => c.name)
    if (execCols.includes('role')) {
      db.exec('ALTER TABLE execution_logs DROP COLUMN role')
    }

    const presetCols = (db.prepare("PRAGMA table_info(team_presets)").all() as Array<{ name: string }>).map((c) => c.name)
    if (presetCols.includes('lead_agent_name')) {
      db.exec('ALTER TABLE team_presets RENAME COLUMN lead_agent_name TO primary_agent_name')
    }
    if (presetCols.includes('expert_agent_names')) {
      db.exec('ALTER TABLE team_presets RENAME COLUMN expert_agent_names TO team_agent_names')
    }

    db.prepare("UPDATE _meta SET value = '2' WHERE key = 'schema_version'").run()
    log.info('Schema upgraded to V2: removed lead/expert role distinction')
  })()
}
