# Tasks: Harden DAG Task Delivery

## Phase 1: Type Foundation

- [x] Add `FileManifest` interface to `shared/workflow-types.ts` (`create: string[]`, `modify?: string[]`, `forbid?: string[]`)
- [x] Add `fileManifest?: FileManifest` to `WorkflowTask`
- [x] Add `baselineSha?: string` to `WorkflowTaskState`
- [x] Add `worktreePath?: string` to `WorkflowTaskState`
- [x] Add `isolation?: 'worktree' | 'shared'` to `WorkflowTask`
- [x] Add `DagFallback` interface and `fallback?: DagFallback` to `WorkflowDag`
- [x] Add `skipTask(taskId, reason)` method to `WorkflowEngine` — sets status `skipped`, failureReason, completedAt, emits `task-skipped` (P1-4)
- [x] Add `completeWithResult(result, message?)` method to `WorkflowEngine` — sets status `completed` with specified result status, persists and emits (P1-5)
- [x] Add `setTaskBaseline(taskId, sha)` method to `WorkflowEngine`
- [x] Add `setTaskWorktree(taskId, path)` method to `WorkflowEngine`
- [x] Verify: `WorkflowEngine.fromCheckpoint()` correctly restores `baselineSha`, `worktreePath`, and all new fields
- [x] Add stale worktreePath recovery in `reconcileWithRunningProcesses()` — clear `worktreePath` if directory doesn't exist

## Phase 2: Per-Attempt Incremental Diff (C2)

- [x] In `WorkflowScheduler.startTask()`: after `markTaskRunning()`, record `git rev-parse HEAD` as baseline SHA via `engine.setTaskBaseline()`. Use `taskCwd` (which may be worktree path from C5)
- [x] Update `collectEnrichedContext()` signature to accept `engine` and `taskId` params
- [x] In `collectEnrichedContext()`: resolve `taskCwd` from `taskState.worktreePath ?? cwd`; use `git diff --stat <baselineSha>..HEAD` when baseline is available, fall back to `HEAD~1`
- [x] Update caller in `recordAndNotifyLead()` to pass engine and taskId
- [x] Test: incremental diff shows only current attempt's changes, not prior attempts
- [x] Test: fallback to `HEAD~1` when no baseline available

## Phase 3: File Manifest Validation (C1)

- [x] Add `buildFileManifestBlock(manifest)` to `WorkflowTaskUtils` — generates tool-agnostic prompt block ("create these files", not "use Write tool") (P2-1)
- [x] In `startTask()`: when `task.fileManifest` is present, append manifest block to agent prompt
- [x] Add `validateFileManifest(cwd, manifest, baselineSha)` to `WorkflowTaskUtils` — uses `path.matchesGlob()` from Node 24 (P1-1); excludes `create` list from `forbid` check (P2-2)
- [x] Add `FileManifestValidation` to `EnrichedTaskContext` type
- [x] In `collectEnrichedContext()`: when task has `fileManifest`, run validation and include result
- [x] In `buildLeadPrompt()`: render validation results (PASSED/FAILED with missing/empty/forbidden file lists)
- [x] Add `detectMissingManifest(description, manifest?)` — warns Lead when description contains creation keywords but no manifest is present (P1-2)
- [x] Test: validation detects missing files
- [x] Test: validation detects empty files (size 0)
- [x] Test: validation detects forbidden pattern violations
- [x] Test: validation passes when all create files exist and are non-empty
- [x] Test: files in `create` list are excluded from `forbid` check (P2-2)

## Phase 4: Reject-Time Cleanup (C3)

- [x] Add `cleanupTaskChanges(engine, taskId)` as public async method on `WorkflowScheduler`
- [x] Cleanup Step 1: `git checkout <baseline> -- <changed-files>` reverts tracked file modifications
- [x] Cleanup Step 2: `git clean -fd -- <untracked-files>` removes files created by agent (P1-3)
- [x] Guard: skip cleanup if no baselineSha, no cwd, or another task is running in same cwd
- [x] Guard: if task has `worktreePath`, call `discardWorktree()` instead of git cleanup
- [x] **Critical (P0-1)**: Wire cleanup in `workflowRoutes.ts` reject handler — `await cleanupTaskChanges()` BEFORE `advanceWorkflow()`. Do NOT use event listener.
- [x] Remove any `task-rejected` event subscription for cleanup (P2-8 consolidation)
- [x] Test: cleanup reverts tracked files changed by the agent
- [x] Test: cleanup removes untracked files created by the agent (P1-3)
- [x] Test: cleanup skips when another task is running (shared cwd)
- [x] Test: cleanup failure is logged but does not block rejection
- [x] Test: reject route awaits cleanup before calling advanceWorkflow (P0-1)

