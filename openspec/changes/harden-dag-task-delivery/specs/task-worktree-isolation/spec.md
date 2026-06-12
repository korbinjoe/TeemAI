# Spec: Task Worktree Isolation

## ADDED Requirements

### Requirement: Auto-detect worktree need for concurrent tasks

The scheduler SHALL launch a new task in a separate git worktree when another
task in the same workflow is already running in the same cwd, to prevent
cross-task interference in parallel DAG execution.

#### Scenario: Second concurrent task gets a worktree

- **Given** a DAG with parallel tasks A and B (no dependency between them)
- **And** task A is already running in `/workspace/repo`
- **And** neither task has explicit `isolation` set
- **When** the scheduler starts task B
- **Then** a git worktree is created at `wf-<workflowId>-B`
- **And** task B's agent receives the worktree path as its cwd
- **And** `taskState.worktreePath` is set to the worktree path

#### Scenario: Single task does not get a worktree

- **Given** a DAG with sequential tasks A → B
- **And** no other task is currently running
- **When** the scheduler starts task A
- **Then** no worktree is created
- **And** task A runs in the main workspace cwd

#### Scenario: Explicit isolation override

- **Given** a task has `isolation: 'worktree'` set explicitly
- **And** no other task is currently running
- **When** the scheduler starts the task
- **Then** a worktree is created regardless of concurrency

#### Scenario: Explicit shared override prevents worktree

- **Given** a task has `isolation: 'shared'` set explicitly
- **And** another task is running in the same cwd
- **When** the scheduler starts the task
- **Then** no worktree is created and the task uses the shared cwd

### Requirement: Worktree cleanup on task completion

When a task that used a worktree completes, the scheduler SHALL merge or
discard the worktree changes based on the Lead's advance/reject decision.

#### Scenario: Worktree merged on advance

- **Given** task B ran in a worktree and produced valid changes
- **When** Lead advances the workflow (accept deliverables)
- **Then** the worktree branch is merged to the main branch with `--no-ff`
- **And** the worktree directory and branch are removed

#### Scenario: Worktree discarded on reject

- **Given** task B ran in a worktree and produced invalid changes
- **When** Lead rejects the task
- **Then** the worktree directory and branch are removed without merging
- **And** a new worktree is created when the task retries

#### Scenario: Worktree creation failure falls back to shared cwd

- **Given** `WorktreeManager.create()` fails (e.g. disk full, git error)
- **When** the scheduler attempts to create a worktree for a task
- **Then** the failure is logged as a warning
- **And** the task starts using the shared main cwd

### Requirement: Enriched context from worktree

The scheduler SHALL run git commands in the task's worktree cwd when
collecting enriched context, instead of using the main workspace cwd.

#### Scenario: Diff collected from worktree

- **Given** task B ran in worktree at `/workspace/.worktrees/wf-abc-B`
- **When** the scheduler collects enriched context
- **Then** `git diff --stat` is run in `/workspace/.worktrees/wf-abc-B`
- **And** the diff shows only task B's changes, not task A's
