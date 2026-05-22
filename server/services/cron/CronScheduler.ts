/**
 * CronScheduler -
 *
 *  Chat  PTY
 */

import { randomUUID } from 'crypto'
import { CronExpressionParser } from 'cron-parser'
import type { CronJobStore } from '../../stores/CronJobStore'
import type { NotificationStore } from '../../stores/NotificationStore'
import type { ChatService } from '../chat/ChatService'
import type { WorkspaceStore } from '../../stores/WorkspaceStore'
import type { CronJobLauncher } from './CronJobLauncher'
import type { CronJob, CronJobExecution } from '../../config/types'
import { createLogger } from '../../lib/logger'

const log = createLogger('CronScheduler')

const SWEEP_INTERVAL_MS = 30 * 1000

export class CronScheduler {
  private timer: ReturnType<typeof setInterval> | null = null
  private runningJobs = new Set<string>()

  constructor(
    private cronJobStore: CronJobStore,
    private notificationStore: NotificationStore,
    private chatService: ChatService,
    private workspaceStore: WorkspaceStore,
    private cronJobLauncher: CronJobLauncher,
    private broadcast: (msg: Record<string, unknown>) => void,
  ) {}

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS)
    log.info('Started', { intervalSec: SWEEP_INTERVAL_MS / 1000 })
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
      log.info('Stopped')
    }
  }

  async runNow(jobId: string): Promise<void> {
    const job = this.cronJobStore.get(jobId)
    if (!job) throw new Error('Job not found')
    if (this.runningJobs.has(jobId)) throw new Error('Job is already running')
    await this.executeJob(job)
  }

  private async sweep(): Promise<void> {
    const now = new Date()
    const jobs = this.cronJobStore.listEnabled()

    for (const job of jobs) {
      if (this.runningJobs.has(job.id)) continue
      if (!this.shouldRun(job, now)) continue

      this.executeJob(job).catch((err) => {
        log.error('executeJob error', { jobId: job.id, error: err instanceof Error ? err.message : String(err) })
      })
    }
  }

  private shouldRun(job: CronJob, now: Date): boolean {
    const { trigger } = job

    switch (trigger.kind) {
      case 'cron': {
        try {
          const expr = CronExpressionParser.parse(trigger.expression, {
            tz: trigger.timezone,
            currentDate: now,
          })
          const prev = expr.prev()
          const prevTime = prev.getTime()

          if (job.lastRunAt) {
            const lastRun = new Date(job.lastRunAt).getTime()
            if (prevTime <= lastRun) return false
          }

          return prevTime <= now.getTime()
        } catch {
          return false
        }
      }

      case 'once': {
        if (job.lastRunAt) return false
        return now.getTime() >= new Date(trigger.at).getTime()
      }

      case 'interval': {
        const anchor = job.lastRunAt || job.createdAt
        const elapsed = now.getTime() - new Date(anchor).getTime()
        return elapsed >= trigger.intervalMs
      }

      default:
        return false
    }
  }

  private computeNextRun(job: CronJob): string | null {
    const { trigger } = job

    switch (trigger.kind) {
      case 'cron': {
        try {
          const expr = CronExpressionParser.parse(trigger.expression, {
            tz: trigger.timezone,
            currentDate: new Date(),
          })
          return expr.next().toISOString()
        } catch {
          return null
        }
      }

      case 'once':
        return job.lastRunAt ? null : trigger.at

      case 'interval': {
        const anchor = job.lastRunAt || job.createdAt
        return new Date(new Date(anchor).getTime() + trigger.intervalMs).toISOString()
      }

      default:
        return null
    }
  }

  private async executeJob(job: CronJob): Promise<void> {
    this.runningJobs.add(job.id)
    const executionId = randomUUID()
    const startedAt = new Date().toISOString()

    const execution: CronJobExecution = {
      id: executionId,
      startedAt,
      status: 'running',
    }

    try {
      await this.cronJobStore.appendExecution(job.id, execution)

      this.broadcast({
        type: 'cron:job-started',
        payload: { jobId: job.id, executionId, jobName: job.name },
      })

      const chat = await this.chatService.createChat({
        workspaceId: job.workspaceId,
        title: `[Cron] ${job.name}`,
        model: job.model,
      })
      execution.chatId = chat.id

      const { exitCode } = await this.cronJobLauncher.launch(job, chat)

      execution.status = exitCode === 0 ? 'success' : 'failed'
      execution.exitCode = exitCode

    } catch (err) {
      execution.status = 'failed'
      execution.errorMessage = err instanceof Error ? err.message : String(err)
    } finally {
      this.runningJobs.delete(job.id)
    }

    execution.finishedAt = new Date().toISOString()
    await this.cronJobStore.appendExecution(job.id, execution).catch((e) => log.warn('Failed to append execution', { jobId: job.id, error: e instanceof Error ? e.message : String(e) }))

    const nextRunAt = this.computeNextRun(job)
    await this.cronJobStore.update(job.id, {
      lastRunAt: startedAt,
      nextRunAt: nextRunAt ?? undefined,
    }).catch((e) => log.warn('Failed to update cron job', { jobId: job.id, error: e instanceof Error ? e.message : String(e) }))

    if (job.trigger.kind === 'once') {
      await this.cronJobStore.setEnabled(job.id, false).catch((e) => log.warn('Failed to disable one-time job', { jobId: job.id, error: e instanceof Error ? e.message : String(e) }))
    }

    const isSuccess = execution.status === 'success'
    const notification = await this.notificationStore.create({
      category: isSuccess ? 'cron_success' : 'cron_failed',
      title: isSuccess ? 'Scheduled task completed' : 'Scheduled task failed',
      body: isSuccess
        ? `"${job.name}" executed successfully`
        : `"${job.name}" execution failed${execution.errorMessage ? `: ${execution.errorMessage}` : ''}`,
      link: execution.chatId
        ? `/workspace/${job.workspaceId}/chat/${execution.chatId}`
        : undefined,
      meta: {
        cronJobId: job.id,
        chatId: execution.chatId,
        workspaceId: job.workspaceId,
      },
    }).catch(() => null)

    this.broadcast({
      type: 'cron:job-finished',
      payload: {
        jobId: job.id,
        executionId,
        status: execution.status,
        chatId: execution.chatId,
      },
    })

    if (notification) {
      this.broadcast({
        type: 'notification:new',
        payload: notification,
      })
    }
  }
}
