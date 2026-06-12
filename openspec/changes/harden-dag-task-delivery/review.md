# Architectural Review: Harden DAG Task Delivery

**Reviewer**: Architect
**Date**: 2026-06-12
**Status**: Conditional Approval (address P0 and P1 issues before implementation)

## Overall Assessment

The proposal correctly diagnoses the five root causes behind the `de4d1707` failure and proposes structurally sound fixes. C2 (incremental diff) and C3 (reject cleanup) are high-impact, low-risk changes that should have been in the original `lead-as-judge` implementation. C1 (file manifest) is the most impactful individual capability but carries a dependency problem the Lead LLM must reliably generate manifests. C4 and C5 are architecturally sound but introduce significant complexity relative to their frequency of use, and C5 has an API mismatch with the existing `WorktreeManager` that needs resolution.

---

## Per-Capability Findings

### C1: Structured File Manifest

**Assessment**: Strong concept, execution details need work.

**Strengths**:
- Directly addresses root cause #1 (agent wrote to SKILL.md instead of .ts files). The `forbid` pattern is exactly the constraint that was missing.
- Making validation informational rather than auto-rejecting is the right call. Lead-as-judge stays the decision maker.
- Backward compatible: tasks without `fileManifest` are unaffected.

**Issues**:

- **P1: `minimatch` is not a direct dependency.** The design says "already a dependency via other packages" but it is not listed in `package.json`. Transitive dependencies can disappear on upgrade. Either add `minimatch` explicitly or use Node's built-in `path.matchesGlob()` (available in Node 22+), or implement a minimal glob matcher for the 2-3 patterns that actually matter (`*.md`, `skills/**`).

- **P1: Who generates the `fileManifest`?** The proposal updates Lead's SOUL.md to include a `fileManifest` template, but Lead is an LLM generating JSON. If Lead forgets to include `fileManifest` or gets the paths wrong, C1 is dead weight. The proposal should address: (a) what percentage of DAG tasks would realistically get manifests, and (b) whether the scheduler should warn when a task description mentions "create" or "implement" but has no manifest. Without this, C1 only works when the human writing the prompt remembers to include it, which defeats the automation purpose.

- **P2: Prompt injection wording.** The injected text says "use Write tool" but Claude Code agents don't have a "Write tool" they have bash, editor, file creation via their CLI. The wording should match the actual agent's tool vocabulary, or be tool-agnostic ("create these files").

- **P2: `forbid` pattern for `*.md` with exception.** The design shows `*.md (except files you create)` in the prompt, but the validation logic in `validateFileManifest` has no such exception. If a task's `create` list includes `docs/API.md`, the validation would flag it as a forbidden change. The validation should exclude `create` list entries from `forbid` checking.

### C2: Per-Attempt Incremental Diff

**Assessment**: Excellent. Straightforward fix for a clear bug.

**Strengths**:
- Minimal code change (record SHA, use it in diff) with maximum diagnostic value.
- Graceful fallback to `HEAD~1` when baseline is unavailable.
- Directly addresses root cause #3 (cumulative diff was useless across retries).

**Issues**:

- **P2: Signature change to `collectEnrichedContext`.** The design adds `engine` and `taskId` as new parameters. Currently `collectEnrichedContext` is called from `recordAndNotifyLead` which already has both values in scope, so this is clean. But the current code structure calls `collectEnrichedContext(chatId, result)` in a `.then()` chain (line 199 of WorkflowScheduler.ts). The design should note that the `result.taskId` field already exists on `TaskResult`, so passing `taskId` separately is redundant. Consider reading `baselineSha` through the `result` object or closure instead of widening the method signature.

- **P2: Baseline SHA after rejection.** The spec says "re-record baseline SHA after cleanup" but the design's `cleanupTaskChanges` does NOT re-record a new baseline. The new baseline gets recorded when `startTask()` runs again for the retry, which is correct. But the spec and design are inconsistent on this point. Clarify that the new baseline is recorded by the normal `startTask()` flow, not by cleanup.

### C3: Reject-Time Cleanup

**Assessment**: Good, addresses root cause #2 directly. Some edge cases need attention.

