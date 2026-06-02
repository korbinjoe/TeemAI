import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { WorkflowEngine } from '../orchestration/WorkflowEngine'
import { WorkflowScheduler } from '../orchestration/WorkflowScheduler'
import type { WorkflowDAG, WorkflowTask } from '../../shared/workflow-types'
import type { ChatActivityPayload, AgentActivitySnapshot } from '../terminal/ActivityAggregator'

function makeDag(overrides?: Partial<WorkflowDAG>): WorkflowDAG {
  return {
    id: `wf-test-${Date.now()}`,
    chatId: 'chat-1',
    tasks: [],
    createdAt: new Date().toISOString(),
    createdBy: 'lead',
    ...overrides,
  }
}

function makeAgentActivity(agentId: string, phase: string, logLine?: string): AgentActivitySnapshot {
  return {
    agentId,
    agentName: agentId,
    phase,
    toolCount: 10,
    toolCompleted: 8,
    cost: 0.05,
    logLine,
  }
}

function makePayload(chatId: string, activities: AgentActivitySnapshot[]): ChatActivityPayload {
  return {
    chatId,
    phase: 'waiting_input',
    toolCount: 10,
    toolCompleted: 8,
    agentActivities: activities,
  }
}

function createMockDeps(engineMap: Map<string, WorkflowEngine>, sessions: Record<string, any> = {}, extra: Record<string, any> = {}) {
  return {
    workflowRegistry: {
      findByAgent: (agentId: string) => {
        for (const engine of engineMap.values()) {
          if (engine.isAgentPartOfWorkflow(agentId)) return engine
        }
        return undefined
      },
      get: (id: string) => engineMap.get(id),
      list: (statusFilter?: string) => {
        const result: Array<{ workflowId: string; chatId: string; status: string }> = []
        for (const engine of engineMap.values()) {
          if (!statusFilter || engine.status === statusFilter) {
            result.push({ workflowId: engine.workflowId, chatId: engine.chatId, status: engine.status })
          }
        }
        return result
      },
    },
    expertHandler: {
      getConnectionsViewingChat: () => [],
      getConnectionWs: () => null,
      handleStart: vi.fn().mockResolvedValue(undefined),
    },
    chatStore: { get: () => ({ workspaceId: 'ws-1' }) },
    workspaceStore: { get: () => ({ repositories: [{ path: '/tmp/repo' }] }) },
    sessionRegistry: {
      findByChat: (_chatId: string, agentId: string) => sessions[agentId] ?? null,
    },
    broadcastToChat: vi.fn(),
    watchdogIntervalMs: 999_999,
    ...extra,
  } as any
}

