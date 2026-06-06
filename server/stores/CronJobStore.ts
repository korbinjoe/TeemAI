import { randomUUID } from 'crypto'
import { SqliteBaseStore } from './SqliteBaseStore'
import type { CronJob, CronJobExecution, CronTrigger } from '../config/types'

const MAX_EXECUTIONS_PER_JOB = 20

export class CronJobStore extends SqliteBaseStore<CronJob> {
  constructor(_filePath?: string) {
    super(_filePath, { tableName: 'cron_jobs', maxItems: 200 })
  }

  get(id: string): CronJob | undefined {
    const row = this.db.prepare('SELECT * FROM cron_jobs WHERE id = ?').get(id)
    if (!row) return undefined
    const results = this.buildEntitiesWithExecutions([row as Record<string, unknown>])
    return results[0]
  }

  list(): CronJob[] {
    const rows = this.db.prepare('SELECT * FROM cron_jobs').all()
    return this.buildEntitiesWithExecutions(rows as Record<string, unknown>[])
  }

  listEnabled(): CronJob[] {
    const rows = this.db.prepare('SELECT * FROM cron_jobs WHERE enabled = 1').all()
    return this.buildEntitiesWithExecutions(rows as Record<string, unknown>[])
  }

  async create(params: {
    name: string
    description?: string
    workspaceId: string
    agentId?: string
    model?: string
    trigger: CronTrigger
    prompt: string
    retryOnFailure?: boolean
    maxRetries?: number
    expiresAt?: string
  }): Promise<CronJob> {
    const now = new Date().toISOString()
    const job: CronJob = {
      id: randomUUID(),
      name: params.name,
      description: params.description,
      workspaceId: params.workspaceId,
      agentId: params.agentId,
      model: params.model,
      trigger: params.trigger,
      prompt: params.prompt,
      enabled: true,
      retryOnFailure: params.retryOnFailure ?? true,
      maxRetries: params.maxRetries ?? 2,
      expiresAt: params.expiresAt,
      createdAt: now,
      updatedAt: now,
      executions: [],
    }
    this.insertEntity(job as unknown as CronJob)
    return job
  }

  async update(id: string, updates: Partial<Omit<CronJob, 'id' | 'createdAt' | 'executions'>>): Promise<CronJob | undefined> {
    const job = this.get(id)
    if (!job) return undefined
    const { executions: _, ...rest } = job
    const merged = { ...rest, ...updates, updatedAt: new Date().toISOString(), executions: [] as CronJobExecution[] }
    this.updateById(id, merged as unknown as CronJob)
    return this.get(id)
  }

  async remove(id: string): Promise<boolean> {
    return this.deleteById(id)
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    this.db.prepare(
      'UPDATE cron_jobs SET enabled = ?, updated_at = ? WHERE id = ?'
    ).run(enabled ? 1 : 0, new Date().toISOString(), id)
  }

