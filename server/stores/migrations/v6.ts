import type BetterSqlite3 from 'better-sqlite3'
import { getSchemaVersion } from './utils'
import { createLogger } from '../../lib/logger'

const log = createLogger('Migration:V6')

export function migrateToV6(db: BetterSqlite3.Database): void {
  if (getSchemaVersion(db) >= 6) return

  db.transaction(() => {
    const agents = db.prepare('SELECT id, name FROM agents').all() as Array<{ id: string; name: string }>
    const nameToId = new Map<string, string>()
    for (const a of agents) {
      nameToId.set(a.name, a.id)
    }

    const chatCols = (db.prepare("PRAGMA table_info(chats)").all() as Array<{ name: string }>).map((c) => c.name)
    if (chatCols.includes('primary_agent_name')) {
      db.exec('ALTER TABLE chats RENAME COLUMN primary_agent_name TO primary_agent_id')
    }
    if (chatCols.includes('team_agent_names')) {
      db.exec('ALTER TABLE chats RENAME COLUMN team_agent_names TO team_agent_ids')
    }

    const chats = db.prepare('SELECT id, primary_agent_id, team_agent_ids FROM chats').all() as Array<{
      id: string; primary_agent_id: string; team_agent_ids: string
    }>
    const updateChat = db.prepare('UPDATE chats SET primary_agent_id = ?, team_agent_ids = ? WHERE id = ?')
    for (const chat of chats) {
      const newPrimary = nameToId.get(chat.primary_agent_id) || chat.primary_agent_id
      let newTeam = chat.team_agent_ids
      try {
        const teamNames: string[] = JSON.parse(chat.team_agent_ids)
        const teamIds = teamNames.map((n) => nameToId.get(n) || n)
        newTeam = JSON.stringify(teamIds)
      } catch { /* keep as-is */ }
      updateChat.run(newPrimary, newTeam, chat.id)
    }

    const presetExists = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='team_presets'").get() as { name: string } | undefined)
    if (presetExists) {
      const presetCols = (db.prepare("PRAGMA table_info(team_presets)").all() as Array<{ name: string }>).map((c) => c.name)
      if (presetCols.includes('primary_agent_name')) {
        db.exec('ALTER TABLE team_presets RENAME COLUMN primary_agent_name TO primary_agent_id')
      }
      if (presetCols.includes('team_agent_names')) {
        db.exec('ALTER TABLE team_presets RENAME COLUMN team_agent_names TO team_agent_ids')
      }

      const presets = db.prepare('SELECT id, primary_agent_id, team_agent_ids FROM team_presets').all() as Array<{
        id: string; primary_agent_id: string; team_agent_ids: string
      }>
      const updatePreset = db.prepare('UPDATE team_presets SET primary_agent_id = ?, team_agent_ids = ? WHERE id = ?')
      for (const preset of presets) {
        const newPrimary = nameToId.get(preset.primary_agent_id) || preset.primary_agent_id
        let newTeam = preset.team_agent_ids
        try {
          const teamNames: string[] = JSON.parse(preset.team_agent_ids)
          const teamIds = teamNames.map((n) => nameToId.get(n) || n)
          newTeam = JSON.stringify(teamIds)
        } catch { /* keep as-is */ }
        updatePreset.run(newPrimary, newTeam, preset.id)
      }
    }

    const execLogCols = (db.prepare("PRAGMA table_info(execution_logs)").all() as Array<{ name: string }>).map((c) => c.name)
    if (execLogCols.includes('agent_name')) {
      db.exec('ALTER TABLE execution_logs RENAME COLUMN agent_name TO agent_id')
    }
    const logs = db.prepare('SELECT id, agent_id FROM execution_logs').all() as Array<{ id: string; agent_id: string }>
    const updateLog = db.prepare('UPDATE execution_logs SET agent_id = ? WHERE id = ?')
    for (const logEntry of logs) {
      const newId = nameToId.get(logEntry.agent_id) || logEntry.agent_id
      if (newId !== logEntry.agent_id) updateLog.run(newId, logEntry.id)
    }

    const cronCols = (db.prepare("PRAGMA table_info(cron_jobs)").all() as Array<{ name: string }>).map((c) => c.name)
    if (cronCols.includes('agent_name')) {
      db.exec('ALTER TABLE cron_jobs RENAME COLUMN agent_name TO agent_id')
    }

    const memCols = (db.prepare("PRAGMA table_info(agent_memories)").all() as Array<{ name: string }>).map((c) => c.name)
    if (memCols.includes('agent_name')) {
      db.exec('ALTER TABLE agent_memories RENAME COLUMN agent_name TO agent_id')
    }

    const growthCols = (db.prepare("PRAGMA table_info(agent_growth)").all() as Array<{ name: string }>).map((c) => c.name)
    if (growthCols.includes('agent_name')) {
      db.exec('ALTER TABLE agent_growth RENAME COLUMN agent_name TO agent_id')
    }
    const jobs = db.prepare('SELECT id, agent_id FROM cron_jobs WHERE agent_id IS NOT NULL').all() as Array<{ id: string; agent_id: string }>
    const updateJob = db.prepare('UPDATE cron_jobs SET agent_id = ? WHERE id = ?')
    for (const job of jobs) {
      const newId = nameToId.get(job.agent_id) || job.agent_id
      if (newId !== job.agent_id) updateJob.run(newId, job.id)
    }

    db.prepare("UPDATE _meta SET value = '6' WHERE key = 'schema_version'").run()
    log.info('Schema upgraded to V6: agent key name→id', { mappedAgents: nameToId.size })
  })()
}
