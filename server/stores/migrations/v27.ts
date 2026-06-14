import type BetterSqlite3 from 'better-sqlite3'
import { getSchemaVersion } from './utils'
import { createLogger } from '../../lib/logger'

const log = createLogger('Migration:V27')

const tableExists = (db: BetterSqlite3.Database, name: string): boolean => {
  const row = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name)
  return !!row
}

/**
 * V27 — terminology normalization (WS-7 + WS-3).
 *
 * WS-7: rename the `chats` table to `missions` and its participant columns
 *   (`primary_agent_id` -> `lead_agent_id`, `expert_sessions` ->
 *   `mission_agent_sessions`). A rollback-compat `chats` VIEW + INSTEAD OF
 *   triggers keep legacy code reading/writing `chats` working for one release.
 *
 * WS-3: collapse legacy `agents.provider` vendor values — `acp` -> `claude`,
 *   `qodercli` -> `qoder`. (The agents table has no transport/surface columns,
 *   so only the vendor is normalized.)
 */
export const migrateToV27 = (db: BetterSqlite3.Database): void => {
  // Idempotency: the table rename is the irreversible step; if `missions`
  // already exists this migration has run.
  if (tableExists(db, 'missions') || getSchemaVersion(db) >= 27) return

  db.transaction(() => {
    // WS-7: rename table + columns (only when the legacy `chats` table is present).
    if (tableExists(db, 'chats')) {
      db.exec('ALTER TABLE chats RENAME TO missions')
      db.exec('ALTER TABLE missions RENAME COLUMN primary_agent_id TO lead_agent_id')
      db.exec('ALTER TABLE missions RENAME COLUMN expert_sessions TO mission_agent_sessions')

      // Rollback-compat: a `chats` view exposing the old column names, with
      // INSTEAD OF triggers so legacy writers keep working against `chats`.
      db.exec(`
        CREATE VIEW IF NOT EXISTS chats AS
        SELECT
          *,
          lead_agent_id          AS primary_agent_id,
          mission_agent_sessions AS expert_sessions
        FROM missions
      `)

      db.exec(`
        CREATE TRIGGER IF NOT EXISTS chats_instead_insert
        INSTEAD OF INSERT ON chats
        BEGIN
          INSERT INTO missions (
            id, workspace_id, worktree_sessions, title, lead_agent_id,
            team_agent_ids, mission_agent_sessions, model, status, total_cost,
            total_tokens, total_tool_calls, participant_agents, archived_at,
            pinned_at, created_at, last_message_at
          ) VALUES (
            NEW.id, NEW.workspace_id, NEW.worktree_sessions, NEW.title, NEW.primary_agent_id,
            NEW.team_agent_ids, NEW.expert_sessions, NEW.model, NEW.status, NEW.total_cost,
            NEW.total_tokens, NEW.total_tool_calls, NEW.participant_agents, NEW.archived_at,
            NEW.pinned_at, NEW.created_at, NEW.last_message_at
          );
        END
      `)

      db.exec(`
        CREATE TRIGGER IF NOT EXISTS chats_instead_update
        INSTEAD OF UPDATE ON chats
        BEGIN
          UPDATE missions SET
            workspace_id           = NEW.workspace_id,
            worktree_sessions      = NEW.worktree_sessions,
            title                  = NEW.title,
            lead_agent_id          = NEW.primary_agent_id,
            team_agent_ids         = NEW.team_agent_ids,
            mission_agent_sessions = NEW.expert_sessions,
            model                  = NEW.model,
            status                 = NEW.status,
            total_cost             = NEW.total_cost,
            total_tokens           = NEW.total_tokens,
            total_tool_calls       = NEW.total_tool_calls,
            participant_agents     = NEW.participant_agents,
            archived_at            = NEW.archived_at,
            pinned_at              = NEW.pinned_at,
            created_at             = NEW.created_at,
            last_message_at        = NEW.last_message_at
          WHERE id = OLD.id;
        END
      `)

      db.exec(`
        CREATE TRIGGER IF NOT EXISTS chats_instead_delete
        INSTEAD OF DELETE ON chats
        BEGIN
          DELETE FROM missions WHERE id = OLD.id;
        END
      `)
    }

    // WS-3: collapse legacy provider vendor values. Guarded so re-runs on
    // already-clean data are no-ops.
    if (tableExists(db, 'agents')) {
      const cols = db.prepare('PRAGMA table_info(agents)').all() as Array<{ name: string }>
      if (cols.some((c) => c.name === 'provider')) {
        db.prepare("UPDATE agents SET provider = 'claude' WHERE provider = 'acp'").run()
        db.prepare("UPDATE agents SET provider = 'qoder' WHERE provider = 'qodercli'").run()
      }
    }

    db.prepare("UPDATE _meta SET value = '27' WHERE key = 'schema_version'").run()
    log.info('Schema upgraded to V27: chats->missions (+rollback view/triggers), provider normalized')
  })()
}
