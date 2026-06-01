# Spec: Worktree Auto-Merge

Automatic squash merge when a Mission completes, with manual review fallback for multi-Mission scenarios.

## ADDED Requirements

### Requirement: Squash merge support in WorktreeManager

`WorktreeManager.merge()` SHALL support a `squash` option that performs `git merge --squash` followed by a single commit with a provided message. Default behavior SHALL be squash merge.

#### Scenario: Squash merge with custom message

- **Given** a worktree branch `wt/abc123` with 5 commits ahead of `main`
- **When** `merge({ worktreePath, targetBranch: 'main', squash: true, message: 'Add auth flow' })` is called
- **Then** all 5 commits are squashed into a single commit on `main`
- **And** the commit message is "Add auth flow"
- **And** `MergeResult.success` is `true`

#### Scenario: Squash merge with conflicts

- **Given** a worktree branch that conflicts with the target branch
- **When** squash merge is attempted
- **Then** `MergeResult.success` is `false`
- **And** `MergeResult.conflicts` lists the conflicting files
- **And** the target branch is left unchanged (merge aborted)

### Requirement: Auto-merge on single Mission completion

When a Mission reaches a terminal state and it is the only running Mission in the Workspace, the system SHALL auto-squash-merge its worktree if there are commits ahead of base.

#### Scenario: Single Mission completes with changes

- **Given** Mission A is the only running Mission in Workspace W
- **And** Mission A's worktree has 3 commits ahead of `main`
- **When** Mission A reaches terminal state
- **Then** the worktree is squash-merged to `main` with message = Mission title
- **And** the worktree is deleted
- **And** the worktree session status is set to `merged`

#### Scenario: Single Mission completes with no changes

- **Given** Mission A is the only running Mission in Workspace W
- **And** Mission A's worktree has 0 commits ahead and 0 changed files
- **When** Mission A reaches terminal state
- **Then** the worktree is deleted silently
- **And** the worktree session status is set to `abandoned`
- **And** no merge commit is created

#### Scenario: Single Mission completes but merge has conflicts

- **Given** Mission A is the only running Mission in Workspace W
- **And** Mission A's worktree has changes that conflict with `main`
- **When** Mission A reaches terminal state
- **Then** auto-merge is NOT performed
- **And** the worktree is kept alive
- **And** user is notified that manual merge is needed

### Requirement: Skip auto-merge with multiple running Missions

When a Mission completes but other Missions are still running in the same Workspace, the system SHALL NOT auto-merge. The worktree is left for user batch-review.

#### Scenario: Mission completes while sibling is running

- **Given** Mission A and Mission B are both running in Workspace W
- **When** Mission A reaches terminal state
- **Then** Mission A's worktree is NOT auto-merged
- **And** the worktree remains `active` for user review
- **And** user can manually merge via MergeDialog
