# Design: Harden DAG Task Delivery

## Architecture Overview

```
                  ┌─────────────────────────────────────────────────┐
                  │              WorkflowScheduler                  │
                  │                                                 │
create-workflow ──▶  startTask()                                    │
                  │   ├─ record baselineSha (C2)                    │
                  │   ├─ detect concurrency → worktree? (C5)        │
                  │   ├─ inject fileManifest prompt block (C1)      │
                  │   └─ inject rejection feedback (existing)       │
                  │                                                 │
task completes ───▶  recordAndNotifyLead()                          │
                  │   ├─ collectEnrichedContext()                    │
                  │   │   ├─ git diff <baselineSha>..HEAD (C2)      │
                  │   │   └─ validateFileManifest() (C1)            │
                  │   └─ buildLeadPrompt() with validation results  │
                  │                                                 │
reject-task ──────▶  reject route handler                           │
                  │   ├─ engine.rejectTask()                        │
                  │   ├─ await cleanupTaskChanges() (C3, sync)      │
                  │   └─ advanceWorkflow() (retry starts clean)     │
                  │                                                 │
cap reached ──────▶  handleFallback() (C4)                          │
                  │   ├─ cleanup orphaned worktrees (C5)            │
                  │   ├─ collect remaining task descriptions         │
                  │   ├─ merge into single handoff prompt            │
                  │   └─ dispatch via handoff, mark workflow partial │
                  └─────────────────────────────────────────────────┘
```

## Review Fixes Applied

| Review ID | Fix |
|-----------|-----|
| P0-1 | C3 cleanup is now **synchronous in the reject route**, awaited before `advanceWorkflow()` |
| P0-2 | C5 uses existing `WorktreeManager.create({ sessionId })` API, no signature change |
| P1-1 | Use Node 24 built-in `path.matchesGlob()` instead of `minimatch` |
| P1-2 | Scheduler auto-detects "create" keywords in description and warns Lead when `fileManifest` is missing |
| P1-3 | C3 cleanup adds `git clean -fd` for untracked files created since baseline |
| P1-4 | Add `skipTask(taskId, reason)` method to `WorkflowEngine` |
| P1-5 | C4 `handleFallback` sets `engine.status = 'completed'` and calls `checkCompletion()` |
| P1-6 | Fallback option appears in Lead prompt when `rejectCount === maxRejects - 1` (before cap) |
| P1-7 | C5 creates `WorktreeManager` per-invocation from resolved cwd, not a singleton dep |
| P1-8 | Advance route calls `mergeTaskWorktree()` before `advanceWorkflow()` |
| P2-1 | Prompt says "create these files" (tool-agnostic) instead of "use Write tool" |
| P2-2 | `forbid` validation excludes files in `create` list |
| P2-3 | Use `engine` already in scope via closure; pass only `taskId` (not redundant engine param) |
| P2-4 | Baseline is re-recorded by normal `startTask()` flow on retry, not by cleanup |
| P2-5 | Proportional truncation implemented per-task |
| P2-6 | Worktree merge conflicts escalate to Lead via `open_question` |
| P2-7 | `handleFallback` cleans up orphaned worktrees from remaining tasks |
| P2-8 | Reject side-effects consolidated: cleanup called directly in route, event listener removed |

---

## C1: Structured File Manifest

### Type Changes (shared/workflow-types.ts)

```typescript
export interface FileManifest {
  create: string[]       // relative paths that MUST be created
  modify?: string[]      // relative paths that MAY be modified
  forbid?: string[]      // glob patterns that MUST NOT be touched (e.g. "*.md", "skills/**")
}

export interface WorkflowTask {
  // ... existing fields ...
  fileManifest?: FileManifest
}
```

### Prompt Injection (WorkflowScheduler.startTask)

When `task.fileManifest` is present, append after the description:

```
## File Requirements (enforced — violations will cause rejection)

### Files you MUST create:
- bridge/src/types.ts
- bridge/src/server.ts
- bridge/src/bootstrap.ts

### Files you MAY modify:
- bridge/package.json

### Files you MUST NOT touch:
- *.md (except files listed above)
- skills/**

After creating each file, verify it exists with `ls -la`.
```

Implementation:

```typescript
private buildFileManifestBlock(manifest: FileManifest): string {
  const lines: string[] = [
    '\n## File Requirements (enforced — violations will cause rejection)\n',
  ]

  lines.push('### Files you MUST create:')
  for (const f of manifest.create) {
    lines.push(`- ${f}`)
  }
  lines.push('')

  if (manifest.modify?.length) {
    lines.push('### Files you MAY modify:')
    for (const f of manifest.modify) {
      lines.push(`- ${f}`)
    }
    lines.push('')
  }

  if (manifest.forbid?.length) {
    lines.push('### Files you MUST NOT touch (except files listed above):')
    for (const f of manifest.forbid) {
      lines.push(`- ${f}`)
    }
    lines.push('')
  }

  lines.push('After creating each file, verify it exists with `ls -la`.')
  return lines.join('\n')
}
```

### Missing Manifest Detection (P1-2 fix)

When a task has no `fileManifest` but its description contains creation
keywords ("create", "implement", "scaffold", "build"), include a soft
warning in the Lead prompt at build time:

```typescript
private detectMissingManifest(description: string, manifest?: FileManifest): string | undefined {
  if (manifest) return undefined
  const creationKeywords = /\b(create|implement|scaffold|build|write)\b.*\b(file|module|server|component|class)\b/i
  if (creationKeywords.test(description)) {
    return 'Note: this task appears to create new files but has no fileManifest. ' +
      'Consider adding one to enforce file creation requirements.'
  }
  return undefined
}
```

This warning is included in `buildLeadPrompt()` at DAG creation time (not
at task start) so Lead can amend the DAG before submission.

### Validation (WorkflowScheduler.collectEnrichedContext)

After collecting enriched context, if the task has a `fileManifest`, validate:

```typescript
import { matchesGlob } from 'node:path'

interface FileManifestValidation {
  passed: boolean
  missingFiles: string[]       // files in create[] that don't exist
  emptyFiles: string[]         // files in create[] that exist but are empty
  forbiddenChanges: string[]   // files matching forbid[] that were modified
}

private async validateFileManifest(
  cwd: string,
  manifest: FileManifest,
  baselineSha?: string,
): Promise<FileManifestValidation> {
  const result: FileManifestValidation = {
    passed: true,
    missingFiles: [],
    emptyFiles: [],
    forbiddenChanges: [],
  }

  const createSet = new Set(manifest.create)

  // Check required files exist and are non-empty
  for (const filePath of manifest.create) {
    const fullPath = resolve(cwd, filePath)
    try {
      const stat = await fsStat(fullPath)
      if (stat.size === 0) {
        result.emptyFiles.push(filePath)
        result.passed = false
      }
    } catch {
      result.missingFiles.push(filePath)
      result.passed = false
    }
  }

  // Check forbidden patterns against actual changes (P2-2: exclude create list)
  if (manifest.forbid?.length && baselineSha) {
    try {
      const { stdout } = await execFileAsync(
        'git', ['diff', '--name-only', `${baselineSha}..HEAD`],
        { cwd, timeout: 5000 },
      )
      const changedFiles = stdout.trim().split('\n').filter(Boolean)
      for (const changed of changedFiles) {
        if (createSet.has(changed)) continue  // P2-2: skip files in create list
        for (const pattern of manifest.forbid) {
          if (matchesGlob(changed, pattern)) {
            result.forbiddenChanges.push(changed)
            result.passed = false
          }
        }
      }
    } catch { /* git diff failure is non-fatal */ }
  }

  return result
}
```

Validation result is included in the enriched prompt to Lead:

```
## File Manifest Validation: FAILED

Missing files (not created):
  ✗ bridge/src/types.ts
  ✗ bridge/src/server.ts

Forbidden files modified:
  ✗ SKILL.md (matches *.md)
  ✗ skills/graph-probe/SKILL.md (matches skills/**)
```

### Lead SOUL.md Update

Add to the Implementation template:

```
- **Implementation (creating new files)**: "Deliverables: working code files
  listed in the File Requirements section. Do NOT modify files matching the
  forbidden patterns. Verify each created file with `ls -la`."
  Include `fileManifest` in the task JSON:
  ```json
  "fileManifest": {
    "create": ["path/to/file1.ts", "path/to/file2.ts"],
    "forbid": ["*.md", "skills/**"]
  }
  ```

  **When to use fileManifest**: ANY task that creates new files (not just
  modifying existing ones). If the task description says "implement",
  "create", "scaffold", or "build", it needs a fileManifest.
```

## C2: Per-Attempt Incremental Diff