  async appendExecution(jobId: string, exec: CronJobExecution): Promise<void> {
    const existing = this.db.prepare(
      'SELECT id FROM cron_job_executions WHERE id = ?'
    ).get(exec.id)

    if (existing) {
      this.db.prepare(`
        UPDATE cron_job_executions
        SET started_at = ?, finished_at = ?, status = ?, chat_id = ?, exit_code = ?, error_message = ?
        WHERE id = ?
      `).run(
        exec.startedAt, exec.finishedAt ?? null, exec.status,
        exec.chatId ?? null, exec.exitCode ?? null, exec.errorMessage ?? null,
        exec.id
      )
    } else {
      this.db.prepare(`
        INSERT INTO cron_job_executions (id, job_id, started_at, finished_at, status, chat_id, exit_code, error_message)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        exec.id, jobId, exec.startedAt, exec.finishedAt ?? null,
        exec.status, exec.chatId ?? null, exec.exitCode ?? null, exec.errorMessage ?? null
      )

      const count = (this.db.prepare(
        'SELECT COUNT(*) as cnt FROM cron_job_executions WHERE job_id = ?'
      ).get(jobId) as { cnt: number }).cnt

      if (count > MAX_EXECUTIONS_PER_JOB) {
        const overflow = count - MAX_EXECUTIONS_PER_JOB
        this.db.prepare(`
          DELETE FROM cron_job_executions
          WHERE rowid IN (
            SELECT rowid FROM cron_job_executions
            WHERE job_id = ?
            ORDER BY started_at ASC
            LIMIT ?
          )
        `).run(jobId, overflow)
      }
    }
  }

  protected rowToEntity(row: Record<string, unknown>): CronJob {
    const jobId = row.id as string
    const execRows = this.db.prepare(
      'SELECT * FROM cron_job_executions WHERE job_id = ? ORDER BY started_at DESC'
    ).all(jobId) as Array<Record<string, unknown>>

    const executions: CronJobExecution[] = execRows.map((e) => ({
      id: e.id as string,
      startedAt: e.started_at as string,
      finishedAt: e.finished_at as string | undefined,
      status: e.status as CronJobExecution['status'],
      chatId: e.chat_id as string | undefined,
      exitCode: e.exit_code as number | undefined,
      errorMessage: e.error_message as string | undefined,
    }))

    return {
      id: jobId,
      name: row.name as string,
      description: row.description as string | undefined,
      workspaceId: row.workspace_id as string,
      agentId: row.agent_id as string | undefined,
      model: row.model as string | undefined,
      trigger: JSON.parse(row.trigger as string),
      prompt: row.prompt as string,
      enabled: row.enabled === 1,
      retryOnFailure: row.retry_on_failure === 1,
      maxRetries: row.max_retries as number,
      expiresAt: row.expires_at as string | undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      lastRunAt: row.last_run_at as string | undefined,
      nextRunAt: row.next_run_at as string | undefined,
      executions,
    }
  }

  private buildEntitiesWithExecutions(rows: Record<string, unknown>[]): CronJob[] {
    if (rows.length === 0) return []

    const jobIds = rows.map((r) => r.id as string)
    const placeholders = jobIds.map(() => '?').join(', ')
    const allExecRows = this.db.prepare(
      `SELECT * FROM cron_job_executions WHERE job_id IN (${placeholders}) ORDER BY started_at DESC`
    ).all(...jobIds) as Array<Record<string, unknown>>

    const execsByJob = new Map<string, CronJobExecution[]>()
    for (const e of allExecRows) {
      const jobId = e.job_id as string
      if (!execsByJob.has(jobId)) execsByJob.set(jobId, [])
      execsByJob.get(jobId)!.push({
        id: e.id as string,
        startedAt: e.started_at as string,
        finishedAt: e.finished_at as string | undefined,
        status: e.status as CronJobExecution['status'],
        chatId: e.chat_id as string | undefined,
        exitCode: e.exit_code as number | undefined,
        errorMessage: e.error_message as string | undefined,
      })
    }

    return rows.map((row) => {
      const jobId = row.id as string
      return this.rowToEntityDirect(row, execsByJob.get(jobId) ?? [])
    })
  }

  private rowToEntityDirect(row: Record<string, unknown>, executions: CronJobExecution[]): CronJob {
    return {
      id: row.id as string,
      name: row.name as string,
      description: row.description as string | undefined,
      workspaceId: row.workspace_id as string,
      agentId: row.agent_id as string | undefined,
      model: row.model as string | undefined,
      trigger: JSON.parse(row.trigger as string),
      prompt: row.prompt as string,
      enabled: row.enabled === 1,
      retryOnFailure: row.retry_on_failure === 1,
      maxRetries: row.max_retries as number,
      expiresAt: row.expires_at as string | undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      lastRunAt: row.last_run_at as string | undefined,
      nextRunAt: row.next_run_at as string | undefined,
      executions,
    }
  }

  protected entityToRow(entity: CronJob): Record<string, unknown> {
    return {
      id: entity.id,
      name: entity.name,
      description: entity.description ?? null,
      workspace_id: entity.workspaceId,
      agent_id: entity.agentId ?? null,
      model: entity.model ?? null,
      trigger: JSON.stringify(entity.trigger),
      prompt: entity.prompt,
      enabled: entity.enabled ? 1 : 0,
      retry_on_failure: entity.retryOnFailure ? 1 : 0,
      max_retries: entity.maxRetries,
      expires_at: entity.expiresAt ?? null,
      created_at: entity.createdAt,
      updated_at: entity.updatedAt,
      last_run_at: entity.lastRunAt ?? null,
      next_run_at: entity.nextRunAt ?? null,
    }
  }
}