**Strengths**:
- Using `git checkout <sha> -- <files>` instead of `git reset` is the right safety choice for shared-cwd scenarios.
- Skip-when-other-running guard prevents cross-task damage.
- Cleanup failure is non-blocking, which is correct resilience.

**Issues**:

- **P0: Race condition between rejection and retry.** The design wires cleanup to the `task-rejected` event, but look at the actual rejection flow in `workflowRoutes.ts` (line 143-151): after `engine.rejectTask()`, the route calls `workflowScheduler.onTaskRejected(taskId)` and then immediately calls `workflowScheduler.advanceWorkflow(workflowId)`. The `advanceWorkflow` call will find the rejected task as `pending` (because `rejectTask` sets it back to pending) and call `startTask()` on it. Meanwhile, the `task-rejected` event listener fires `cleanupTaskChanges()` asynchronously. **The retry can start before cleanup finishes.** The cleanup and the new agent would be running git commands concurrently on the same repo.

  **Fix**: Cleanup must be awaited before the task is re-dispatched. Either: (a) make cleanup synchronous in the rejection route (call it directly from the route handler before `advanceWorkflow`), or (b) keep the task in a transitional status (e.g. `cleaning`) until cleanup completes, then transition to `pending`. Option (a) is simpler and sufficient.

- **P1: `git checkout` doesn't handle newly created files.** If the agent created new files (which is exactly the scenario in `de4d1707`), `git checkout <baseline> -- <files>` will restore the old versions of modified files but will NOT delete newly created files (they don't exist at the baseline SHA). `git diff --name-only` also won't list untracked files. The cleanup needs an additional step: `git clean -fd` scoped to the changed paths, or explicitly check for files that exist on disk but not at the baseline SHA and remove them.

- **P2: Cleanup after `cap_reached`.** If `rejectTask` returns `cap_reached`, the route returns 400 and does NOT call `onTaskRejected`. But the task's dirty state remains. If Lead then triggers fallback (C4), the merged handoff agent inherits the dirty filesystem. This is probably acceptable since the fallback description is self-contained, but worth documenting.

### C4: DAG Fallback Strategy

**Assessment**: Addresses root cause #5 (no degradation path). Architecture is reasonable but has gaps.

**Strengths**:
- DAG-level config is correct; fallback is inherently a workflow-wide decision.
- Merged description with 8000-char cap is pragmatic.
- Shell script interface matches existing patterns (`advance-workflow.sh`, `reject-task.sh`).

**Issues**:

- **P1: `engine.skipTask()` does not exist.** The design calls `engine.skipTask(t.taskId, 'merged into fallback handoff')` but `WorkflowEngine` has no `skipTask` method. The closest equivalent is manually setting `ts.status = 'skipped'` and `ts.failureReason = reason` as done in `applyFailurePolicy`. Either add the method to `WorkflowEngine` or use the existing pattern directly.

- **P1: Workflow status after fallback.** The design says "mark the workflow as `completed` with result `partial`" but the implementation in `handleFallback` never sets `engine.state.status`. After skipping all remaining tasks, `checkCompletion()` would run (if called) and see all tasks as completed/skipped/failed, and set the status based on that. But `handleFallback` doesn't call `checkCompletion()` or set status directly. The fallback handoff agent is dispatched as a NEW agent via `handleStart`, which is outside the workflow engine's tracking. The workflow would appear "completed" in the engine but a rogue agent is still running. This needs explicit status handling.

- **P1: Fallback trigger mechanism is unclear.** The design proposes a new `/api/workflow/:workflowId/fallback` endpoint AND updating the Lead prompt to include `fallback-workflow.sh` as option 4. But option 4 only appears "when reject cap is reached AND fallback is configured." In the current flow, when `cap_reached` is returned, the route returns 400 to the shell script, and Lead sees the error. Lead would then need to decide to call `fallback-workflow.sh`. But the Lead prompt that ALREADY informed Lead to reject is the one that should have had option 4. The timing is off. The fallback option should be included in the Lead prompt BEFORE Lead decides to reject (i.e., when `rejectCount` is at `maxRejects - 1` and another rejection would hit the cap).