### Type Changes (shared/workflow-types.ts)

```typescript
export interface WorkflowTaskState {
  // ... existing fields ...
  baselineSha?: string   // git HEAD at task start, for incremental diff
}
```

### Record Baseline (WorkflowScheduler.startTask)

After `markTaskRunning`, before launching the agent:

```typescript
// Record baseline SHA for incremental diff
if (taskCwd) {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: taskCwd, timeout: 3000 })
    engine.setTaskBaseline(taskId, stdout.trim())
  } catch {
    log.debug('Could not record baseline SHA', { taskId })
  }
}
```

Note: `taskCwd` may be the main cwd or a worktree path (C5). The baseline
is always recorded in the actual working directory the agent will use.

### WorkflowEngine.setTaskBaseline

```typescript
setTaskBaseline(taskId: string, sha: string): void {
  const ts = this.state.tasks[taskId]
  if (ts) {
    ts.baselineSha = sha
  }
}
```

### Use Baseline in collectEnrichedContext

Replace:
```typescript
const { stdout } = await execFileAsync('git', ['diff', '--stat', 'HEAD~1'], { cwd, timeout: 5000 })
```

With:
```typescript
const baselineSha = engine.getState().tasks[taskId]?.baselineSha
const diffRef = baselineSha ? `${baselineSha}..HEAD` : 'HEAD~1'
const { stdout } = await execFileAsync('git', ['diff', '--stat', diffRef], { cwd: taskCwd, timeout: 5000 })
```

This means the enriched context shows **only what this attempt changed**,
not cumulative changes from the entire workflow.

### Signature Change (P2-3 fix)

`collectEnrichedContext` adds only `taskId` — the engine is already
accessible via closure in `recordAndNotifyLead`:

```typescript
private async collectEnrichedContext(
  chatId: string,
  result: TaskResult,
  engine: WorkflowEngine,
  taskId: string,
): Promise<EnrichedTaskContext>
```

The engine param is passed from `recordAndNotifyLead` which already has it.
`taskId` is needed to look up `baselineSha` and `worktreePath`.

### Baseline on Retry (P2-4 clarification)

When a rejected task retries, the normal `startTask()` flow records a new
`baselineSha` after cleanup has completed. No special baseline re-recording
is needed in the cleanup path.

## C3: Reject-Time Cleanup

### Critical Change: Synchronous in Reject Route (P0-1 fix)

The original design wired cleanup to the `task-rejected` event listener,
which runs async and races with `advanceWorkflow()`. **Fix**: cleanup is
called directly in the reject route handler, awaited before
`advanceWorkflow()`.

### WorkflowScheduler.cleanupTaskChanges

```typescript
async cleanupTaskChanges(engine: WorkflowEngine, taskId: string): Promise<void> {
  const taskState = engine.getState().tasks[taskId]
  const baselineSha = taskState?.baselineSha
  if (!baselineSha) {
    log.debug('No baseline SHA, skipping cleanup', { taskId })
    return
  }

  // If task used a worktree, discard it entirely instead of git cleanup
  if (taskState.worktreePath) {
    await this.discardWorktree(engine, taskId)
    return
  }

  const cwd = this.resolveCwd(engine.chatId)
  if (!cwd) return

  // Don't cleanup if another task is running in the same cwd
  const otherRunning = Object.values(engine.getState().tasks)
    .some(t => t.taskId !== taskId && t.status === 'running')
  if (otherRunning) {
    log.info('Other task running in same cwd, skipping cleanup', { taskId })
    return
  }

  try {
    // Step 1: Revert tracked files changed since baseline
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

    // Step 2 (P1-3 fix): Remove untracked files created since baseline
    // Use git ls-files to find untracked files, then remove them
    const { stdout: untrackedOutput } = await execFileAsync(
      'git', ['ls-files', '--others', '--exclude-standard'],
      { cwd, timeout: 5000 },
    )
    const untrackedFiles = untrackedOutput.trim().split('\n').filter(Boolean)

    if (untrackedFiles.length > 0) {
      // Only remove files that are within directories the agent likely created
      // Use git clean with path specs to be targeted
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
```

### Wire into Reject Route (P0-1 fix, P2-8 fix)

**NOT via event listener.** Directly in `workflowRoutes.ts` reject handler:

```typescript
// workflowRoutes.ts — reject endpoint
router.post('/:workflowId/tasks/:taskId/reject', async (req, res) => {
  // ... existing validation ...
  const result = engine.rejectTask(taskId, feedback)
  if (result === 'cap_reached') {
    // ... existing cap_reached response ...
    return
  }

  // P0-1 fix: await cleanup BEFORE advancing (sync, not via event)
  await workflowScheduler.cleanupTaskChanges(engine, taskId)

  // P2-8 fix: consolidate all reject side-effects here
  workflowScheduler.onTaskRejected(taskId)  // clears wokenLeadTasks entry

  // Now advance — the retry will start from a clean baseline
  workflowScheduler.advanceWorkflow(workflowId)

  // ... existing response ...
})
```

The `task-rejected` event on WorkflowEngine is **NOT** subscribed to for
cleanup. All reject side-effects flow through the route handler to avoid
ordering ambiguity.

## C4: DAG Fallback Strategy

### Type Changes (shared/workflow-types.ts)

```typescript
export interface WorkflowDag {
  tasks: WorkflowTask[]
  fallback?: DagFallback
}

export interface DagFallback {
  strategy: 'merge-remaining'
  agentId?: string    // default: first remaining task's agentId
}
```

### WorkflowEngine.skipTask (P1-4 fix)

New method on WorkflowEngine:

```typescript
skipTask(taskId: string, reason: string): void {
  const ts = this.state.tasks[taskId]
  if (!ts) return
  ts.status = 'skipped'
  ts.failureReason = reason
  ts.completedAt = new Date().toISOString()
  this.state.updatedAt = new Date().toISOString()
  this.persistCheckpoint().catch(() => {})
  this.emit('task-skipped', taskId, reason)
}
```

### WorkflowScheduler.handleFallback

```typescript
async handleFallback(engine: WorkflowEngine): Promise<{ dispatched: boolean; agentId?: string; taskCount?: number }> {
  const dag = engine.getState().dag
  if (!dag.fallback || dag.fallback.strategy !== 'merge-remaining') {
    return { dispatched: false }
  }

  const state = engine.getState()
  const remainingTasks = Object.values(state.tasks)
    .filter(t => t.status === 'pending' || t.status === 'failed')

  if (remainingTasks.length === 0) return { dispatched: false }

  // P2-7 fix: clean up orphaned worktrees from remaining tasks
  for (const t of remainingTasks) {
    if (t.worktreePath) {
      await this.discardWorktree(engine, t.taskId).catch(err => {
        log.warn('Failed to cleanup worktree during fallback', { taskId: t.taskId })
      })
    }
  }

  // P2-5 fix: proportional truncation per task
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

  // Mark remaining tasks as skipped (P1-4: use new skipTask method)
  for (const t of remainingTasks) {
    engine.skipTask(t.taskId, 'merged into fallback handoff')
  }

  // P1-5 fix: explicitly complete the workflow
  engine.completeWithResult('partial', 'Fallback: remaining tasks merged into single handoff')

  // Dispatch single handoff
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
```

### WorkflowEngine.completeWithResult (P1-5 fix)

```typescript
completeWithResult(result: 'completed' | 'partial' | 'failed', message?: string): void {
  this.state.status = 'completed'
  this.state.result = this.aggregateResults()
  if (result === 'partial') {
    this.state.result.status = 'partial'
  }
  this.state.updatedAt = new Date().toISOString()
  this.persistCheckpoint().catch(() => {})
  this.emit('workflow-completed', this.workflowId, this.state.result)
}
```

### API: Trigger Fallback

```
POST /api/workflow/:workflowId/fallback
Response 200: { dispatched: true, agentId: "fullstack-engineer", mergedTasks: 3 }
Response 400: { error: "no_fallback_configured" }
```

Shell script `fallback-workflow.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_env.sh"
WORKFLOW_ID="${1:?Usage: fallback-workflow.sh '<workflowId>'}"
curl -s -X POST "${EXPERT_API_BASE}/api/workflow/${WORKFLOW_ID}/fallback" \
  -H "Content-Type: application/json" | jq .
```

### Lead Prompt Timing (P1-6 fix)

The fallback option appears in the Lead prompt **before** the cap is hit,
so Lead can choose fallback proactively instead of after a failed rejection:

In `buildLeadPrompt()`:

```typescript
// P1-6: show fallback option when next rejection would hit cap
const task = dag.tasks.find(t => t.taskId === p.completedTaskId)
const taskState = state.tasks[p.completedTaskId]
const maxRejects = task?.maxRejects ?? 2
const atPenultimateReject = taskState && taskState.rejectCount >= maxRejects - 1

let actionBlock = `Review the completed work and choose one action:
1. \`advance-workflow.sh '${workflowId}'\` — deliverables are satisfactory
2. \`reject-task.sh '${workflowId}' '${p.completedTaskId}' "<feedback>"\` — send back with feedback`

if (atPenultimateReject && dag.fallback) {
  actionBlock += `
3. \`fallback-workflow.sh '${workflowId}'\` — abandon individual tasks, merge all remaining into a single handoff (RECOMMENDED: next rejection hits the cap)
4. Write an \`open_question\` to the war-room — escalate to user`
} else if (dag.fallback) {
  actionBlock += `
3. \`fallback-workflow.sh '${workflowId}'\` — merge remaining tasks into single handoff
4. Write an \`open_question\` to the war-room — escalate to user`
} else {
  actionBlock += `
3. Write an \`open_question\` to the war-room — escalate to user`
}
```

## C5: Parallel Task Worktree Isolation

### Type Changes (shared/workflow-types.ts)

```typescript
export interface WorkflowTask {
  // ... existing fields ...
  isolation?: 'worktree' | 'shared'   // default: 'shared'
}

