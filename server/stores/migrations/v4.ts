import type BetterSqlite3 from 'better-sqlite3'
import { getSchemaVersion } from './utils'
import { createLogger } from '../../lib/logger'

const log = createLogger('Migration:V4')

export function migrateToV4(db: BetterSqlite3.Database): void {
  if (getSchemaVersion(db) >= 4) return

  db.transaction(() => {
    const chatCols = (db.prepare("PRAGMA table_info(chats)").all() as Array<{ name: string }>).map((c) => c.name)
    if (chatCols.includes('claude_session_id')) {
      db.exec('ALTER TABLE chats DROP COLUMN claude_session_id')
    }

    const oldFormatChats = db.prepare(
      "SELECT id, expert_sessions FROM chats WHERE expert_sessions IS NOT NULL AND expert_sessions != '{}'"
    ).all() as Array<{ id: string; expert_sessions: string }>

    for (const chat of oldFormatChats) {
      try {
        const parsed = JSON.parse(chat.expert_sessions)
        const entries = Object.entries(parsed)
        if (entries.length === 0) continue
        const hasOldFormat = entries.some(([, v]) => typeof v === 'string')
        if (hasOldFormat) {
          const converted: Record<string, { claudeSessionId: string; cwd: string }> = {}
          for (const [agentId, value] of entries) {
            if (typeof value === 'string') {
              converted[agentId] = { claudeSessionId: value, cwd: '' }
            } else {
              converted[agentId] = value as { claudeSessionId: string; cwd: string }
            }
          }
          db.prepare('UPDATE chats SET expert_sessions = ? WHERE id = ?')
            .run(JSON.stringify(converted), chat.id)
        }
      } catch {
        db.prepare('UPDATE chats SET expert_sessions = NULL WHERE id = ?').run(chat.id)
      }
    }

    db.exec("DELETE FROM chats WHERE workspace_id NOT IN (SELECT id FROM workspaces)")
    db.exec("DELETE FROM execution_logs WHERE chat_id NOT IN (SELECT id FROM chats)")
    db.exec("DELETE FROM execution_logs WHERE workspace_id NOT IN (SELECT id FROM workspaces)")

    db.exec(`
      CREATE TABLE execution_logs_new (
        id            TEXT PRIMARY KEY,
        chat_id       TEXT NOT NULL,
        workspace_id  TEXT NOT NULL,
        agent_id      TEXT NOT NULL,
        total_cost    REAL,
        total_tokens  TEXT,
        tool_calls    INTEGER NOT NULL DEFAULT 0,
        duration      INTEGER,
        status        TEXT NOT NULL CHECK (status IN ('running', 'completed', 'error')),
        started_at    TEXT NOT NULL,
        completed_at  TEXT,
        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      );
      INSERT INTO execution_logs_new SELECT * FROM execution_logs;
      DROP TABLE execution_logs;
      ALTER TABLE execution_logs_new RENAME TO execution_logs;
      CREATE INDEX idx_exec_logs_chat ON execution_logs(chat_id);
      CREATE INDEX idx_exec_logs_workspace ON execution_logs(workspace_id);
      CREATE INDEX idx_exec_logs_started ON execution_logs(started_at);
    `)

    db.exec("DELETE FROM cron_jobs WHERE workspace_id NOT IN (SELECT id FROM workspaces)")
    db.exec(`
      CREATE TABLE cron_jobs_new (
        id                TEXT PRIMARY KEY,
        name              TEXT NOT NULL,
        description       TEXT,
        workspace_id      TEXT NOT NULL,
        agent_name        TEXT,
        model             TEXT,
        trigger           TEXT NOT NULL,
        prompt            TEXT NOT NULL,
        enabled           INTEGER NOT NULL DEFAULT 1,
        retry_on_failure  INTEGER NOT NULL DEFAULT 1,
        max_retries       INTEGER NOT NULL DEFAULT 2,
        created_at        TEXT NOT NULL,
        updated_at        TEXT NOT NULL,
        last_run_at       TEXT,
        next_run_at       TEXT,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      );
      INSERT INTO cron_jobs_new SELECT * FROM cron_jobs;
      DROP TABLE cron_jobs;
      ALTER TABLE cron_jobs_new RENAME TO cron_jobs;
    `)

    db.exec('CREATE INDEX IF NOT EXISTS idx_memories_chat ON agent_memories(chat_id)')

    db.prepare("UPDATE _meta SET value = '4' WHERE key = 'schema_version'").run()
    log.info('Schema upgraded to V4: added FK constraints, cleaned deprecated fields')
  })()
}