- **P2: `proportional truncation` is not implemented.** The design says "truncate per-task descriptions proportionally" but the code just does `.slice(0, 8000)` on the concatenated string, which could cut a task description mid-sentence. Proportional truncation would divide 8000 by the number of tasks and truncate each individually.

### C5: Parallel Task Worktree Isolation

**Assessment**: Architecturally sound concept, but highest complexity and most API friction.

**Strengths**:
- Directly addresses root cause #4 (parallel tasks share cwd without isolation).
- Auto-detection of concurrency is smart; explicit override gives control.
- Graceful fallback to shared cwd on failure.

**Issues**:

- **P0: `WorktreeManager.create()` API mismatch.** The existing `WorktreeManager.create()` takes `{ sessionId: string; baseBranch?: string }` (see `server/git/WorktreeManager.ts` line 114). The design assumes it takes `{ basePath: string; name: string; branch: string }`. These are completely different signatures. Either: (a) modify `WorktreeManager.create()` to accept the new signature (breaking other consumers), (b) add an overload, or (c) use the existing API with `sessionId` set to a workflow-derived identifier. Option (c) is safest: `sessionId: \`wf-${workflowId}-${taskId}\`` would work with the existing code, which generates `wt/<shortId>` branches.

- **P1: `WorktreeManager` constructor takes `repoRoot`, not the scheduler.** The design adds `worktreeManager?: WorktreeManager` to `WorkflowSchedulerDeps` but `WorktreeManager` is constructed per-repo (`new WorktreeManager(repoRoot)`). Different chats may have different workspaces. The scheduler resolves `cwd` per-chat via `resolveCwd()`. So the `WorktreeManager` instance can't be a singleton in deps; it needs to be created per-invocation based on the resolved cwd. Either: (a) make `worktreeManager` a factory `(repoRoot: string) => WorktreeManager`, or (b) instantiate `WorktreeManager` inline in `startTask()` when needed.

- **P1: Merge timing in advance flow.** The design says worktree changes are merged on advance, but the advance flow (`workflowRoutes.ts` line 160-171) currently just calls `advanceWorkflow()` which starts downstream tasks. There's no hook point for "task was advanced, now merge its worktree." The `recordTaskResult` → `checkCompletion` path doesn't distinguish "Lead accepted" from "completed automatically." Worktree merge needs to happen in the advance route handler BEFORE downstream tasks start (they may depend on the merged code).

- **P2: Merge conflicts in worktree merge.** If task A and task B both run in worktrees and modify overlapping files, merging B's worktree after A's could conflict. The design doesn't address this. The existing `WorktreeManager.merge()` handles conflicts but returns `{ success: false, conflicts }`. What happens then? This needs a documented strategy, even if it's "escalate to Lead."

---

## Cross-Cutting Concerns

### 1. Interaction Effects Between C1-C5

**C2 + C3 synergy is strong**: C2 records baseline, C3 uses it. These should always be implemented together.

**C3 + C5 interaction is well-handled**: The design correctly notes that C3 cleanup is unnecessary when C5 worktree isolation is active (discard the worktree instead of reverting files). The `otherRunning` guard in C3 also protects against the scenario where C5 isn't used.

**C1 + C5 interaction needs attention**: When a task runs in a worktree, the `fileManifest` validation resolves paths against `cwd`. If `cwd` is the worktree path, the created files would be in the worktree, which is correct. But the `forbid` check runs `git diff --name-only <baseline>..HEAD` which in a worktree would show the worktree's commits. This is correct but should be explicitly tested.

**C4 + C5 interaction is undefined**: If a task that used a worktree triggers fallback, what happens to the worktree? The fallback dispatches a new agent via `handleStart` with the main `cwd`. The old worktree is orphaned. `handleFallback` should clean up any worktrees from remaining tasks before dispatching.

### 2. State Persistence (fromCheckpoint)

