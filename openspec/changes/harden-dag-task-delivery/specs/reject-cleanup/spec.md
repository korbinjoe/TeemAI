# Spec: Reject-Time Cleanup

## ADDED Requirements

### Requirement: Revert task changes on rejection

When a task is rejected, the scheduler SHALL revert files changed since the
task's `baselineSha` so the next retry starts from a clean state.

#### Scenario: Rejected task's tracked file changes are reverted

- **Given** a task started with `baselineSha` of `abc123`
- **And** the agent modified existing files `SKILL.md` and `skills/init/SKILL.md`
- **When** Lead rejects the task with feedback
- **Then** the scheduler runs `git checkout abc123 -- <changed-files>` to revert those files
- **And** the next retry attempt starts with the tracked files matching `abc123`

#### Scenario: Rejected task's newly created files are removed

- **Given** a task started with `baselineSha` of `abc123`
- **And** the agent created new untracked files `skills/graph-probe/SKILL.md` and `skills/graph-probe/scripts/explore.sh`
- **When** Lead rejects the task with feedback
- **Then** the scheduler removes the untracked files via `git clean`
- **And** the next retry attempt starts without those files on disk

#### Scenario: Cleanup skipped when no baseline SHA exists

- **Given** a task has no `baselineSha` (non-git workspace)
- **When** Lead rejects the task
- **Then** the scheduler skips cleanup with a debug log
- **And** the rejection proceeds normally

#### Scenario: Cleanup skipped when another task is running in shared cwd

- **Given** two tasks share the same working directory (no worktree isolation)
- **And** task-A is running while task-B is being rejected
- **When** the scheduler attempts cleanup for task-B
- **Then** the cleanup is skipped to avoid disrupting task-A
- **And** a log message explains why cleanup was skipped

#### Scenario: Cleanup failure does not block rejection

- **Given** a task is being rejected with feedback
- **And** the `git checkout` command fails (e.g. file was deleted, merge conflict)
- **When** the scheduler attempts cleanup
- **Then** the cleanup failure is logged as a warning
- **And** the rejection still succeeds
- **And** the task is still reset to pending with feedback

### Requirement: Cleanup SHALL complete before retry starts

The reject route handler SHALL await cleanup completion before calling
`advanceWorkflow()`, preventing a race condition where the retry agent
and cleanup operate on the same repository concurrently.

#### Scenario: Reject route awaits cleanup before advancing

- **Given** a task is rejected via the `/api/workflow/:id/tasks/:taskId/reject` endpoint
- **When** the route handler processes the rejection
- **Then** `cleanupTaskChanges()` is awaited synchronously
- **And** `advanceWorkflow()` is called only after cleanup resolves
- **And** the retry agent starts with a clean working directory
