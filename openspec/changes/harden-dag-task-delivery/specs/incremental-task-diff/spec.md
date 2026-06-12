# Spec: Incremental Task Diff

## ADDED Requirements

### Requirement: Baseline SHA recording at task start

The scheduler SHALL record the current `git HEAD` SHA as `baselineSha` on the
task state when starting a task agent, enabling per-attempt incremental diffs.

#### Scenario: Task starts and baseline is recorded

- **Given** a workflow task is ready to start
- **And** the workspace has a valid git repository at cwd
- **When** the scheduler calls `startTask()`
- **Then** `taskState.baselineSha` is set to the current `git rev-parse HEAD` output

#### Scenario: Task starts in non-git directory

- **Given** a workflow task is ready to start
- **And** the workspace cwd is not a git repository
- **When** the scheduler calls `startTask()`
- **Then** `taskState.baselineSha` remains undefined
- **And** the task starts normally without error

### Requirement: Incremental diff in enriched context

The enriched context collected on task completion SHALL use the per-attempt
`baselineSha` for `git diff --stat` instead of `HEAD~1`, so the diff shows
only changes from this specific attempt.

#### Scenario: Enriched diff uses baseline SHA

- **Given** a task completed and its `baselineSha` is `abc123`
- **And** the agent made 3 commits during execution (HEAD is now `def456`)
- **When** the scheduler collects enriched context
- **Then** the git diff stat is computed as `git diff --stat abc123..HEAD`
- **And** the diff shows all 3 commits' changes combined

#### Scenario: Enriched diff falls back to HEAD~1 without baseline

- **Given** a task completed but has no `baselineSha` (e.g. non-git workspace)
- **When** the scheduler collects enriched context
- **Then** the git diff stat falls back to `git diff --stat HEAD~1`

#### Scenario: Rejected task retry shows only new attempt's changes

- **Given** a task was rejected after its first attempt (baseline `abc123`, HEAD moved to `def456`)
- **And** the task was cleaned up and restarted with a new baseline `def456`
- **And** the retry attempt made 1 commit (HEAD is now `ghi789`)
- **When** the scheduler collects enriched context for the retry
- **Then** the diff is computed as `git diff --stat def456..HEAD`
- **And** the diff shows only the retry's changes, not the original attempt's
