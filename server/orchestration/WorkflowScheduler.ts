import type { WebSocket } from 'ws'
import type { WorkflowEngine } from './WorkflowEngine'
import type { WorkflowRegistry } from './WorkflowRegistry'
import type { ExpertHandler } from '../ws/ExpertHandler'
import type { ChatStore } from '../stores/ChatStore'
import type { WorkspaceStore } from '../stores/WorkspaceStore'
import type { SessionRegistry } from '../terminal/SessionRegistry'
import type { TaskResult } from '../../shared/agent-message-types'
import type { ChatActivityPayload } from '../terminal/ActivityAggregator'
import { createLogger } from '../lib/logger'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { readFile } from 'fs/promises'
import { resolve } from 'path'

const execFileAsync = promisify(execFile)

interface EnrichedTaskContext {
  summary: string
  artifacts: TaskResult['artifacts']
  modifiedFiles: TaskResult['modifiedFiles']
  gitDiffStat?: string
  artifactSnippets?: Array<{ path: string; content: string }>
}

const log = createLogger('WorkflowScheduler')

const API_CONNECTION_ID = '__api__'
const LEAD_AGENT_ID = 'lead'
const MAX_QUEUE_PER_CHAT = 20
const DEFAULT_WATCHDOG_INTERVAL_MS = 60_000
const WATCHDOG_STALE_THRESHOLD_MS = 90_000

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

    const resolvedStatus = taskCompleted ? 'completed' : 'failed'
    this.deps.broadcastToChat(engine.chatId, {
      type: 'workflow:task-updated',
      payload: { chatId: engine.chatId, workflowId: engine.workflowId, taskId, status: resolvedStatus, agentId },
    })

    this.collectEnrichedContext(engine.chatId, result).then(enriched => {
      const readyTasks = engine.getReadyTasks()
      const state = engine.getState()

      this.wakeLeadAgent(engine.chatId, engine.workflowId, {
        event: taskCompleted ? 'task_completed' : 'task_failed',
        completedTaskId: taskId,
        completedBy: agentId,
        workflowStatus: state.status,
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
    const prompt = this.buildLeadPrompt(workflowId, progress)

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
      log.info('Lead agent is busy, queuing will happen on next idle', { chatId, workflowId, phase })
      return
    }

    log.info('Starting Lead agent for workflow progress', { chatId, workflowId })
    this.startLeadAgent(chatId, prompt)
  }

  private async collectEnrichedContext(chatId: string, result: TaskResult): Promise<EnrichedTaskContext> {
    const context: EnrichedTaskContext = {
      summary: result.summary,
      artifacts: result.artifacts,
      modifiedFiles: result.modifiedFiles,
    }

    const cwd = this.resolveCwd(chatId)
    if (!cwd) return context

    try {
      const { stdout } = await execFileAsync('git', ['diff', '--stat', 'HEAD~1'], { cwd, timeout: 5000 })
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

    return context
  }

  private buildLeadPrompt(workflowId: string, progress: Record<string, unknown>): string {
    const p = progress as {
      event: string
      completedTaskId: string
      completedBy: string
      workflowStatus: string
      tasks: Array<{ taskId: string; agentId: string; status: string; summary?: string; rejectCount?: number }>
      readyTasks: Array<{ taskId: string; agentId: string; description: string }>
      enriched?: EnrichedTaskContext
    }

    const taskLines = p.tasks.map(t => {
      const icon = t.status === 'completed' ? '[done]' :
                   t.status === 'running' ? '[running]' :
                   t.status === 'failed' ? '[FAILED]' :
                   t.status === 'pending' ? '[pending]' : `[${t.status}]`
      const rejected = t.rejectCount ? ` (rejected ${t.rejectCount}x)` : ''
      return `  ${icon} ${t.taskId} (${t.agentId})${rejected}${t.summary ? ': ' + t.summary : ''}`
    }).join('\n')

    const readyLines = p.readyTasks.length > 0
      ? p.readyTasks.map(t => `  - ${t.taskId} → ${t.agentId}: ${t.description.slice(0, 100)}`).join('\n')
      : '  (none)'

    let enrichedSection = ''
    const enriched = p.enriched

    if (enriched?.gitDiffStat) {
      enrichedSection += `\nGit changes:\n\`\`\`\n${enriched.gitDiffStat}\`\`\`\n`
    }

    if (enriched?.modifiedFiles?.length) {
      enrichedSection += `\nModified files:\n`
      for (const f of enriched.modifiedFiles) {
        enrichedSection += `  ${f.changeType} ${f.path} (+${f.linesAdded} -${f.linesRemoved})\n`
      }
    }

    if (enriched?.artifactSnippets?.length) {
      enrichedSection += `\nArtifact previews:\n`
      for (const s of enriched.artifactSnippets) {
        enrichedSection += `--- ${s.path} ---\n${s.content}\n---\n\n`
      }
    }

    return `[Workflow progress: ${workflowId}]

Event: ${p.event === 'task_completed' ? 'Task completed' : 'Task failed'}
Task: ${p.completedTaskId} by ${p.completedBy}
Workflow status: ${p.workflowStatus}

All tasks:
${taskLines}
${enrichedSection}
Ready to start:
${readyLines}

Review the completed work and choose one action:
1. \`advance-workflow.sh '${workflowId}'\` — deliverables are satisfactory, proceed to next tasks
2. \`reject-task.sh '${workflowId}' '${p.completedTaskId}' "<feedback>"\` — deliverables are missing or wrong, send back with specific feedback for the agent to address
3. Write an \`open_question\` to the war-room — you need user input to decide

Judgment guidance:
- Did the agent actually modify files? (check git diff stat above)
- Does the summary match the task's Deliverables clause?
- Are declared artifacts present and non-empty?
- When in doubt, advance — downstream reviewer agents provide another quality gate`
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

  private async startTask(engine: WorkflowEngine, taskId: string, agentId: string, description: string): Promise<void> {
    const chatId = engine.chatId
    const taskState = engine.getState().tasks[taskId]

    engine.markTaskRunning(taskId, agentId)
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

      const cwd = this.resolveCwd(chatId)

      let prompt = `[Workflow task: ${taskId}]\n\n${description}`
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
    }
  }
}