## Phase 5: DAG Fallback Strategy (C4)

- [x] Add `handleFallback(engine)` as public async method on `WorkflowScheduler` — returns `{ dispatched, agentId?, taskCount? }`
- [x] In `handleFallback`: clean up orphaned worktrees from remaining tasks before merging (P2-7)
- [x] In `handleFallback`: proportional per-task truncation (`Math.floor(8000 / taskCount)`) instead of global `.slice()` (P2-5)
- [x] In `handleFallback`: call `engine.skipTask()` for each remaining task (P1-4)
- [x] In `handleFallback`: call `engine.completeWithResult('partial')` after skip+dispatch (P1-5)
- [x] Add `POST /api/workflow/:workflowId/fallback` endpoint in `workflowRoutes.ts`
- [x] Create `ai-assets/skills/workflow/scripts/fallback-workflow.sh` — shell wrapper for fallback API
- [x] In `buildLeadPrompt()`: show fallback option when `rejectCount >= maxRejects - 1` with RECOMMENDED label (P1-6), not only after cap is hit
- [x] In `buildLeadPrompt()`: show fallback option (without RECOMMENDED) when fallback is configured and reject count is lower
- [x] Update Lead SOUL.md — add fallback option to rejection cap section, add `fallback-workflow.sh` to Core Skills
- [x] Test: fallback merges 3 remaining tasks into single handoff with proportional truncation
- [x] Test: fallback skips merged tasks via `engine.skipTask()` and sets workflow to `completed`
- [x] Test: fallback cleans up worktrees from remaining tasks
- [x] Test: fallback returns `{ dispatched: false }` when no fallback configured

## Phase 6: Parallel Task Worktree Isolation (C5)

- [x] Add private `createWorktreeManager(cwd)` factory to `WorkflowTaskUtils` — instantiates per-invocation, not singleton dep (P1-7)
- [x] Add `shouldUseWorktree(engine, task)` — returns true for explicit `isolation: 'worktree'` or auto-detect when concurrent tasks exist
- [x] In `startTask()`: when worktree is needed, create via `WorktreeManager.create({ sessionId: 'wf-<workflowId>-<taskId>' })` using existing API (P0-2), set task cwd to worktree path
- [x] Add `mergeTaskWorktree(engine, taskId)` public method — calls `WorktreeManager.merge()`, escalates conflicts to Lead, removes worktree on success (P2-6)
- [x] Add private `discardWorktree(engine, taskId)` — force-removes worktree and branch
- [x] **Critical (P1-8)**: In advance route handler, call `mergeTaskWorktree()` for all completed tasks with worktrees BEFORE calling `advanceWorkflow()`
- [x] In `collectEnrichedContext()`: when task has `worktreePath`, run git commands in worktree cwd instead of main cwd
- [x] In `reconcileWithRunningProcesses()`: clear stale `worktreePath` if directory doesn't exist
- [x] Test: parallel tasks get separate worktrees via auto-detect
- [x] Test: worktree changes merge to main on advance
- [x] Test: worktree is discarded on reject (via `cleanupTaskChanges`)
- [x] Test: single task with `isolation: 'shared'` uses main cwd
- [x] Test: worktree creation failure falls back to shared cwd gracefully
- [x] Test: merge conflict escalates to Lead

## Phase 7: Lead SOUL.md Update

- [x] Add "Implementation (creating new files)" template with `fileManifest` example and "When to use fileManifest" guidance
- [x] Update prompt wording: "create these files" (tool-agnostic) not "use Write tool" (P2-1)
- [x] Add `fallback-workflow.sh` as option in Workflow Progress Notifications action block
- [x] Update rejection cap guidance: "use fallback-workflow.sh when configured, especially when RECOMMENDED"
- [x] Add `fallback` skill reference to Core Skills section

## Phase 8: Verification

- [x] Integration: create a DAG with `fileManifest`, verify prompt includes manifest block and validation runs on completion
- [x] Integration: reject a task, verify cleanup reverts tracked files AND removes untracked files, and next attempt starts clean
- [x] Integration: exhaust `maxRejects`, verify Lead prompt shows fallback option at penultimate reject, and `fallback-workflow.sh` merges remaining tasks
- [x] Integration: create a DAG with 2 parallel tasks, verify each gets a worktree and diffs are isolated
- [x] Integration: verify enriched context shows incremental diff (not cumulative) after rejection+retry
- [x] Integration: verify worktree merge happens BEFORE downstream tasks start on advance
