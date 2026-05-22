export type CronTrigger =
  | { kind: 'cron'; expression: string; timezone?: string }
  | { kind: 'once'; at: string }
  | { kind: 'interval'; intervalMs: number }

export interface CronJobExecution {
  id: string
  startedAt: string
  finishedAt?: string
  status: 'running' | 'success' | 'failed'
  chatId?: string
  exitCode?: number
  errorMessage?: string
}

export interface CronJob {
  id: string
  name: string
  description?: string
  workspaceId: string
  agentId?: string
  model?: string
  trigger: CronTrigger
  prompt: string
  enabled: boolean
  retryOnFailure: boolean
  maxRetries: number
  createdAt: string
  updatedAt: string
  lastRunAt?: string
  nextRunAt?: string
  executions: CronJobExecution[]
}

export type NotificationCategory =
  | 'cron_success'
  | 'cron_failed'
  | 'system'

export interface Notification {
  id: string
  category: NotificationCategory
  title: string
  body: string
  read: boolean
  createdAt: string
  link?: string
  meta?: {
    chatId?: string
    cronJobId?: string
    workspaceId?: string
  }
}
