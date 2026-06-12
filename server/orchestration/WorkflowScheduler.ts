import type { WebSocket } from 'ws'
import type { WorkflowEngine } from './WorkflowEngine'
import type { WorkflowRegistry } from './WorkflowRegistry'
import type { ExpertHandler } from '../ws/ExpertHandler'
import type { ChatStore } from '../stores/ChatStore'
import type { WorkspaceStore } from '../stores/WorkspaceStore'
import type { SessionRegistry } from '../terminal/SessionRegistry'
import type { TaskResult } from '../../shared/agent-message-types'
import type { ChatActivityPayload } from '../terminal/ActivityAggregator'
import {
  buildFileManifestBlock, validateFileManifest,
  shouldUseWorktree, createWorktreeManager,
  mergeTaskWorktree, discardWorktree,
} from './WorkflowTaskUtils'
import { type EnrichedTaskContext, buildLeadPrompt } from './WorkflowLeadPrompt'
import { createLogger } from '../lib/logger'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { readFile } from 'fs/promises'
import { resolve } from 'path'

const execFileAsync = promisify(execFile)

const log = createLogger('WorkflowScheduler')

const API_CONNECTION_ID = '__api__'
const LEAD_AGENT_ID = 'lead'
const MAX_QUEUE_PER_CHAT = 20
const DEFAULT_WATCHDOG_INTERVAL_MS = 60_000
const WATCHDOG_STALE_THRESHOLD_MS = 180_000

export interface WorkflowSchedulerDeps {
  workflowRegistry: WorkflowRegistry
  expertHandler: ExpertHandler
  chatStore: ChatStore
  workspaceStore: WorkspaceStore
  sessionRegistry: SessionRegistry
  broadcastToChat: (chatId: string, msg: Record<string, unknown>) => void
  watchdogIntervalMs?: number
}

export class WorkflowScheduler {
  private deps: WorkflowSchedulerDeps
  private wokenLeadTasks = new Set<string>()
  private pendingNotifications = new Map<string, string[]>()
  private startingTasks = new Set<string>()
  private watchdogTimer: ReturnType<typeof setInterval> | null = null

  constructor(deps: WorkflowSchedulerDeps) {
    this.deps = deps
    this.startWatchdog()
  }

