# Proposal: Harden DAG Task Delivery

## Summary

Close the delivery reliability gaps in the workflow DAG system that cause
task agents to produce zero usable output — as observed in the `de4d1707`
session where a 3-task DAG (phase0-bridge, phase1-extension, phase2-preview)
burned 8 Lead interactions with zero TypeScript files created, ultimately
forcing Lead to abandon the DAG and fall back to a single handoff.

The existing `lead-as-judge` mechanism (reject + enriched diff) is necessary
but not sufficient: the judge can detect failure, but the retry path doesn't
fix the root causes of failure. This proposal addresses **why agents fail**
and **why retries don't help**, rather than adding more detection.

## Motivation

### Root Cause Analysis — `de4d1707` session

1. **Agent wrote to SKILL.md instead of creating .ts files**: the task
   description said "implement bridge server" but the agent's heuristic — in
   a skill project directory full of `SKILL.md` files — defaulted to editing
   what already existed. No constraint in the description forced file creation.

2. **Reject feedback was ignored**: two rejections with increasingly specific
   feedback produced identical git diffs. The feedback was prepended to the
   prompt, but the agent still saw the same project structure that caused the
   original misfire. No invalid work was cleaned up between retries.

3. **Git diff was cumulative**: `HEAD~1` showed the same diff across all
   retries because the agent's changes were committed once and subsequent
   retries didn't make new commits. Lead couldn't distinguish "retry produced
   nothing new" from "retry produced the same thing".

4. **Parallel tasks shared cwd without isolation**: phase0-bridge and
   phase1-extension both ran as `fullstack-engineer` in the same directory.
   Their git diffs merged, making per-task assessment impossible. phase1 was
   marked complete despite creating no files.

5. **No degradation path**: after 3 failures Lead manually abandoned the DAG
   and handoff'd a single monolithic task. This should be automatic.

### Why existing mechanisms didn't help

| Mechanism | What it does | Gap |
|-----------|-------------|-----|
| `lead-as-judge` reject | Prepends feedback to retry prompt | Agent ignores feedback when project context is stronger |
| Enriched diff | Shows `git diff --stat HEAD~1` | Cumulative, not per-attempt incremental |
| `maxRejects: 2` | Caps retries | No fallback strategy when cap is reached |
| Deliverables clause in SOUL.md | Template guidance | Not enforced at task level — just prompt advice |

## Goals

1. **Structured task descriptions** for "create new files" tasks — explicit
   file manifest, tool constraints, file-type restrictions
2. **Incremental diff per attempt** — baseline SHA recorded at task start,
   diff computed against baseline on completion
3. **Reject-time cleanup** — revert agent's changes before retry so the agent
   starts from a clean state, not from its own failed output
4. **DAG-level fallback strategy** — when all retries and rejects for a task
   are exhausted, automatically merge remaining tasks into a single handoff
5. **Parallel task worktree isolation** — when 2+ tasks run concurrently,
   each gets its own git worktree

## Non-Goals

- Changing the DAG JSON schema for existing simple tasks (backward-compatible)
- Adding server-side acceptance criteria rules (Lead remains the judge)
- Changing the Deliverables clause templates in SOUL.md (those stay as guidance)
- Full mission-level worktree lifecycle (covered by `default-mission-worktree`)

## Approach

### C1: Structured File Manifest in Task Description

Add an optional `fileManifest` field to `WorkflowTask`:

```typescript
interface FileManifest {
  create: string[]       // files that MUST be created (Write tool)
  modify?: string[]      // files that MAY be modified
  forbid?: string[]      // glob patterns that MUST NOT be touched
}
```

When `fileManifest` is present, the scheduler:
- Appends a structured block to the agent's prompt listing required files
- On task completion, validates that all `create` files exist on disk
- Reports validation result in the enriched context sent to Lead

Lead's SOUL.md gets updated to include `fileManifest` in the "Implementation"
Deliverables template when the task creates new files.