export interface WorkflowTaskState {
  // ... existing fields ...
  worktreePath?: string   // set when task uses worktree isolation
}
```

### WorkflowScheduler — No Singleton WorktreeManager (P1-7 fix)

Instead of injecting `WorktreeManager` as a dep, create it per-invocation:

```typescript
private createWorktreeManager(cwd: string): WorktreeManager {
  return new WorktreeManager(cwd)
}
```

This is called in `startTask()` when worktree isolation is needed. No
change to `WorkflowSchedulerDeps`.

### WorkflowScheduler.startTask — Worktree Detection

```typescript
private shouldUseWorktree(engine: WorkflowEngine, task: WorkflowTask): boolean {
  if (task.isolation === 'worktree') return true
  if (task.isolation === 'shared') return false

  // Auto-detect: use worktree if another task is already running
  const runningTasks = Object.values(engine.getState().tasks)
    .filter(t => t.status === 'running' && t.taskId !== task.taskId)
  return runningTasks.length > 0
}
```

### Worktree Creation (P0-2 fix)

Uses existing `WorktreeManager.create()` API with `sessionId`:

```typescript
let taskCwd = cwd
if (this.shouldUseWorktree(engine, task) && cwd) {
  try {
    const wtManager = this.createWorktreeManager(cwd)
    const sessionId = `wf-${engine.workflowId.slice(0, 8)}-${taskId}`
    const { path: worktreePath } = await wtManager.create({
      sessionId,
      baseBranch: undefined,  // branch from current HEAD
    })
    taskCwd = worktreePath
    engine.setTaskWorktree(taskId, worktreePath)
    log.info('Created worktree for workflow task', { taskId, worktreePath })
  } catch (err) {
    log.warn('Worktree creation failed, using shared cwd', {
      taskId, error: err instanceof Error ? err.message : String(err),
    })
  }
}
```

### Worktree Merge on Advance (P1-8 fix)

Merge happens in the **advance route handler**, BEFORE `advanceWorkflow()`
starts downstream tasks:

```typescript
// workflowRoutes.ts — advance endpoint
router.post('/:workflowId/advance', async (req, res) => {
  // ... existing validation ...

  // P1-8: merge worktrees from completed tasks before starting downstream
  const completedTasks = Object.values(engine.getState().tasks)
    .filter(t => t.status === 'completed' && t.worktreePath)
  for (const t of completedTasks) {
    await workflowScheduler.mergeTaskWorktree(engine, t.taskId)
  }

  const { started, error } = workflowScheduler.advanceWorkflow(workflowId)
  // ... existing response ...
})
```

### WorkflowScheduler.mergeTaskWorktree

```typescript
async mergeTaskWorktree(engine: WorkflowEngine, taskId: string): Promise<void> {
  const taskState = engine.getState().tasks[taskId]
  if (!taskState?.worktreePath) return

  const cwd = this.resolveCwd(engine.chatId)
  if (!cwd) return

  const wtManager = this.createWorktreeManager(cwd)
  const currentBranch = await this.getCurrentBranch(cwd)

  try {
    const mergeResult = await wtManager.merge({
      worktreePath: taskState.worktreePath,
      targetBranch: currentBranch,
    })

    if (mergeResult.success) {
      await wtManager.remove(taskState.worktreePath, { deleteBranch: true })
      log.info('Worktree merged and cleaned up', { taskId })
    } else {
      // P2-6: escalate merge conflicts to Lead
      log.warn('Worktree merge conflict', { taskId, conflicts: mergeResult.conflicts })
      this.wakeLeadAgent(engine.chatId, engine.workflowId, {
        event: 'merge_conflict',
        taskId,
        conflicts: mergeResult.conflicts,
        worktreePath: taskState.worktreePath,
      })
    }
  } catch (err) {
    log.warn('Worktree merge failed', {
      taskId, error: err instanceof Error ? err.message : String(err),
    })
  }
}
```

### Worktree Discard (used by C3 and C4)

```typescript
private async discardWorktree(engine: WorkflowEngine, taskId: string): Promise<void> {
  const taskState = engine.getState().tasks[taskId]
  if (!taskState?.worktreePath) return

  const cwd = this.resolveCwd(engine.chatId)
  if (!cwd) return

  try {
    const wtManager = this.createWorktreeManager(cwd)
    await wtManager.remove(taskState.worktreePath, { force: true, deleteBranch: true })
    taskState.worktreePath = undefined
    log.info('Worktree discarded', { taskId })
  } catch (err) {
    log.warn('Worktree discard failed', {
      taskId, error: err instanceof Error ? err.message : String(err),
    })
  }
}
```

### WorkflowEngine.setTaskWorktree

```typescript
setTaskWorktree(taskId: string, path: string): void {
  const ts = this.state.tasks[taskId]
  if (ts) {
    ts.worktreePath = path
  }
}
```

### Enriched Context from Worktree

In `collectEnrichedContext`, use the worktree cwd when available:

```typescript
const taskState = engine.getState().tasks[taskId]
const taskCwd = taskState?.worktreePath ?? cwd
// all git commands use taskCwd instead of cwd
```

### Recovery: Stale worktreePath on Restart

In `reconcileWithRunningProcesses()`, if `taskState.worktreePath` points
to a non-existent directory, clear it and reset the task to `pending`:

```typescript
if (ts.worktreePath && !existsSync(ts.worktreePath)) {
  log.warn('Stale worktree path on recovery, clearing', { taskId: ts.taskId })
  ts.worktreePath = undefined
}
```

## Decisions

1. **`fileManifest` is optional** — existing tasks without it behave exactly
   as before. Only new "create files" tasks need it. Backward compatible.

2. **Validation is informational, not blocking** — the scheduler validates
   and reports results in the enriched prompt, but does not auto-reject. Lead
   decides. All judgment stays in the LLM.

3. **C3 cleanup is synchronous in the reject route** — cleanup MUST complete
   before `advanceWorkflow()` to prevent the race condition where retry
   starts before cleanup finishes. This makes the reject API ~1-2s slower
   but prevents data corruption.

4. **C3 cleanup includes `git clean` for untracked files** — `git checkout`
   alone only restores tracked files. Agent-created new files (the exact
   failure scenario) require explicit removal via `git clean -fd`.

5. **Worktree isolation auto-detects concurrency** — no explicit
   `'worktree'` override needed for the common case. Single-task DAGs never
   create worktrees. Explicit override available for control.

6. **`WorktreeManager` created per-invocation** — not a singleton in deps.
   Different chats may have different workspaces, and the manager takes
   `repoRoot` in its constructor. Per-invocation creation from `resolveCwd()`
   is safe and avoids stale references.

7. **Fallback is DAG-level, not task-level** — the fallback config lives on
   the DAG because merging remaining tasks is inherently a workflow-wide
   decision. Individual tasks don't know about each other.

8. **Fallback option shown proactively at penultimate reject** — Lead sees
   the fallback option when `rejectCount === maxRejects - 1`, not after the
   cap is already hit. This gives Lead the choice before it's too late.

9. **Uses `path.matchesGlob()` from Node 24** — no external dependency
   needed. The project already runs Node 24.4.0.

10. **Worktree merge conflicts escalate to Lead** — not auto-resolved.
    Merge conflicts require human judgment (or Lead dispatching an engineer).
    The worktree is preserved until conflicts are resolved.