  destroy(): void {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer)
      this.watchdogTimer = null
    }
  }

  scheduleWorkflow(engine: WorkflowEngine): void {
    this.advanceEngine(engine)
  }

  onAgentExited(chatId: string, agentId: string, exitCode: number, taskCompleted: boolean): void {
    const engine = this.deps.workflowRegistry.findByAgent(agentId)
    if (!engine) {
      log.debug('No workflow found for exited agent', { agentId, chatId, exitCode })
      return
    }

    const taskState = engine.findTaskByCurrentAgent(agentId)
    if (!taskState) {
      log.warn('Workflow found but no matching task for agent', { agentId, chatId, workflowId: engine.workflowId })
      return
    }

    if (this.wokenLeadTasks.has(taskState.taskId)) {
      log.debug('Task already handled by activity-based completion, skipping exit handler', { taskId: taskState.taskId, agentId })
      return
    }

    this.recordAndNotifyLead(engine, taskState.taskId, agentId, taskCompleted)
  }

  onActivityChanged(payload: ChatActivityPayload): void {
    if (!payload.agentActivities) return

    for (const agentActivity of payload.agentActivities) {
      if (agentActivity.phase !== 'waiting_input') continue

      // L1: If this is the Lead agent becoming idle, drain pending notifications
      if (agentActivity.agentId === LEAD_AGENT_ID) {
        this.drainPendingNotifications(payload.chatId)
        continue
      }

      const engine = this.deps.workflowRegistry.findByAgent(agentActivity.agentId)
      if (!engine) continue

      const taskState = engine.findTaskByCurrentAgent(agentActivity.agentId)
      if (!taskState) continue

      if (this.wokenLeadTasks.has(taskState.taskId)) continue

      const taskCompleted = !this.looksLikeHelpRequest(agentActivity.logLine)

      log.info('Workflow task agent entered waiting_input', {
        workflowId: engine.workflowId,
        taskId: taskState.taskId,
        agentId: agentActivity.agentId,
        inferredCompleted: taskCompleted,
        logLine: agentActivity.logLine?.slice(0, 120),
      })

      this.wokenLeadTasks.add(taskState.taskId)
      this.recordAndNotifyLead(engine, taskState.taskId, agentActivity.agentId, taskCompleted)
    }
  }

  private looksLikeHelpRequest(logLine?: string): boolean {
    if (!logLine) return false
    const lower = logLine.toLowerCase()
    const signals = [
      'need guidance', 'need help', 'need input',
      'please provide', 'please confirm', 'please clarify',
      'i encountered', 'i\'m blocked', 'i\'m stuck', 'i\'m unable',
      'cannot proceed', 'can\'t proceed',
      'error:', 'failed to',
      'what should i', 'how should i',
      'could you', 'would you',
    ]
    return signals.some(s => lower.includes(s))
  }

  advanceWorkflow(workflowId: string): { started: string[]; error?: string } {
    const engine = this.deps.workflowRegistry.get(workflowId)
    if (!engine) return { started: [], error: 'workflow_not_found' }

    const readyTasks = engine.getReadyTasks()
    const started: string[] = []

    for (const task of readyTasks) {
      this.startTask(engine, task.taskId, task.agentId, task.description)
      started.push(task.taskId)
    }

    log.info('Lead-driven advance', { workflowId, startedCount: started.length, started })
    return { started }
  }

  private recordAndNotifyLead(engine: WorkflowEngine, taskId: string, agentId: string, taskCompleted: boolean): void {
    const session = this.deps.sessionRegistry.findByChat(engine.chatId, agentId)
    const snapshot = session?.activitySnapshot

    const summaryParts: string[] = [
      taskCompleted
        ? `Agent ${agentId} completed task ${taskId}`
        : `Agent ${agentId} failed task ${taskId}`,
    ]
    if (snapshot?.logLine) summaryParts.push(`Last output: ${snapshot.logLine}`)
    if (snapshot?.toolCount) summaryParts.push(`Tools used: ${snapshot.toolCompleted ?? 0}/${snapshot.toolCount}`)
    if (snapshot?.cost != null) summaryParts.push(`Cost: $${snapshot.cost.toFixed(4)}`)

    const result: TaskResult = {
      taskId,
      executor: agentId,
      status: taskCompleted ? 'completed' : 'failed',
      summary: summaryParts.join(' | '),
      artifacts: [],
      modifiedFiles: [],
      failureReason: taskCompleted ? undefined : `agent_failed`,
    }

    engine.recordTaskResult(taskId, result)

    // L1: Clear queue and wokenLeadTasks if workflow just completed
    if (engine.status === 'completed' || engine.status === 'stopped') {
      this.clearQueueForChat(engine.chatId)
      this.clearWokenTasksForWorkflow(engine)
    }

    const resolvedStatus = taskCompleted ? 'completed' : 'failed'
    this.deps.broadcastToChat(engine.chatId, {
      type: 'workflow:task-updated',
      payload: { chatId: engine.chatId, workflowId: engine.workflowId, taskId, status: resolvedStatus, agentId },
    })

    // L3: If task has autoAdvance and completed successfully, advance immediately
    const taskDef = engine.getTask(taskId)
    const didAutoAdvance = taskCompleted && !!taskDef?.autoAdvance
    if (didAutoAdvance) {
      log.info('autoAdvance: immediately advancing downstream tasks', { workflowId: engine.workflowId, taskId })
      this.advanceEngine(engine)
    }

    this.collectEnrichedContext(engine, taskId, result).then(enriched => {
      const readyTasks = engine.getReadyTasks()
      const state = engine.getState()

      this.wakeLeadAgent(engine.chatId, engine.workflowId, {
        event: taskCompleted ? 'task_completed' : 'task_failed',
        completedTaskId: taskId,
        completedBy: agentId,
        workflowStatus: state.status,
        autoAdvanced: didAutoAdvance,
        tasks: Object.values(state.tasks).map(t => ({
          taskId: t.taskId,
          agentId: t.agentId,
          status: t.status,
          summary: t.result?.summary,
          rejectCount: t.rejectCount > 0 ? t.rejectCount : undefined,
        })),
        readyTasks: readyTasks.map(t => ({
          taskId: t.taskId,
          agentId: t.agentId,
          description: t.description,
        })),
        enriched,
      })
    }).catch(err => {
      log.warn('Failed to collect enriched context, waking Lead with basic info', {
        workflowId: engine.workflowId, taskId,
        error: err instanceof Error ? err.message : String(err),
      })
      const readyTasks = engine.getReadyTasks()
      const state = engine.getState()

      this.wakeLeadAgent(engine.chatId, engine.workflowId, {
        event: taskCompleted ? 'task_completed' : 'task_failed',
        completedTaskId: taskId,
        completedBy: agentId,
        workflowStatus: state.status,
        autoAdvanced: didAutoAdvance,
        tasks: Object.values(state.tasks).map(t => ({
          taskId: t.taskId,
          agentId: t.agentId,
          status: t.status,
          summary: t.result?.summary,
        })),
        readyTasks: readyTasks.map(t => ({
          taskId: t.taskId,
          agentId: t.agentId,
          description: t.description,
        })),
      })
    })
  }

  notifyLead(chatId: string, prompt: string): void {
    const leadSession = this.deps.sessionRegistry.findByChat(chatId, LEAD_AGENT_ID)
    if (leadSession && leadSession.acpClient?.isAlive()) {
      const phase = leadSession.activitySnapshot?.phase
      if (phase === 'waiting_input' || phase === 'waiting_confirmation') {
        log.info('Waking existing Lead agent with prompt', { chatId })
        leadSession.acpClient.prompt(leadSession.sessionId, prompt).catch(err => {
          log.error('Failed to prompt Lead agent', { chatId, error: err instanceof Error ? err.message : String(err) })
        })
        return
      }
    }
    this.startLeadAgent(chatId, prompt)
  }

  private wakeLeadAgent(chatId: string, workflowId: string, progress: Record<string, unknown>): void {
    const engine = this.deps.workflowRegistry.get(workflowId)
    const prompt = buildLeadPrompt(workflowId, progress, engine)

    const leadSession = this.deps.sessionRegistry.findByChat(chatId, LEAD_AGENT_ID)
    if (leadSession && leadSession.acpClient?.isAlive()) {
      const phase = leadSession.activitySnapshot?.phase
      if (phase === 'waiting_input' || phase === 'waiting_confirmation') {
        log.info('Waking existing Lead agent with workflow progress', { chatId, workflowId })
        leadSession.acpClient.prompt(leadSession.sessionId, prompt).catch(err => {
          log.error('Failed to prompt Lead agent', { chatId, error: err instanceof Error ? err.message : String(err) })
        })
        return
      }
      // L1: Queue the notification instead of dropping it
      this.enqueueNotification(chatId, prompt)
      log.info('Lead agent is busy, notification queued', { chatId, workflowId, phase, queueSize: this.pendingNotifications.get(chatId)?.length })
      return
    }

    log.info('Starting Lead agent for workflow progress', { chatId, workflowId })
    this.startLeadAgent(chatId, prompt)
  }

  private async collectEnrichedContext(engine: WorkflowEngine, taskId: string, result: TaskResult): Promise<EnrichedTaskContext> {
    const context: EnrichedTaskContext = {
      summary: result.summary,
      artifacts: result.artifacts,
      modifiedFiles: result.modifiedFiles,
    }

    const taskState = engine.getTaskState(taskId)
    const cwd = taskState?.worktreePath ?? this.resolveCwd(engine.chatId)
    if (!cwd) return context

    try {
      const diffRef = taskState?.baselineSha ?? 'HEAD~1'
      const { stdout } = await execFileAsync('git', ['diff', '--stat', `${diffRef}..HEAD`], { cwd, timeout: 5000 })
      context.gitDiffStat = stdout.slice(0, 2000)
    } catch { /* no git changes is fine */ }

    for (const artifact of result.artifacts.slice(0, 5)) {
      try {
        const fullPath = resolve(cwd, artifact.path)
        const content = await readFile(fullPath, 'utf-8')
        const lines = content.split('\n').slice(0, 80).join('\n')
        context.artifactSnippets ??= []
        context.artifactSnippets.push({ path: artifact.path, content: lines })
      } catch { /* file may not exist */ }
    }

    const taskDef = engine.getTask(taskId)
    if (taskDef?.fileManifest) {
      try {
        context.fileManifestValidation = await validateFileManifest(
          cwd, taskDef.fileManifest, taskState?.baselineSha,
        )
      } catch (err) {
        log.debug('File manifest validation failed', { taskId, error: err instanceof Error ? err.message : String(err) })
      }
    }

    return context
  }

  private startLeadAgent(chatId: string, prompt: string): void {
    const connections = this.deps.expertHandler.getConnectionsViewingChat(chatId)
    const connectionId = connections[0] || API_CONNECTION_ID
    const realWs = this.deps.expertHandler.getConnectionWs(connectionId)
    const ws: WebSocket = realWs ?? { send: () => {}, readyState: 1 } as any

    const cwd = this.resolveCwd(chatId)

    this.deps.expertHandler.handleStart(ws, {
      agentId: LEAD_AGENT_ID,
      task: prompt,
      chatId,
      cwd,
    }, connectionId).catch(err => {
      log.error('Failed to start Lead agent for workflow', { chatId, error: err instanceof Error ? err.message : String(err) })
    })
  }

  private advanceEngine(engine: WorkflowEngine): void {
    if (engine.status === 'stopped' || engine.status === 'completed') return

    const readyTasks = engine.getReadyTasks()
    for (const task of readyTasks) {
      this.startTask(engine, task.taskId, task.agentId, task.description)
    }
  }

  private resolveCwd(chatId: string): string | undefined {
    const chat = this.deps.chatStore.get(chatId)
    if (!chat?.workspaceId) return undefined
    const workspace = this.deps.workspaceStore.get(chat.workspaceId)
    return workspace?.repositories[0]?.path
  }

  // ── L1: Notification Queue ──

  private enqueueNotification(chatId: string, prompt: string): void {
    const queue = this.pendingNotifications.get(chatId) ?? []
    if (queue.length >= MAX_QUEUE_PER_CHAT) {
      const dropped = queue.shift()
      log.warn('Notification queue full, dropping oldest', { chatId, queueSize: queue.length, droppedContent: dropped?.slice(0, 200) })
    }
    queue.push(prompt)
    this.pendingNotifications.set(chatId, queue)
  }

  private drainPendingNotifications(chatId: string): void {
    const queue = this.pendingNotifications.get(chatId)
    if (!queue || queue.length === 0) return

    const leadSession = this.deps.sessionRegistry.findByChat(chatId, LEAD_AGENT_ID)
    if (!leadSession || !leadSession.acpClient?.isAlive()) return

    const phase = leadSession.activitySnapshot?.phase
    if (phase !== 'waiting_input' && phase !== 'waiting_confirmation') return

    log.info('Draining pending notifications for chat', { chatId, count: queue.length })
    const prompts = [...queue]
    this.pendingNotifications.delete(chatId)

    const merged = prompts.length === 1
      ? prompts[0]
      : `[Batched workflow updates: ${prompts.length} notifications]\n\n` +
        prompts.map((p, i) => `--- Update ${i + 1} ---\n${p}`).join('\n\n')

    leadSession.acpClient.prompt(leadSession.sessionId, merged).catch(err => {
      log.error('Failed to deliver queued notification', { chatId, error: err instanceof Error ? err.message : String(err) })
    })
  }

  private clearQueueForChat(chatId: string): void {
    this.pendingNotifications.delete(chatId)
  }

  async handleFallback(engine: WorkflowEngine): Promise<{ dispatched: boolean; agentId?: string; taskCount?: number }> {
    const dag = engine.getState().dag
    if (!dag.fallback) {
      return { dispatched: false }
    }

    const state = engine.getState()
    const remainingTasks = Object.values(state.tasks)
      .filter(t => t.status === 'pending' || t.status === 'failed')

    if (remainingTasks.length === 0) return { dispatched: false }

    for (const t of remainingTasks) {
      if (t.worktreePath) {
        await this.discardTaskWorktree(engine, t.taskId).catch(err => {
          log.warn('Failed to cleanup worktree during fallback', { taskId: t.taskId, error: err instanceof Error ? err.message : String(err) })
        })
      }
    }

    const maxPerTask = Math.floor(8000 / remainingTasks.length)
    const mergedDescription = remainingTasks
      .map(t => {
        const task = dag.tasks.find(dt => dt.taskId === t.taskId)
        const desc = task?.description ?? '(no description)'
        const truncated = desc.length > maxPerTask ? desc.slice(0, maxPerTask) + '\n...(truncated)' : desc
        return `### ${t.taskId}\n${truncated}`
      })
      .join('\n\n')

    const targetAgent = dag.fallback.agentId
      ?? dag.tasks.find(t => t.taskId === remainingTasks[0].taskId)?.agentId
      ?? 'fullstack-engineer'

    for (const t of remainingTasks) {
      engine.skipTask(t.taskId, 'merged into fallback handoff')
    }

    engine.completeWithResult('partial', 'Fallback: remaining tasks merged into single handoff')

    const chatId = engine.chatId
    const connections = this.deps.expertHandler.getConnectionsViewingChat(chatId)
    const connectionId = connections[0] || API_CONNECTION_ID
    const realWs = this.deps.expertHandler.getConnectionWs(connectionId)
    const ws: WebSocket = realWs ?? { send: () => {}, readyState: 1 } as any
    const cwd = this.resolveCwd(chatId)

    const prompt = `[Workflow fallback — merged remaining tasks]\n\n` +
      `The following tasks from workflow ${engine.workflowId} could not be ` +
      `completed individually. Complete them all in a single pass.\n\n` +
      mergedDescription

    try {
      await this.deps.expertHandler.handleStart(ws, {
        agentId: targetAgent,
        task: prompt,
        chatId,
        cwd,
      }, connectionId)

      log.info('Fallback handoff dispatched', {
        workflowId: engine.workflowId,
        targetAgent,
        taskCount: remainingTasks.length,
      })
      return { dispatched: true, agentId: targetAgent, taskCount: remainingTasks.length }
    } catch (err) {
      log.error('Fallback handoff failed', {
        workflowId: engine.workflowId,
        error: err instanceof Error ? err.message : String(err),
      })
      return { dispatched: false }
    }
  }

  async cleanupTaskChanges(engine: WorkflowEngine, taskId: string): Promise<void> {
    const taskState = engine.getTaskState(taskId)
    const baselineSha = taskState?.baselineSha
    if (!baselineSha) {
      log.debug('No baseline SHA, skipping cleanup', { taskId })
      return
    }

    if (taskState.worktreePath) {
      await this.discardTaskWorktree(engine, taskId)
      return
    }

    const cwd = this.resolveCwd(engine.chatId)
    if (!cwd) return

    const otherRunning = Object.values(engine.getState().tasks)
      .some(t => t.taskId !== taskId && t.status === 'running')
    if (otherRunning) {
      log.info('Other task running in same cwd, skipping cleanup', { taskId })
      return
    }

    try {
      const { stdout: trackedChanges } = await execFileAsync(
        'git', ['diff', '--name-only', `${baselineSha}..HEAD`],
        { cwd, timeout: 5000 },
      )
      const changedFiles = trackedChanges.trim().split('\n').filter(Boolean)

      if (changedFiles.length > 0) {
        await execFileAsync(
          'git', ['checkout', baselineSha, '--', ...changedFiles],
          { cwd, timeout: 10000 },
        )
      }

      const { stdout: untrackedOutput } = await execFileAsync(
        'git', ['ls-files', '--others', '--exclude-standard'],
        { cwd, timeout: 5000 },
      )
      const untrackedFiles = untrackedOutput.trim().split('\n').filter(Boolean)

      if (untrackedFiles.length > 0) {
        await execFileAsync(
          'git', ['clean', '-fd', '--', ...untrackedFiles],
          { cwd, timeout: 10000 },
        )
      }

      log.info('Cleaned up task changes before retry', {
        taskId, baselineSha,
        trackedReverted: changedFiles.length,
        untrackedRemoved: untrackedFiles.length,
      })
    } catch (err) {
      log.warn('Cleanup failed, retry will start from dirty state', {
        taskId, error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  onTaskRejected(taskId: string): void {
    this.wokenLeadTasks.delete(taskId)
  }

  private clearWokenTasksForWorkflow(engine: WorkflowEngine): void {
    const taskIds = Object.keys(engine.getState().tasks)
    for (const id of taskIds) {
      this.wokenLeadTasks.delete(id)
    }
  }

  // ── L2: Watchdog Timer ──

  private startWatchdog(): void {
    const intervalMs = this.deps.watchdogIntervalMs ?? DEFAULT_WATCHDOG_INTERVAL_MS
    this.watchdogTimer = setInterval(() => this.watchdogScan(), intervalMs)
  }

  private watchdogScan(): void {
    const workflows = this.deps.workflowRegistry.list('running')
    const now = Date.now()

    for (const { workflowId, chatId } of workflows) {
      const engine = this.deps.workflowRegistry.get(workflowId)
      if (!engine) continue

      const state = engine.getState()
      const lastUpdate = new Date(state.updatedAt).getTime()
      const staleDuration = now - lastUpdate

      if (staleDuration < WATCHDOG_STALE_THRESHOLD_MS) continue

      const hasRunning = Object.values(state.tasks).some(t => t.status === 'running')
      if (hasRunning) continue

      const readyTasks = engine.getReadyTasks()
      if (readyTasks.length === 0) continue

      log.warn('Watchdog: recovering stuck workflow', {
        workflowId,
        chatId,
        staleDurationMs: staleDuration,
        readyTaskCount: readyTasks.length,
      })

      this.advanceEngine(engine)
    }
  }

  async mergeTaskWorktreeForTask(engine: WorkflowEngine, taskId: string): Promise<void> {
    const cwd = this.resolveCwd(engine.chatId)
    if (!cwd) return
    await mergeTaskWorktree(engine, taskId, cwd, (conflicts, worktreePath) => {
      this.wakeLeadAgent(engine.chatId, engine.workflowId, {
        event: 'merge_conflict',
        completedTaskId: taskId,
        completedBy: engine.getTaskState(taskId)?.agentId ?? '',
        workflowStatus: engine.status,
        tasks: [],
        readyTasks: [],
        conflicts,
        worktreePath,
      })
    })
  }

  private async discardTaskWorktree(engine: WorkflowEngine, taskId: string): Promise<void> {
    const cwd = this.resolveCwd(engine.chatId)
    if (!cwd) return
    await discardWorktree(engine, taskId, cwd)
  }

  private async startTask(engine: WorkflowEngine, taskId: string, agentId: string, description: string): Promise<void> {
    if (this.startingTasks.has(taskId)) {
      log.debug('Task already being started, skipping duplicate', { taskId, agentId })
      return
    }
    this.startingTasks.add(taskId)

    const chatId = engine.chatId
    const taskState = engine.getState().tasks[taskId]

    engine.markTaskRunning(taskId, agentId)

    const taskCwd = this.resolveCwd(chatId)
    if (taskCwd) {
      try {
        const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: taskCwd, timeout: 5000 })
        engine.setTaskBaseline(taskId, stdout.trim())
      } catch (err) {
        log.debug('Could not record baseline SHA', { taskId, error: err instanceof Error ? err.message : String(err) })
      }
    }

    log.info('Starting workflow task', { workflowId: engine.workflowId, taskId, agentId })

    this.deps.broadcastToChat(chatId, {
      type: 'workflow:task-updated',
      payload: { chatId, workflowId: engine.workflowId, taskId, status: 'running', agentId },
    })

    try {
      const connections = this.deps.expertHandler.getConnectionsViewingChat(chatId)
      const connectionId = connections[0] || API_CONNECTION_ID
      const realWs = this.deps.expertHandler.getConnectionWs(connectionId)
      const ws: WebSocket = realWs ?? { send: () => {}, readyState: 1 } as any

      let cwd = this.resolveCwd(chatId)

      const taskDef = engine.getTask(taskId)

      if (taskDef && cwd && shouldUseWorktree(engine, taskDef)) {
        try {
          const wtManager = createWorktreeManager(cwd)
          const sessionId = `wf-${engine.workflowId.slice(0, 8)}-${taskId}`
          const { path: worktreePath } = await wtManager.create({ sessionId })
          cwd = worktreePath
          engine.setTaskWorktree(taskId, worktreePath)
          log.info('Created worktree for workflow task', { taskId, worktreePath })
        } catch (err) {
          log.warn('Worktree creation failed, using shared cwd', {
            taskId, error: err instanceof Error ? err.message : String(err),
          })
        }
      }

      let prompt = `[Workflow task: ${taskId}]\n\n${description}`
      if (taskDef?.fileManifest) {
        prompt += buildFileManifestBlock(taskDef.fileManifest)
      }
      if (taskState?.rejectionFeedback) {
        prompt = `[IMPORTANT — Previous attempt was rejected (attempt ${taskState.rejectCount})]\n` +
          `Feedback from reviewer:\n${taskState.rejectionFeedback}\n\n` +
          `Address this feedback in your new attempt.\n\n` +
          prompt
      }

      await this.deps.expertHandler.handleStart(ws, {
        agentId,
        task: prompt,
        chatId,
        cwd,
      }, connectionId)

      log.info('Workflow task agent started', { workflowId: engine.workflowId, taskId, agentId })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      log.error('Failed to start workflow task agent', { workflowId: engine.workflowId, taskId, agentId, error: errorMsg })
      engine.recordTaskFailure(taskId, `agent_start_failed: ${errorMsg}`)

      this.deps.broadcastToChat(chatId, {
        type: 'workflow:task-start-failed',
        payload: { workflowId: engine.workflowId, taskId, agentId, error: errorMsg },
      })
      this.deps.broadcastToChat(chatId, {
        type: 'workflow:task-updated',
        payload: { chatId, workflowId: engine.workflowId, taskId, status: 'failed', agentId },
      })
    } finally {
      this.startingTasks.delete(taskId)
    }
  }
}