The tasks.md correctly identifies "Verify: `WorkflowEngine.fromCheckpoint()` correctly restores all new fields" but this is buried as a sub-item in Phase 1. `baselineSha` and `worktreePath` are runtime state that gets serialized to the checkpoint JSON. On recovery, `worktreePath` may point to a worktree that no longer exists (if the server crashed). The recovery flow in `reconcileWithRunningProcesses` needs to handle stale `worktreePath` values.

### 3. Event Emission and Ordering

`WorkflowEngine.rejectTask()` emits `task-rejected` with `(taskId, feedback)`. The design subscribes to this in the scheduler. But the rejection route (`workflowRoutes.ts`) also calls `workflowScheduler.onTaskRejected(taskId)` directly. This means there are now TWO paths for reject-side-effects: the event listener (for cleanup) and the direct call (for clearing wokenLeadTasks). These should be consolidated to avoid ordering bugs.

---

## Recommended Prioritization

If only 2 of 5 capabilities could be implemented:

**1. C2 (Incremental Diff)** + **C3 (Reject Cleanup)** -- these are a paired unit.

Rationale: These address the most damaging failure mode (retries produce identical results). They are low-complexity, low-risk, and directly fix 2 of the 5 root causes. Without C3, `lead-as-judge` rejection is essentially broken: rejecting without cleanup means the agent sees its own failed output and repeats it. C2 without C3 is still useful (better diagnostics) but C3 without C2 makes no sense (cleanup needs the baseline SHA that C2 introduces).

**Second priority**: C1 (File Manifest) -- highest single-capability impact, but requires Lead to reliably generate the manifests.

**Third priority**: C4 (Fallback) -- useful but only kicks in at the tail end of failure cascades.

**Lowest priority**: C5 (Worktree Isolation) -- correct solution to root cause #4, but most complex, highest API friction, and parallel DAG tasks are less common than sequential ones in current usage.

---

## Issues Summary

### P0 (Must fix before implementation)

| ID | Capability | Issue |
|----|-----------|-------|
| P0-1 | C3 | Race condition: cleanup runs async but retry starts immediately after rejection. Agent and cleanup run git commands concurrently. |
| P0-2 | C5 | `WorktreeManager.create()` API signature mismatch: design assumes `{ basePath, name, branch }`, actual API takes `{ sessionId, baseBranch? }`. |

### P1 (Must fix before merge)

| ID | Capability | Issue |
|----|-----------|-------|
| P1-1 | C1 | `minimatch` is not a direct dependency; transitive only. Add explicitly or use alternative. |
| P1-2 | C1 | No mechanism to ensure Lead actually generates `fileManifest` for new-file tasks. |
| P1-3 | C3 | `git checkout` does not delete newly created files. Need `git clean` or explicit deletion for untracked files. |
| P1-4 | C4 | `engine.skipTask()` method does not exist. Must be added to `WorkflowEngine`. |
| P1-5 | C4 | Workflow status not explicitly set after fallback; engine may show wrong state. |
| P1-6 | C4 | Fallback option appears in Lead prompt AFTER cap is hit, but Lead needs to see it BEFORE the final rejection attempt. |
| P1-7 | C5 | `WorktreeManager` is per-repo, not a singleton. Cannot be a static dep; needs per-invocation construction. |
| P1-8 | C5 | No merge hook point in the advance flow; worktree merge must happen before downstream tasks start. |

### P2 (Should fix, lower urgency)

| ID | Capability | Issue |
|----|-----------|-------|
| P2-1 | C1 | "Write tool" in prompt text doesn't match agent's actual tool vocabulary. |
| P2-2 | C1 | `forbid` validation doesn't exclude files listed in `create`. |
| P2-3 | C2 | `taskId` parameter in `collectEnrichedContext` is redundant with `result.taskId`. |
| P2-4 | C2 | Spec and design are inconsistent on who re-records baseline after cleanup. |
| P2-5 | C4 | "Proportional truncation" described in prose but `.slice(0, 8000)` implemented in code. |
| P2-6 | C5 | No strategy for merge conflicts when multiple worktrees touch overlapping files. |
| P2-7 | Cross | C4 + C5 interaction: orphaned worktrees when fallback triggers. |
| P2-8 | Cross | Dual reject-side-effect paths (event listener + direct call) should be consolidated. |