### C2: Per-Attempt Incremental Diff

When `startTask()` launches an agent, record `git rev-parse HEAD` as
`taskState.baselineSha`. When `collectEnrichedContext()` runs on completion,
use `git diff <baselineSha>..HEAD --stat` instead of `HEAD~1`. This shows
exactly what THIS attempt changed, even across multiple commits.

### C3: Reject-Time Cleanup

When `rejectTask()` is called and the task has a `baselineSha`:
1. Run `git diff <baselineSha>..HEAD --name-only` to find changed files
2. Run `git checkout <baselineSha> -- <files>` to revert only those files
3. The next retry starts from the clean baseline state

Skip cleanup if the engine has no `cwd` or the `baselineSha` is missing.
Cleanup failures are logged but do not block the rejection.

### C4: DAG Fallback Strategy

Add an optional `fallback` field to the DAG-level config:

```typescript
interface WorkflowDag {
  tasks: WorkflowTask[]
  fallback?: {
    strategy: 'merge-remaining'  // only strategy for now
    agentId?: string             // default: same as failed task
  }
}
```

When a task reaches its `maxRejects` cap AND Lead chooses to not advance:
- Collect all remaining `pending` tasks (including the failed one)
- Merge their descriptions into a single combined task description
- Dispatch as a single handoff to the specified agent
- Mark the workflow as `completed` with result `partial`

### C5: Parallel Task Worktree Isolation

When `startTask()` detects 2+ tasks will run concurrently (another task in
the same engine already has status `running`), create a git worktree for the
new task via `WorktreeManager.create()`. The agent's `cwd` points to the
worktree instead of the main repo.

On task completion, diff the worktree changes back. On reject, remove the
worktree cleanly.

Opt-in via `WorkflowTask.isolation?: 'worktree' | 'shared'` (default
`'shared'` for backward compatibility). When set to `'worktree'`, always
use a worktree regardless of concurrency.

## Risks

| Risk | Mitigation |
|------|-----------|
| `fileManifest` validation false-negative (file exists but empty) | Check file size > 0 in addition to existence |
| `git checkout` cleanup removes valid work from other parallel tasks | C5 worktree isolation prevents cross-task interference; C3 only runs for shared-cwd tasks when no other task is running |
| Worktree creation overhead | ~200ms per worktree; only triggered for concurrent tasks |
| Fallback merge description too long for agent context | Cap merged description at 8000 chars; truncate per-task descriptions proportionally |
| Baseline SHA stale after rebase | Record SHA at task start, not at workflow creation; if SHA is unreachable, fall back to cumulative diff |

## Impact

### Files Modified

- `shared/workflow-types.ts` — add `FileManifest`, `baselineSha`, `fallback`, `isolation` fields
- `server/orchestration/WorkflowEngine.ts` — add `baselineSha` to task state, implement fallback logic
- `server/orchestration/WorkflowScheduler.ts` — incremental diff collection, file manifest validation, worktree integration, reject cleanup
- `ai-assets/agents/lead/SOUL.md` — add `fileManifest` guidance to Implementation template

### Potentially Affected Features

- DAG task execution — core change (C1-C5)
- Lead judge protocol — enhanced context (C2), new fallback action (C4)
- Git worktree management — new consumer (C5)

### No Changes To

- `create-workflow.sh` / `reject-task.sh` / `advance-workflow.sh` (shell scripts unchanged)
- WorkflowRegistry lifecycle
- Database schema
- Frontend/UI (enriched prompt changes are text-only)

## Relationship to Existing Proposals

- **Extends `lead-as-judge`**: C2 improves enriched context accuracy; C3 makes reject+retry effective
- **Extends `workflow-reliability`**: C4 adds degradation path when L2 watchdog and L3 autoAdvance can't help
- **Consumes `default-mission-worktree`**: C5 uses WorktreeManager but scoped to per-task, not per-mission
- **No conflict with `lead-stateless-dag`**: all changes are server-side; Lead remains stateless
