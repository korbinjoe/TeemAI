/**
 * Migrate legacy JSON files (~/.openteam/*.json) into SQLite tables.
 * Renames migrated files to .bak on success.
 */

import type BetterSqlite3 from 'better-sqlite3'
import { join } from 'path'
import { homedir } from 'os'
import { existsSync, readFileSync, renameSync } from 'fs'
import { STORE_DIR } from '../Database'
import { createLogger } from '../../lib/logger'

const log = createLogger('Migration:JSON')

interface MigrationEntry {
  file: string
  table: string
  convert: (item: Record<string, unknown>, db: BetterSqlite3.Database) => Record<string, unknown>
}

function insertRow(db: BetterSqlite3.Database, table: string, row: Record<string, unknown>) {
  const columns = Object.keys(row)
  const placeholders = columns.map(() => '?').join(', ')
  db.prepare(
    `INSERT OR IGNORE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`
  ).run(...columns.map((c) => row[c] ?? null))
}

function jsonOrNull(val: unknown): string | null {
  if (val === undefined || val === null) return null
  return typeof val === 'string' ? val : JSON.stringify(val)
}

const MIGRATION_MAP: MigrationEntry[] = [
  {
    file: 'agents.json',
    table: 'agents',
    convert: (item) => ({
      id: item.id ?? item.name,
      name: item.name,
      description: item.description ?? '',
      icon: item.icon ?? '',
      system_prompt: jsonOrNull(item.systemPrompt) ?? '{"mode":"append","content":""}',
      allowed_tools: jsonOrNull(item.allowedTools),
      disallowed_tools: jsonOrNull(item.disallowedTools),
      model: item.model ?? null,
      max_turns: item.maxTurns ?? null,
      skills: jsonOrNull(item.skills),
      mcp_servers: jsonOrNull(item.mcpServers),
      hooks: jsonOrNull(item.hooks),
      sub_agent_names: jsonOrNull(item.expertAgentNames) ?? jsonOrNull(item.subAgentNames),
      provider: (item.provider as string) ?? null,
      tags: jsonOrNull(item.tags) ?? '[]',
      source: item.source ?? 'builtin',
      created_at: item.createdAt ?? new Date().toISOString(),
      updated_at: item.updatedAt ?? new Date().toISOString(),
    }),
  },
  {
    file: 'workspaces.json',
    table: 'workspaces',
    convert: (item) => ({
      id: item.id,
      name: item.name,
      repositories: jsonOrNull(item.repositories) ?? '[]',
      agent_team: jsonOrNull(item.agentTeam),
      worktree_enabled: item.worktreeEnabled ? 1 : 0,
      last_accessed_at: item.lastAccessedAt ?? new Date().toISOString(),
      created_at: item.createdAt ?? new Date().toISOString(),
    }),
  },
  {
    file: 'chats.json',
    table: 'chats',
    convert: (item) => ({
      id: item.id,
      workspace_id: item.workspaceId,
      worktree_sessions: jsonOrNull(item.worktreeSessions),
      title: item.title,
      primary_agent_id: item.leadAgentName ?? item.primaryAgentName ?? item.primaryAgentId,
      team_agent_ids: jsonOrNull(item.expertAgentNames) ?? jsonOrNull(item.teamAgentNames) ?? jsonOrNull(item.teamAgentIds) ?? '[]',
      expert_sessions: jsonOrNull(item.expertSessions),
      model: item.model ?? null,
      status: item.status,
      total_cost: item.totalCost ?? null,
      total_tokens: jsonOrNull(item.totalTokens),
      total_tool_calls: item.totalToolCalls ?? null,
      participant_agents: jsonOrNull(item.participantAgents),
      created_at: item.createdAt,
      last_message_at: item.lastMessageAt,
    }),
  },
  {
    file: 'execution-logs.json',
    table: 'execution_logs',
    convert: (item) => ({
      id: item.id,
      chat_id: item.chatId,
      workspace_id: item.workspaceId,
      agent_id: item.agentName ?? item.agentId,
      total_cost: item.totalCost ?? null,
      total_tokens: jsonOrNull(item.totalTokens),
      tool_calls: item.toolCalls ?? 0,
      duration: item.duration ?? null,
      status: item.status,
      started_at: item.startedAt,
      completed_at: item.completedAt ?? null,
    }),
  },
  {
    file: 'cron-jobs.json',
    table: 'cron_jobs',
    convert: (item, db) => {
      const executions = item.executions as Array<Record<string, unknown>> | undefined
      if (executions?.length) {
        for (const exec of executions) {
          insertRow(db, 'cron_job_executions', {
            id: exec.id,
            job_id: item.id,
            started_at: exec.startedAt,
            finished_at: exec.finishedAt ?? null,
            status: exec.status,
            chat_id: exec.chatId ?? null,
            exit_code: exec.exitCode ?? null,
            error_message: exec.errorMessage ?? null,
          })
        }
      }

      return {
        id: item.id,
        name: item.name,
        description: item.description ?? null,
        workspace_id: item.workspaceId,
        agent_id: item.agentName ?? item.agentId ?? null,
        model: item.model ?? null,
        trigger: jsonOrNull(item.trigger) ?? '{}',
        prompt: item.prompt,
        enabled: item.enabled ? 1 : 0,
        retry_on_failure: item.retryOnFailure ? 1 : 0,
        max_retries: item.maxRetries ?? 2,
        created_at: item.createdAt,
        updated_at: item.updatedAt,
        last_run_at: item.lastRunAt ?? null,
        next_run_at: item.nextRunAt ?? null,
      }
    },
  },
  {
    file: 'notifications.json',
    table: 'notifications',
    convert: (item) => ({
      id: item.id,
      category: item.category,
      title: item.title,
      body: item.body,
      read: item.read ? 1 : 0,
      created_at: item.createdAt,
      link: item.link ?? null,
      meta: jsonOrNull(item.meta),
    }),
  },
]

export function migrateFromJson(db: BetterSqlite3.Database): void {
  const dirs = [STORE_DIR, join(homedir(), '.claude-legion')]

  db.pragma('foreign_keys = OFF')
  const transaction = db.transaction(() => {
    for (const { file, table, convert } of MIGRATION_MAP) {
      const count = (db.prepare(`SELECT COUNT(*) as cnt FROM ${table}`).get() as { cnt: number }).cnt
      if (count > 0) continue

      let filePath: string | null = null
      for (const dir of dirs) {
        const candidate = join(dir, file)
        if (existsSync(candidate)) {
          filePath = candidate
          break
        }
      }
      if (!filePath) continue

      try {
        const raw = readFileSync(filePath, 'utf-8')
        const items = JSON.parse(raw) as Record<string, unknown>[]
        if (!Array.isArray(items)) continue

        for (const item of items) {
          const row = convert(item, db)
          insertRow(db, table, row)
        }

        renameSync(filePath, filePath + '.bak')
        log.info(`${file} → ${table}: ${items.length} records imported`, { file, table, count: items.length })
      } catch (err) {
        log.error(`Failed to migrate ${file}`, { file, error: err instanceof Error ? err.message : String(err) })
      }
    }
  })

  transaction()
  db.pragma('foreign_keys = ON')
}