describe('WorkflowScheduler', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ws-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  // ── TC-4.1: waiting_input help request detection ──

  describe('waiting_input completion inference', () => {
    it('treats normal waiting_input as completion', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng-1', description: 'Build feature', dependsOn: [], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()
      engine.markTaskRunning('t1', 'eng-1')

      const engines = new Map([['wf', engine]])
      const scheduler = new WorkflowScheduler(createMockDeps(engines, {
        'eng-1': {
          activitySnapshot: { phase: 'waiting_input', logLine: 'All tasks completed successfully.', toolCount: 10, toolCompleted: 10, cost: 0.03 },
        },
      }))

      const payload = makePayload('chat-1', [
        makeAgentActivity('eng-1', 'waiting_input', 'All tasks completed successfully.'),
      ])

      scheduler.onActivityChanged(payload)

      const state = engine.getState().tasks['t1']
      expect(state.status).toBe('completed')

      engine.destroy()
    })

    it('treats help-seeking waiting_input as failure', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng-1', description: 'Build feature', dependsOn: [], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()
      engine.markTaskRunning('t1', 'eng-1')

      const engines = new Map([['wf', engine]])
      const scheduler = new WorkflowScheduler(createMockDeps(engines, {
        'eng-1': {
          activitySnapshot: { phase: 'waiting_input', logLine: 'I need help with the database configuration.', toolCount: 3, toolCompleted: 2, cost: 0.01 },
        },
      }))

      const payload = makePayload('chat-1', [
        makeAgentActivity('eng-1', 'waiting_input', 'I need help with the database configuration.'),
      ])

      scheduler.onActivityChanged(payload)

      const state = engine.getState().tasks['t1']
      expect(state.status).toBe('failed')

      engine.destroy()
    })

    const helpSignals = [
      'I need guidance on which approach to take',
      'I\'m blocked by a missing dependency',
      'I\'m stuck on the authentication flow',
      'I\'m unable to access the database',
      'I encountered an unexpected error in the build',
      'Cannot proceed without the API key',
      'Error: Module not found',
      'Failed to compile the TypeScript files',
      'What should I do about the conflicting types?',
      'Please provide the correct endpoint URL',
      'Could you clarify the expected behavior?',
    ]

    it.each(helpSignals)('detects help signal: "%s"', async (logLine) => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng-1', description: 'Task', dependsOn: [], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()
      engine.markTaskRunning('t1', 'eng-1')

      const engines = new Map([['wf', engine]])
      const scheduler = new WorkflowScheduler(createMockDeps(engines, {
        'eng-1': { activitySnapshot: { phase: 'waiting_input', logLine, toolCount: 5, toolCompleted: 3 } },
      }))

      scheduler.onActivityChanged(makePayload('chat-1', [
        makeAgentActivity('eng-1', 'waiting_input', logLine),
      ]))

      expect(engine.getState().tasks['t1'].status).toBe('failed')

      engine.destroy()
    })

    const normalOutputs = [
      'Implementation complete. Created 5 files.',
      'All tests passing.',
      'Feature implemented and verified.',
      undefined,
    ]

    it.each(normalOutputs)('treats normal output as completion: "%s"', async (logLine) => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng-1', description: 'Task', dependsOn: [], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()
      engine.markTaskRunning('t1', 'eng-1')

      const engines = new Map([['wf', engine]])
      const scheduler = new WorkflowScheduler(createMockDeps(engines, {
        'eng-1': { activitySnapshot: { phase: 'waiting_input', logLine, toolCount: 10, toolCompleted: 10 } },
      }))

      scheduler.onActivityChanged(makePayload('chat-1', [
        makeAgentActivity('eng-1', 'waiting_input', logLine),
      ]))

      expect(engine.getState().tasks['t1'].status).toBe('completed')

      engine.destroy()
    })
  })

  // ── TC-1.x: TaskResult enrichment ──

  describe('TaskResult summary enrichment', () => {
    it('includes logLine, toolCount, and cost in summary', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng-1', description: 'Build', dependsOn: [], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()
      engine.markTaskRunning('t1', 'eng-1')

      const engines = new Map([['wf', engine]])
      const scheduler = new WorkflowScheduler(createMockDeps(engines, {
        'eng-1': {
          activitySnapshot: {
            phase: 'waiting_input',
            logLine: 'Created settings page with 3 components.',
            toolCount: 15,
            toolCompleted: 12,
            cost: 0.0732,
          },
        },
      }))

      scheduler.onActivityChanged(makePayload('chat-1', [
        makeAgentActivity('eng-1', 'waiting_input', 'Created settings page with 3 components.'),
      ]))

      const summary = engine.getState().tasks['t1'].result?.summary ?? ''
      expect(summary).toContain('Last output: Created settings page with 3 components.')
      expect(summary).toContain('Tools used:')
      expect(summary).toContain('Cost: $')

      engine.destroy()
    })

    it('works without activitySnapshot (fallback to generic summary)', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng-1', description: 'Build', dependsOn: [], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()
      engine.markTaskRunning('t1', 'eng-1')

      const engines = new Map([['wf', engine]])
      const scheduler = new WorkflowScheduler(createMockDeps(engines))

      scheduler.onActivityChanged(makePayload('chat-1', [
        makeAgentActivity('eng-1', 'waiting_input'),
      ]))

      const summary = engine.getState().tasks['t1'].result?.summary ?? ''
      expect(summary).toContain('Agent eng-1 completed task t1')

      engine.destroy()
    })
  })

  // ── Deduplication: wokenLeadTasks prevents double-processing ──

  describe('deduplication', () => {
    it('does not process same task twice on repeated waiting_input', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng-1', description: 'Build', dependsOn: [], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()
      engine.markTaskRunning('t1', 'eng-1')

      const engines = new Map([['wf', engine]])
      const deps = createMockDeps(engines, {
        'eng-1': { activitySnapshot: { phase: 'waiting_input', toolCount: 5, toolCompleted: 5 } },
      })
      const scheduler = new WorkflowScheduler(deps)

      const recordSpy = vi.spyOn(engine, 'recordTaskResult')

      const payload = makePayload('chat-1', [
        makeAgentActivity('eng-1', 'waiting_input'),
      ])

      scheduler.onActivityChanged(payload)
      expect(engine.getState().tasks['t1'].status).toBe('completed')
      expect(recordSpy).toHaveBeenCalledTimes(1)

      scheduler.onActivityChanged(payload)
      // recordTaskResult should NOT be called a second time
      expect(recordSpy).toHaveBeenCalledTimes(1)

      engine.destroy()
      scheduler.destroy()
    })
  })

  // ── onAgentExited ──

  describe('onAgentExited', () => {
    it('records completion when agent exits with taskCompleted=true', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng-1', description: 'Build', dependsOn: [], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()
      engine.markTaskRunning('t1', 'eng-1')

      const engines = new Map([['wf', engine]])
      const scheduler = new WorkflowScheduler(createMockDeps(engines))

      scheduler.onAgentExited('chat-1', 'eng-1', 0, true)

      expect(engine.getState().tasks['t1'].status).toBe('completed')

      engine.destroy()
      scheduler.destroy()
    })

    it('records failure when agent exits with taskCompleted=false', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng-1', description: 'Build', dependsOn: [], onFailure: 'skip' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()
      engine.markTaskRunning('t1', 'eng-1')

      const engines = new Map([['wf', engine]])
      const scheduler = new WorkflowScheduler(createMockDeps(engines))

      scheduler.onAgentExited('chat-1', 'eng-1', 1, false)

      expect(engine.getState().tasks['t1'].status).toBe('skipped')

      engine.destroy()
      scheduler.destroy()
    })

    it('skips if task already handled by activity-based completion', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng-1', description: 'Build', dependsOn: [], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()
      engine.markTaskRunning('t1', 'eng-1')

      const engines = new Map([['wf', engine]])
      const scheduler = new WorkflowScheduler(createMockDeps(engines, {
        'eng-1': { activitySnapshot: { phase: 'waiting_input', toolCount: 5, toolCompleted: 5 } },
      }))

      scheduler.onActivityChanged(makePayload('chat-1', [
        makeAgentActivity('eng-1', 'waiting_input'),
      ]))
      expect(engine.getState().tasks['t1'].status).toBe('completed')

      scheduler.onAgentExited('chat-1', 'eng-1', 0, true)
      expect(engine.getState().tasks['t1'].status).toBe('completed')

      engine.destroy()
      scheduler.destroy()
    })
  })

  // ── L1: Notification Queue ──

  describe('L1: Notification Queue', () => {
    it('queues notification when Lead is busy and drains as single merged prompt on idle', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng-1', description: 'Build feature', dependsOn: [], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()

      const mockPrompt = vi.fn().mockResolvedValue(undefined)
      const engines = new Map([['wf', engine]])

      const deps = createMockDeps(engines, {
        'lead': {
          sessionId: 'lead-sess',
          acpClient: { isAlive: () => true, prompt: mockPrompt },
          activitySnapshot: { phase: 'running' },
        },
      })
      const scheduler = new WorkflowScheduler(deps)

      // Directly enqueue notifications (simulating what wakeLeadAgent does when Lead is busy)
      ;(scheduler as any).enqueueNotification('chat-1', '[Workflow progress: wf-1] Task completed')
      ;(scheduler as any).enqueueNotification('chat-1', '[Workflow progress: wf-1] Another task done')

      // Verify queue has entries
      expect((scheduler as any).pendingNotifications.get('chat-1')?.length).toBe(2)

      // prompt should NOT have been called yet (Lead is busy)
      expect(mockPrompt).not.toHaveBeenCalled()

      // Now Lead becomes idle — update session to reflect waiting_input
      deps.sessionRegistry.findByChat = (_chatId: string, agentId: string) => {
        if (agentId === 'lead') return {
          sessionId: 'lead-sess',
          acpClient: { isAlive: () => true, prompt: mockPrompt },
          activitySnapshot: { phase: 'waiting_input' },
        }
        return null
      }

      // Simulate Lead entering waiting_input
      scheduler.onActivityChanged(makePayload('chat-1', [
        makeAgentActivity('lead', 'waiting_input'),
      ]))

      // Queue should have been drained as a single merged prompt
      expect(mockPrompt).toHaveBeenCalledTimes(1)
      const mergedPrompt = mockPrompt.mock.calls[0][1]
      expect(mergedPrompt).toContain('[Batched workflow updates: 2 notifications]')
      expect(mergedPrompt).toContain('[Workflow progress: wf-1] Task completed')
      expect(mergedPrompt).toContain('[Workflow progress: wf-1] Another task done')
      expect((scheduler as any).pendingNotifications.has('chat-1')).toBe(false)

      engine.destroy()
      scheduler.destroy()
    })

    it('drains single queued prompt without batching wrapper', async () => {
      const dag = makeDag({ tasks: [] })
      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()

      const mockPrompt = vi.fn().mockResolvedValue(undefined)
      const engines = new Map([['wf', engine]])

      const deps = createMockDeps(engines, {
        'lead': {
          sessionId: 'lead-sess',
          acpClient: { isAlive: () => true, prompt: mockPrompt },
          activitySnapshot: { phase: 'running' },
        },
      })
      const scheduler = new WorkflowScheduler(deps)

      ;(scheduler as any).enqueueNotification('chat-1', '[Workflow progress: wf-1] Single update')

      deps.sessionRegistry.findByChat = (_chatId: string, agentId: string) => {
        if (agentId === 'lead') return {
          sessionId: 'lead-sess',
          acpClient: { isAlive: () => true, prompt: mockPrompt },
          activitySnapshot: { phase: 'waiting_input' },
        }
        return null
      }

      scheduler.onActivityChanged(makePayload('chat-1', [
        makeAgentActivity('lead', 'waiting_input'),
      ]))

      expect(mockPrompt).toHaveBeenCalledTimes(1)
      // Single prompt should NOT have the batching wrapper
      expect(mockPrompt.mock.calls[0][1]).toBe('[Workflow progress: wf-1] Single update')

      engine.destroy()
      scheduler.destroy()
    })

    it('bounds queue at 20 entries per chatId', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng-1', description: 'Build', dependsOn: [], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()

      const engines = new Map([['wf', engine]])
      const deps = createMockDeps(engines, {
        'lead': {
          sessionId: 'lead-sess',
          acpClient: { isAlive: () => true, prompt: vi.fn().mockResolvedValue(undefined) },
          activitySnapshot: { phase: 'running' },
        },
      })
      const scheduler = new WorkflowScheduler(deps)

      // Manually enqueue 25 notifications via the public notifyLead (which routes through wakeLeadAgent internally)
      // We'll access the internal method indirectly by simulating repeated task completions
      // Instead, test via the clearQueueForChat being accessible
      for (let i = 0; i < 25; i++) {
        ;(scheduler as any).enqueueNotification('chat-1', `prompt-${i}`)
      }

      const queue = (scheduler as any).pendingNotifications.get('chat-1')
      expect(queue.length).toBe(20)
      // Oldest entries dropped — first entry should be prompt-5
      expect(queue[0]).toBe('prompt-5')
      expect(queue[19]).toBe('prompt-24')

      engine.destroy()
      scheduler.destroy()
    })

    it('clears queue when workflow completes', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng-1', description: 'Build', dependsOn: [], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()
      engine.markTaskRunning('t1', 'eng-1')

      const engines = new Map([['wf', engine]])
      const deps = createMockDeps(engines, {
        'lead': {
          sessionId: 'lead-sess',
          acpClient: { isAlive: () => true, prompt: vi.fn().mockResolvedValue(undefined) },
          activitySnapshot: { phase: 'running' },
        },
        'eng-1': { activitySnapshot: { phase: 'waiting_input', toolCount: 5, toolCompleted: 5 } },
      })
      const scheduler = new WorkflowScheduler(deps)

      // Pre-fill queue
      ;(scheduler as any).enqueueNotification('chat-1', 'old-prompt')

      // Task completes — workflow has single task so it will also complete
      scheduler.onActivityChanged(makePayload('chat-1', [
        makeAgentActivity('eng-1', 'waiting_input', 'Done.'),
      ]))

      expect(engine.status).toBe('completed')
      expect((scheduler as any).pendingNotifications.has('chat-1')).toBe(false)

      engine.destroy()
      scheduler.destroy()
    })
  })

  // ── wokenLeadTasks cleanup ──

  describe('wokenLeadTasks cleanup', () => {
    it('clears taskId on rejection so re-notification works', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng-1', description: 'Build', dependsOn: [], onFailure: 'stop', maxRejects: 3 },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()
      engine.markTaskRunning('t1', 'eng-1')

      const engines = new Map([['wf', engine]])
      const deps = createMockDeps(engines, {
        'eng-1': { activitySnapshot: { phase: 'waiting_input', toolCount: 5, toolCompleted: 5 } },
      })
      const scheduler = new WorkflowScheduler(deps)
      const recordSpy = vi.spyOn(engine, 'recordTaskResult')

      // First completion
      scheduler.onActivityChanged(makePayload('chat-1', [
        makeAgentActivity('eng-1', 'waiting_input', 'Done.'),
      ]))
      expect(engine.getState().tasks['t1'].status).toBe('completed')
      expect(recordSpy).toHaveBeenCalledTimes(1)

      // Reject the task — this resets it to pending
      engine.rejectTask('t1', 'Missing tests')
      scheduler.onTaskRejected('t1')
      expect(engine.getState().tasks['t1'].status).toBe('pending')

      // Re-run the task
      engine.markTaskRunning('t1', 'eng-1')

      // Second waiting_input should be processed (not blocked by wokenLeadTasks)
      scheduler.onActivityChanged(makePayload('chat-1', [
        makeAgentActivity('eng-1', 'waiting_input', 'Added tests.'),
      ]))
      expect(recordSpy).toHaveBeenCalledTimes(2)
      expect(engine.getState().tasks['t1'].status).toBe('completed')

      engine.destroy()
      scheduler.destroy()
    })

    it('clears all wokenLeadTasks when workflow completes', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng-1', description: 'Build', dependsOn: [], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()
      engine.markTaskRunning('t1', 'eng-1')

      const engines = new Map([['wf', engine]])
      const deps = createMockDeps(engines, {
        'eng-1': { activitySnapshot: { phase: 'waiting_input', toolCount: 5, toolCompleted: 5 } },
      })
      const scheduler = new WorkflowScheduler(deps)

      scheduler.onActivityChanged(makePayload('chat-1', [
        makeAgentActivity('eng-1', 'waiting_input', 'Done.'),
      ]))

      // Workflow completed (single task)
      expect(engine.status).toBe('completed')
      // wokenLeadTasks should be cleared
      expect((scheduler as any).wokenLeadTasks.has('t1')).toBe(false)

      engine.destroy()
      scheduler.destroy()
    })
  })

  // ── L2: Watchdog Timer ──

  describe('L2: Watchdog Timer', () => {
    it('recovers stuck workflow when stale >180s with ready tasks', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng-1', description: 'First', dependsOn: [], onFailure: 'stop' },
          { taskId: 't2', agentId: 'eng-2', description: 'Second', dependsOn: ['t1'], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()

      // Simulate t1 completed but t2 never started (stuck)
      engine.markTaskRunning('t1', 'eng-1')
      engine.recordTaskResult('t1', {
        taskId: 't1',
        executor: 'eng-1',
        status: 'completed',
        summary: 'Done',
        artifacts: [],
        modifiedFiles: [],
      })

      // Manually set updatedAt to >180s ago
      const state = engine.getState() as any
      state.updatedAt = new Date(Date.now() - 200_000).toISOString()

      // Key must match actual workflowId for registry.get() to find it
      const engines = new Map([[engine.workflowId, engine]])
      const deps = createMockDeps(engines)
      const scheduler = new WorkflowScheduler(deps)

      // Manually trigger watchdog scan
      ;(scheduler as any).watchdogScan()

      // t2 should now be running
      expect(engine.getState().tasks['t2'].status).toBe('running')
      expect(deps.expertHandler.handleStart).toHaveBeenCalled()

      engine.destroy()
      scheduler.destroy()
    })

    it('does not recover workflow updated recently', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng-1', description: 'First', dependsOn: [], onFailure: 'stop' },
          { taskId: 't2', agentId: 'eng-2', description: 'Second', dependsOn: ['t1'], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()

      engine.markTaskRunning('t1', 'eng-1')
      engine.recordTaskResult('t1', {
        taskId: 't1',
        executor: 'eng-1',
        status: 'completed',
        summary: 'Done',
        artifacts: [],
        modifiedFiles: [],
      })

      // updatedAt is fresh (just updated by recordTaskResult)
      const engines = new Map([['wf', engine]])
      const deps = createMockDeps(engines)
      const scheduler = new WorkflowScheduler(deps)

      ;(scheduler as any).watchdogScan()

      // t2 should NOT be started yet (not stale)
      expect(engine.getState().tasks['t2'].status).toBe('pending')
      expect(deps.expertHandler.handleStart).not.toHaveBeenCalled()

      engine.destroy()
      scheduler.destroy()
    })

    it('does not recover workflow with running tasks', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng-1', description: 'First', dependsOn: [], onFailure: 'stop' },
          { taskId: 't2', agentId: 'eng-2', description: 'Second', dependsOn: [], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()
      engine.markTaskRunning('t1', 'eng-1')

      // Make it stale (>180s)
      const state = engine.getState() as any
      state.updatedAt = new Date(Date.now() - 200_000).toISOString()

      const engines = new Map([[engine.workflowId, engine]])
      const deps = createMockDeps(engines)
      const scheduler = new WorkflowScheduler(deps)

      ;(scheduler as any).watchdogScan()

      // t2 should NOT be started (t1 is still running)
      expect(deps.expertHandler.handleStart).not.toHaveBeenCalled()

      engine.destroy()
      scheduler.destroy()
    })
  })

  // ── L3: autoAdvance ──

  describe('L3: autoAdvance', () => {
    it('immediately advances downstream tasks when autoAdvance=true', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng-1', description: 'Build', dependsOn: [], onFailure: 'stop', autoAdvance: true },
          { taskId: 't2', agentId: 'eng-2', description: 'Test', dependsOn: ['t1'], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()
      engine.markTaskRunning('t1', 'eng-1')

      const engines = new Map([['wf', engine]])
      const deps = createMockDeps(engines, {
        'eng-1': { activitySnapshot: { phase: 'waiting_input', toolCount: 10, toolCompleted: 10 } },
      })
      const scheduler = new WorkflowScheduler(deps)

      scheduler.onActivityChanged(makePayload('chat-1', [
        makeAgentActivity('eng-1', 'waiting_input', 'Feature complete.'),
      ]))

      // t1 completed and t2 should be immediately started (autoAdvance)
      expect(engine.getState().tasks['t1'].status).toBe('completed')
      expect(engine.getState().tasks['t2'].status).toBe('running')
      expect(deps.expertHandler.handleStart).toHaveBeenCalled()

      engine.destroy()
      scheduler.destroy()
    })

    it('does not auto-advance when autoAdvance is not set', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng-1', description: 'Build', dependsOn: [], onFailure: 'stop' },
          { taskId: 't2', agentId: 'eng-2', description: 'Test', dependsOn: ['t1'], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()
      engine.markTaskRunning('t1', 'eng-1')

      const engines = new Map([['wf', engine]])
      const deps = createMockDeps(engines, {
        'eng-1': { activitySnapshot: { phase: 'waiting_input', toolCount: 10, toolCompleted: 10 } },
      })
      const scheduler = new WorkflowScheduler(deps)

      scheduler.onActivityChanged(makePayload('chat-1', [
        makeAgentActivity('eng-1', 'waiting_input', 'Feature complete.'),
      ]))

      // t1 completed but t2 should NOT be started (no autoAdvance, waits for Lead)
      expect(engine.getState().tasks['t1'].status).toBe('completed')
      expect(engine.getState().tasks['t2'].status).toBe('pending')

      engine.destroy()
      scheduler.destroy()
    })

    it('does not auto-advance on task failure even with autoAdvance=true', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng-1', description: 'Build', dependsOn: [], onFailure: 'stop', autoAdvance: true },
          { taskId: 't2', agentId: 'eng-2', description: 'Test', dependsOn: ['t1'], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()
      engine.markTaskRunning('t1', 'eng-1')

      const engines = new Map([['wf', engine]])
      const deps = createMockDeps(engines, {
        'eng-1': { activitySnapshot: { phase: 'waiting_input', toolCount: 3, toolCompleted: 2 } },
      })
      const scheduler = new WorkflowScheduler(deps)

      scheduler.onActivityChanged(makePayload('chat-1', [
        makeAgentActivity('eng-1', 'waiting_input', 'I need help with the config.'),
      ]))

      // t1 failed (help request detected), t2 should be skipped (stop policy), not advanced
      expect(engine.getState().tasks['t1'].status).toBe('failed')
      expect(engine.getState().tasks['t2'].status).toBe('skipped')

      engine.destroy()
      scheduler.destroy()
    })
  })
})
