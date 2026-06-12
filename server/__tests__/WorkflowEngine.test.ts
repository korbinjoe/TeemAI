import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { WorkflowEngine } from '../orchestration/WorkflowEngine'
import type { WorkflowDAG } from '../../shared/workflow-types'
import type { TaskResult } from '../../shared/agent-message-types'

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

function makeResult(taskId: string, status: TaskResult['status'] = 'completed'): TaskResult {
  return {
    taskId,
    executor: 'test-agent',
    status,
    summary: `Task ${taskId} ${status}`,
    artifacts: [],
    modifiedFiles: [],
    failureReason: status === 'failed' ? 'test_failure' : undefined,
  }
}

describe('WorkflowEngine', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'wf-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  // ── TC-4.2: Skip policy lets dependents proceed ──

  describe('skip failure policy', () => {
    it('marks failed task as skipped so dependents become ready', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 'auth', agentId: 'eng', description: 'Implement auth', dependsOn: [], onFailure: 'skip' },
          { taskId: 'dashboard', agentId: 'eng', description: 'Implement dashboard', dependsOn: ['auth'], onFailure: 'stop' },
          { taskId: 'deploy', agentId: 'devops', description: 'Deploy', dependsOn: ['auth', 'dashboard'], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()

      engine.markTaskRunning('auth')
      engine.recordTaskResult('auth', makeResult('auth', 'failed'))

      const authState = engine.getState().tasks['auth']
      expect(authState.status).toBe('skipped')

      const ready = engine.getReadyTasks()
      expect(ready.map(t => t.taskId)).toContain('dashboard')
    })

    it('does not skip other pending tasks (unlike stop policy)', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng', description: 'Task 1', dependsOn: [], onFailure: 'skip' },
          { taskId: 't2', agentId: 'eng', description: 'Task 2 (independent)', dependsOn: [], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()

      engine.markTaskRunning('t1')
      engine.recordTaskResult('t1', makeResult('t1', 'failed'))

      const t2State = engine.getState().tasks['t2']
      expect(t2State.status).toBe('pending')
    })

    it('still retries before skipping when retry policy is set', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng', description: 'Retry then skip', dependsOn: [], onFailure: 'retry', maxRetries: 1 },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()

      engine.markTaskRunning('t1')
      engine.recordTaskResult('t1', makeResult('t1', 'failed'))

      expect(engine.getState().tasks['t1'].status).toBe('pending')
      expect(engine.getState().tasks['t1'].retryCount).toBe(1)

      engine.markTaskRunning('t1')
      engine.recordTaskResult('t1', makeResult('t1', 'failed'))

      expect(engine.getState().tasks['t1'].status).toBe('failed')
    })
  })

  // ── TC-4.2 complement: Stop policy comparison ──

  describe('stop failure policy', () => {
    it('skips all pending tasks and stops workflow', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng', description: 'Will fail', dependsOn: [], onFailure: 'stop' },
          { taskId: 't2', agentId: 'eng', description: 'Should be skipped', dependsOn: [], onFailure: 'stop' },
          { taskId: 't3', agentId: 'eng', description: 'Also skipped', dependsOn: ['t1'], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()

      engine.markTaskRunning('t1')
      engine.recordTaskResult('t1', makeResult('t1', 'failed'))

      expect(engine.status).toBe('stopped')
      expect(engine.getState().tasks['t2'].status).toBe('skipped')
      expect(engine.getState().tasks['t3'].status).toBe('skipped')
    })
  })

  // ── TC-4.3: Timeout triggers failure ──

  describe('task timeout', () => {
    it('records task failure on timeout', async () => {
      vi.useFakeTimers()

      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng', description: 'Slow task', dependsOn: [], onFailure: 'stop', timeoutMinutes: 1 },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()

      engine.markTaskRunning('t1')
      expect(engine.getState().tasks['t1'].status).toBe('running')

      vi.advanceTimersByTime(60 * 1000)

      const state = engine.getState().tasks['t1']
      expect(state.status).toBe('failed')
      expect(state.failureReason).toBe('timeout')

      engine.destroy()
      vi.useRealTimers()
    })

    it('timeout with stop policy halts entire workflow', async () => {
      vi.useFakeTimers()

      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng', description: 'Slow', dependsOn: [], onFailure: 'stop', timeoutMinutes: 1 },
          { taskId: 't2', agentId: 'eng', description: 'Downstream', dependsOn: ['t1'], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()

      engine.markTaskRunning('t1')
      vi.advanceTimersByTime(60 * 1000)

      expect(engine.status).toBe('stopped')
      expect(engine.getState().tasks['t2'].status).toBe('skipped')

      engine.destroy()
      vi.useRealTimers()
    })

    it('timeout with skip policy lets dependents proceed', async () => {
      vi.useFakeTimers()

      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng', description: 'Slow', dependsOn: [], onFailure: 'skip', timeoutMinutes: 1 },
          { taskId: 't2', agentId: 'eng', description: 'Downstream', dependsOn: ['t1'], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()

      engine.markTaskRunning('t1')
      vi.advanceTimersByTime(60 * 1000)

      expect(engine.getState().tasks['t1'].status).toBe('skipped')

      const ready = engine.getReadyTasks()
      expect(ready.map(t => t.taskId)).toContain('t2')

      engine.destroy()
      vi.useRealTimers()
    })

    it('does not fire if task completes before timeout', async () => {
      vi.useFakeTimers()

      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng', description: 'Fast', dependsOn: [], onFailure: 'stop', timeoutMinutes: 5 },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()

      engine.markTaskRunning('t1')
      engine.recordTaskResult('t1', makeResult('t1', 'completed'))

      vi.advanceTimersByTime(5 * 60 * 1000)

      expect(engine.getState().tasks['t1'].status).toBe('completed')

      engine.destroy()
      vi.useRealTimers()
    })
  })

  // ── DAG dependency resolution ──

  describe('dependency resolution', () => {
    it('parallel tasks with no deps are all ready immediately', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 'a', agentId: 'eng', description: 'A', dependsOn: [], onFailure: 'stop' },
          { taskId: 'b', agentId: 'eng', description: 'B', dependsOn: [], onFailure: 'stop' },
          { taskId: 'c', agentId: 'eng', description: 'C', dependsOn: [], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()

      const ready = engine.getReadyTasks()
      expect(ready).toHaveLength(3)
    })

    it('dependent task only becomes ready after all deps complete', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 'a', agentId: 'eng', description: 'A', dependsOn: [], onFailure: 'stop' },
          { taskId: 'b', agentId: 'eng', description: 'B', dependsOn: [], onFailure: 'stop' },
          { taskId: 'c', agentId: 'eng', description: 'C', dependsOn: ['a', 'b'], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()

      expect(engine.getReadyTasks().map(t => t.taskId)).not.toContain('c')

      engine.markTaskRunning('a')
      engine.recordTaskResult('a', makeResult('a'))

      expect(engine.getReadyTasks().map(t => t.taskId)).not.toContain('c')

      engine.markTaskRunning('b')
      engine.recordTaskResult('b', makeResult('b'))

      expect(engine.getReadyTasks().map(t => t.taskId)).toContain('c')
    })
  })

  // ── Task rejection ──

  describe('task rejection', () => {
    it('rejects a completed task and resets it to pending with feedback', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng', description: 'Implement', dependsOn: [], onFailure: 'stop' },
          { taskId: 't2', agentId: 'reviewer', description: 'Review', dependsOn: ['t1'], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()

      engine.markTaskRunning('t1')
      engine.recordTaskResult('t1', makeResult('t1'))
      expect(engine.getState().tasks['t1'].status).toBe('completed')

      const result = engine.rejectTask('t1', 'No files were modified')
      expect(result).toBe('rejected')

      const ts = engine.getState().tasks['t1']
      expect(ts.status).toBe('pending')
      expect(ts.rejectionFeedback).toBe('No files were modified')
      expect(ts.rejectCount).toBe(1)
      expect(ts.result).toBeUndefined()
      expect(ts.completedAt).toBeUndefined()

      engine.destroy()
    })

    it('emits task-rejected event on rejection', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng', description: 'Task', dependsOn: [], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()

      const rejected = vi.fn()
      engine.on('task-rejected', rejected)

      engine.markTaskRunning('t1')
      engine.recordTaskResult('t1', makeResult('t1'))
      engine.rejectTask('t1', 'review.md is empty')

      expect(rejected).toHaveBeenCalledWith('t1', 'review.md is empty')

      engine.destroy()
    })

    it('returns cap_reached when maxRejects is exceeded', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng', description: 'Task', dependsOn: [], onFailure: 'stop', maxRejects: 1 },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()

      engine.markTaskRunning('t1')
      engine.recordTaskResult('t1', makeResult('t1'))

      const r1 = engine.rejectTask('t1', 'first rejection')
      expect(r1).toBe('rejected')

      engine.markTaskRunning('t1')
      engine.recordTaskResult('t1', makeResult('t1'))

      const r2 = engine.rejectTask('t1', 'second rejection')
      expect(r2).toBe('cap_reached')
      expect(engine.getState().tasks['t1'].status).toBe('completed')

      engine.destroy()
    })

    it('uses default maxRejects of 2 when not specified', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng', description: 'Task', dependsOn: [], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()

      // First rejection
      engine.markTaskRunning('t1')
      engine.recordTaskResult('t1', makeResult('t1'))
      expect(engine.rejectTask('t1', 'attempt 1')).toBe('rejected')

      // Second rejection
      engine.markTaskRunning('t1')
      engine.recordTaskResult('t1', makeResult('t1'))
      expect(engine.rejectTask('t1', 'attempt 2')).toBe('rejected')

      // Third rejection — cap reached
      engine.markTaskRunning('t1')
      engine.recordTaskResult('t1', makeResult('t1'))
      expect(engine.rejectTask('t1', 'attempt 3')).toBe('cap_reached')

      engine.destroy()
    })

    it('rejected task becomes ready again in DAG', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng', description: 'Implement', dependsOn: [], onFailure: 'stop' },
          { taskId: 't2', agentId: 'reviewer', description: 'Review', dependsOn: ['t1'], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()

      engine.markTaskRunning('t1')
      engine.recordTaskResult('t1', makeResult('t1'))

      // t2 should be ready now
      expect(engine.getReadyTasks().map(t => t.taskId)).toContain('t2')

      // Reject t1
      engine.rejectTask('t1', 'Missing unit tests')

      // t2 should no longer be ready (t1 is back to pending)
      expect(engine.getReadyTasks().map(t => t.taskId)).not.toContain('t2')

      // t1 should be ready again
      expect(engine.getReadyTasks().map(t => t.taskId)).toContain('t1')

      engine.destroy()
    })

    it('returns cap_reached for non-completed tasks', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng', description: 'Task', dependsOn: [], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()

      // Task is still pending, not completed
      expect(engine.rejectTask('t1', 'feedback')).toBe('cap_reached')

      engine.destroy()
    })
  })

  // ── Workflow completion ──

  describe('workflow completion', () => {
    it('emits workflow-completed when all tasks resolve', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng', description: 'T1', dependsOn: [], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()

      const completed = vi.fn()
      engine.on('workflow-completed', completed)

      engine.markTaskRunning('t1')
      engine.recordTaskResult('t1', makeResult('t1'))

      expect(completed).toHaveBeenCalledTimes(1)
      const result = completed.mock.calls[0][0]
      expect(result.status).toBe('completed')
      expect(result.completedCount).toBe(1)

      engine.destroy()
    })

    it('reports partial when some tasks complete and some fail', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng', description: 'T1', dependsOn: [], onFailure: 'skip' },
          { taskId: 't2', agentId: 'eng', description: 'T2', dependsOn: [], onFailure: 'skip' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()

      engine.markTaskRunning('t1')
      engine.recordTaskResult('t1', makeResult('t1', 'completed'))

      engine.markTaskRunning('t2')
      engine.recordTaskResult('t2', makeResult('t2', 'failed'))

      const result = engine.aggregateResults()
      expect(result.completedCount).toBe(1)
      expect(result.skippedCount).toBe(1)
    })

    it('reconcile marks orphaned running tasks as failed', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'agent-1', description: 'T1', dependsOn: [], onFailure: 'stop' },
          { taskId: 't2', agentId: 'agent-2', description: 'T2', dependsOn: [], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()

      engine.markTaskRunning('t1', 'agent-1')
      engine.markTaskRunning('t2', 'agent-2')

      engine.reconcileWithRunningProcesses(new Set(['agent-1']))

      expect(engine.getState().tasks['t1'].status).toBe('running')
      expect(engine.getState().tasks['t2'].status).toBe('failed')
      expect(engine.getState().tasks['t2'].failureReason).toBe('process_lost_on_restart')

      engine.destroy()
    })
  })

  // ── New methods: skipTask, completeWithResult, baseline/worktree ──

  describe('skipTask', () => {
    it('sets status to skipped with reason', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng', description: 'T1', dependsOn: [], onFailure: 'stop' },
          { taskId: 't2', agentId: 'eng', description: 'T2', dependsOn: ['t1'], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()

      engine.skipTask('t1', 'merged into fallback')

      const ts = engine.getState().tasks['t1']
      expect(ts.status).toBe('skipped')
      expect(ts.failureReason).toBe('merged into fallback')
      expect(ts.completedAt).toBeDefined()

      engine.destroy()
    })

    it('emits task-skipped event', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng', description: 'T1', dependsOn: [], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()

      const skipped = vi.fn()
      engine.on('task-skipped', skipped)

      engine.skipTask('t1', 'test reason')
      expect(skipped).toHaveBeenCalledWith('t1', 'test reason')

      engine.destroy()
    })
  })

  describe('completeWithResult', () => {
    it('sets workflow to completed with specified result status', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng', description: 'T1', dependsOn: [], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()

      engine.skipTask('t1', 'fallback')

      const completed = vi.fn()
      engine.on('workflow-completed', completed)

      engine.completeWithResult('partial', 'Fallback triggered')

      expect(engine.status).toBe('completed')
      expect(completed).toHaveBeenCalledTimes(1)
      const result = completed.mock.calls[0][0]
      expect(result.status).toBe('partial')

      engine.destroy()
    })
  })

  describe('baseline and worktree state', () => {
    it('setTaskBaseline records SHA', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng', description: 'T1', dependsOn: [], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()

      engine.setTaskBaseline('t1', 'abc123')
      expect(engine.getTaskState('t1')?.baselineSha).toBe('abc123')

      engine.destroy()
    })

    it('setTaskWorktree records and clears path', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'eng', description: 'T1', dependsOn: [], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()

      engine.setTaskWorktree('t1', '/tmp/wt-test')
      expect(engine.getTaskState('t1')?.worktreePath).toBe('/tmp/wt-test')

      engine.setTaskWorktree('t1', undefined)
      expect(engine.getTaskState('t1')?.worktreePath).toBeUndefined()

      engine.destroy()
    })

    it('reconcile clears stale worktreePath', async () => {
      const dag = makeDag({
        tasks: [
          { taskId: 't1', agentId: 'agent-1', description: 'T1', dependsOn: [], onFailure: 'stop' },
        ],
      })

      const engine = new WorkflowEngine(dag, tmpDir)
      await engine.initialize()

      engine.markTaskRunning('t1', 'agent-1')
      engine.getState().tasks['t1'].worktreePath = '/nonexistent/worktree/path'

      engine.reconcileWithRunningProcesses(new Set(['agent-1']))

      expect(engine.getState().tasks['t1'].worktreePath).toBeUndefined()
      expect(engine.getState().tasks['t1'].status).toBe('running')

      engine.destroy()
    })

    it('fromCheckpoint restores baselineSha and worktreePath', () => {
      const state = {
        workflowId: 'wf-test',
        chatId: 'chat-1',
        status: 'running' as const,
        dag: makeDag(),
        tasks: {
          't1': {
            taskId: 't1',
            agentId: 'eng',
            status: 'running' as const,
            retryCount: 0,
            rejectCount: 0,
            baselineSha: 'def456',
            worktreePath: '/some/path',
          },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      const engine = WorkflowEngine.fromCheckpoint(tmpDir, state)

      expect(engine.getTaskState('t1')?.baselineSha).toBe('def456')
      expect(engine.getTaskState('t1')?.worktreePath).toBe('/some/path')

      engine.destroy()
    })
  })
})
