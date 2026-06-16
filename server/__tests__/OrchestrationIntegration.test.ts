import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { WorkflowEngine } from '../orchestration/WorkflowEngine'
import { WorkflowScheduler } from '../orchestration/WorkflowScheduler'
import type { WorkflowDAG } from '../../shared/workflow-types'
import type { ChatActivityPayload, AgentActivitySnapshot } from '../terminal/ActivityAggregator'

function makeDag(overrides?: Partial<WorkflowDAG>): WorkflowDAG {
  return {
    id: `wf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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
    toolCompleted: 10,
    cost: 0.05,
    logLine,
  }
}

function makePayload(chatId: string, activities: AgentActivitySnapshot[]): ChatActivityPayload {
  return {
    chatId,
    phase: 'waiting_input',
    toolCount: 10,
    toolCompleted: 10,
    agentActivities: activities,
  }
}

function createMockDeps(engineMap: Map<string, WorkflowEngine>, sessions: Record<string, any> = {}) {
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
    workspaceStore: { get: () => ({ repositories: [] }) },
    sessionRegistry: {
      findByChat: (_chatId: string, agentId: string) => sessions[agentId] ?? null,
    },
    broadcastToChat: vi.fn(),
    watchdogIntervalMs: 999_999,
  } as any
}

describe('OrchestrationIntegration', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'orch-int-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  // ── TC-1: Lead dispatch → complete → re-dispatch same agent ──

  describe('dispatch → complete → re-dispatch same agent', () => {
    it('second dispatch of same agentId starts normally after first completion', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng-1', description: 'First task', dependsOn: [], onFailure: 'stop', autoAdvance: true },
          { taskId: 't2', agentId: 'eng-1', description: 'Second task (same agent)', dependsOn: ['t1'], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()
      engine.markTaskRunning('t1', 'eng-1')

      const engines = new Map([[engine.workflowId, engine]])
      const deps = createMockDeps(engines, {
        'eng-1': {
          activitySnapshot: { phase: 'waiting_input', toolCount: 10, toolCompleted: 10, cost: 0.03 },
        },
      })
      const scheduler = new WorkflowScheduler(deps)

      // First task completes (eng-1 enters waiting_input)
      scheduler.onActivityChanged(makePayload('chat-1', [
        makeAgentActivity('eng-1', 'waiting_input', 'Task 1 done.'),
      ]))

      // t1 should be completed
      expect(engine.getState().tasks['t1'].status).toBe('completed')

      // autoAdvance on t1 fires startTask asynchronously — flush microtasks
      await new Promise(r => setTimeout(r, 0))

      // t2 should be running because t1 has autoAdvance=true and t2 depends on t1
      expect(engine.getState().tasks['t2'].status).toBe('running')
      expect(deps.expertHandler.handleStart).toHaveBeenCalled()

      // Verify handleStart was called with agentId 'eng-1' for the second task
      const eng1Calls = deps.expertHandler.handleStart.mock.calls
        .filter((call: any[]) => call[1].agentId === 'eng-1')
      expect(eng1Calls.length).toBeGreaterThanOrEqual(1)

      engine.destroy()
      scheduler.destroy()
    })
  })

  // ── TC-2: Two sequential tasks using the same agentId ──

  describe('sequential tasks with same agentId', () => {
    it('second task starts after first completes via advanceWorkflow', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng-1', description: 'Build feature', dependsOn: [], onFailure: 'stop' },
          { taskId: 't2', agentId: 'eng-1', description: 'Add tests', dependsOn: ['t1'], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()

      const engines = new Map([[engine.workflowId, engine]])
      const deps = createMockDeps(engines, {
        'eng-1': {
          activitySnapshot: { phase: 'waiting_input', toolCount: 10, toolCompleted: 10 },
        },
      })
      const scheduler = new WorkflowScheduler(deps)

      // Start and complete first task
      engine.markTaskRunning('t1', 'eng-1')
      scheduler.onActivityChanged(makePayload('chat-1', [
        makeAgentActivity('eng-1', 'waiting_input', 'Feature built.'),
      ]))

      expect(engine.getState().tasks['t1'].status).toBe('completed')
      expect(engine.getState().tasks['t2'].status).toBe('pending')

      // Lead decides to advance workflow
      const result = scheduler.advanceWorkflow(engine.workflowId)
      expect(result.started).toContain('t2')
      expect(engine.getState().tasks['t2'].status).toBe('running')

      // Verify handleStart was called for t2 with the same agentId
      expect(deps.expertHandler.handleStart).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ agentId: 'eng-1' }),
        expect.any(String),
      )

      engine.destroy()
      scheduler.destroy()
    })
  })

  // ── TC-3: Parallel tasks ──

  describe('parallel tasks all start', () => {
    it('schedules all independent tasks in parallel', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng-1', description: 'Build A', dependsOn: [], onFailure: 'stop' },
          { taskId: 't2', agentId: 'eng-2', description: 'Build B', dependsOn: [], onFailure: 'stop' },
          { taskId: 't3', agentId: 'eng-3', description: 'Build C', dependsOn: [], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()

      const engines = new Map([[engine.workflowId, engine]])
      const deps = createMockDeps(engines)
      const scheduler = new WorkflowScheduler(deps)

      scheduler.scheduleWorkflow(engine)

      // All three tasks should be running
      expect(engine.getState().tasks['t1'].status).toBe('running')
      expect(engine.getState().tasks['t2'].status).toBe('running')
      expect(engine.getState().tasks['t3'].status).toBe('running')

      // handleStart should have been called 3 times
      expect(deps.expertHandler.handleStart).toHaveBeenCalledTimes(3)

      engine.destroy()
      scheduler.destroy()
    })
  })

  // ── TC-4: Handoff chain — simulated through workflow reassignment ──

  describe('handoff chain: agent A → agent B (same type)', () => {
    it('reassignment updates task executor and second agent can complete the task', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'agent-a', description: 'Complex task', dependsOn: [], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()
      engine.markTaskRunning('t1', 'agent-a')

      // Simulate handoff: agent-a reassigns to agent-b
      engine.reassignTask('t1', 'agent-b')

      expect(engine.getState().tasks['t1'].agentId).toBe('agent-b')
      expect(engine.getState().tasks['t1'].status).toBe('running')

      // Now agent-b completes the task
      const engines = new Map([[engine.workflowId, engine]])
      const deps = createMockDeps(engines, {
        'agent-b': {
          activitySnapshot: { phase: 'waiting_input', toolCount: 15, toolCompleted: 15, cost: 0.08 },
        },
      })
      const scheduler = new WorkflowScheduler(deps)

      scheduler.onActivityChanged(makePayload('chat-1', [
        makeAgentActivity('agent-b', 'waiting_input', 'Task completed after handoff.'),
      ]))

      expect(engine.getState().tasks['t1'].status).toBe('completed')
      expect(engine.getState().tasks['t1'].result?.executor).toBe('agent-b')

      engine.destroy()
      scheduler.destroy()
    })
  })

  // ── TC-5: Complete workflow lifecycle — all tasks complete ──

  describe('complete workflow lifecycle', () => {
    it('workflow transitions to completed when all tasks finish', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng-1', description: 'Step 1', dependsOn: [], onFailure: 'stop', autoAdvance: true },
          { taskId: 't2', agentId: 'eng-2', description: 'Step 2', dependsOn: ['t1'], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()
      engine.markTaskRunning('t1', 'eng-1')

      const engines = new Map([[engine.workflowId, engine]])
      const deps = createMockDeps(engines, {
        'eng-1': {
          activitySnapshot: { phase: 'waiting_input', toolCount: 5, toolCompleted: 5 },
        },
      })
      const scheduler = new WorkflowScheduler(deps)

      // Complete t1 — autoAdvance triggers t2
      scheduler.onActivityChanged(makePayload('chat-1', [
        makeAgentActivity('eng-1', 'waiting_input', 'Step 1 done.'),
      ]))

      expect(engine.getState().tasks['t1'].status).toBe('completed')
      expect(engine.getState().tasks['t2'].status).toBe('running')

      // Update session registry to include eng-2
      deps.sessionRegistry.findByChat = (_chatId: string, agentId: string) => {
        if (agentId === 'eng-2') return {
          activitySnapshot: { phase: 'waiting_input', toolCount: 8, toolCompleted: 8, cost: 0.04 },
        }
        return null
      }

      // Complete t2
      scheduler.onActivityChanged(makePayload('chat-1', [
        makeAgentActivity('eng-2', 'waiting_input', 'Step 2 done.'),
      ]))

      expect(engine.getState().tasks['t2'].status).toBe('completed')
      expect(engine.status).toBe('completed')

      engine.destroy()
      scheduler.destroy()
    })
  })

  // ── TC-6: Agent exits and re-dispatch via onAgentExited ──

  describe('agent exit then re-dispatch', () => {
    it('exit handler records result, subsequent advance starts next task', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng-1', description: 'Build', dependsOn: [], onFailure: 'stop' },
          { taskId: 't2', agentId: 'eng-1', description: 'Test', dependsOn: ['t1'], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()
      engine.markTaskRunning('t1', 'eng-1')

      const engines = new Map([[engine.workflowId, engine]])
      const deps = createMockDeps(engines)
      const scheduler = new WorkflowScheduler(deps)

      // Agent exits with taskCompleted=true
      scheduler.onAgentExited('chat-1', 'eng-1', 0, true)

      expect(engine.getState().tasks['t1'].status).toBe('completed')

      // Lead-driven advance
      const result = scheduler.advanceWorkflow(engine.workflowId)
      expect(result.started).toContain('t2')
      expect(engine.getState().tasks['t2'].status).toBe('running')

      engine.destroy()
      scheduler.destroy()
    })
  })

  // ── TC-7: Failed task stops downstream tasks ──

  describe('failed task with stop policy', () => {
    it('marks downstream tasks as skipped when upstream fails', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng-1', description: 'Build', dependsOn: [], onFailure: 'stop' },
          { taskId: 't2', agentId: 'eng-2', description: 'Deploy', dependsOn: ['t1'], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()
      engine.markTaskRunning('t1', 'eng-1')

      const engines = new Map([[engine.workflowId, engine]])
      const deps = createMockDeps(engines, {
        'eng-1': {
          activitySnapshot: { phase: 'waiting_input', toolCount: 3, toolCompleted: 2 },
        },
      })
      const scheduler = new WorkflowScheduler(deps)

      // eng-1 reports help request → treated as failure
      scheduler.onActivityChanged(makePayload('chat-1', [
        makeAgentActivity('eng-1', 'waiting_input', 'I need help with the build configuration.'),
      ]))

      expect(engine.getState().tasks['t1'].status).toBe('failed')
      expect(engine.getState().tasks['t2'].status).toBe('skipped')
      expect(engine.status).toBe('stopped')

      engine.destroy()
      scheduler.destroy()
    })
  })

  // ── TC-8: startTask deduplication via startingTasks ──

  describe('startTask deduplication', () => {
    it('does not start same task twice in rapid succession', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng-1', description: 'Build', dependsOn: [], onFailure: 'stop' },
          { taskId: 't2', agentId: 'eng-2', description: 'Test', dependsOn: [], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()

      const engines = new Map([[engine.workflowId, engine]])
      const deps = createMockDeps(engines)
      const scheduler = new WorkflowScheduler(deps)

      // Schedule the workflow twice in rapid succession
      scheduler.scheduleWorkflow(engine)
      scheduler.scheduleWorkflow(engine)

      // Each task should only be started once
      // t1 and t2 should each appear once in handleStart calls
      const startedAgentIds = deps.expertHandler.handleStart.mock.calls.map(
        (call: any[]) => call[1].agentId,
      )
      expect(startedAgentIds.filter((id: string) => id === 'eng-1')).toHaveLength(1)
      expect(startedAgentIds.filter((id: string) => id === 'eng-2')).toHaveLength(1)

      engine.destroy()
      scheduler.destroy()
    })
  })

  // ── TC-9: broadcastToChat sends workflow:task-updated events ──

  describe('workflow:task-updated broadcast', () => {
    it('sends task status updates via broadcastToChat', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng-1', description: 'Build', dependsOn: [], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()
      engine.markTaskRunning('t1', 'eng-1')

      const engines = new Map([[engine.workflowId, engine]])
      const deps = createMockDeps(engines, {
        'eng-1': {
          activitySnapshot: { phase: 'waiting_input', toolCount: 5, toolCompleted: 5 },
        },
      })
      const scheduler = new WorkflowScheduler(deps)

      scheduler.onActivityChanged(makePayload('chat-1', [
        makeAgentActivity('eng-1', 'waiting_input', 'Done.'),
      ]))

      const taskUpdates = deps.broadcastToChat.mock.calls
        .filter(([, msg]: [string, any]) => msg.type === 'workflow:task-updated')
      expect(taskUpdates.length).toBeGreaterThanOrEqual(1)
      expect(taskUpdates[0][1].payload.status).toBe('completed')

      engine.destroy()
      scheduler.destroy()
    })
  })
})
