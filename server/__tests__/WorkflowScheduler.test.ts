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

      const payload = makePayload('chat-1', [
        makeAgentActivity('eng-1', 'waiting_input'),
      ])

      scheduler.onActivityChanged(payload)
      expect(engine.getState().tasks['t1'].status).toBe('completed')

      scheduler.onActivityChanged(payload)
      expect(deps.expertHandler.handleStart).toHaveBeenCalledTimes(1)

      engine.destroy()
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
    })
  })
})
