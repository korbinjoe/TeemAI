# Spec: Worktree Lifecycle

Automatic cleanup of worktrees when Missions are deleted or become orphaned.

## ADDED Requirements

### Requirement: Cleanup worktrees on Mission delete

When a Mission is deleted, all associated worktrees and branches SHALL be removed.

#### Scenario: Delete Mission with active worktree

- **Given** Mission A has an active worktree at `<repo>/.worktrees/abc123`
- **When** Mission A is deleted
- **Then** the worktree directory is force-removed
- **And** the branch `wt/abc123` is deleted
- **And** no error is shown to the user

#### Scenario: Delete Mission with already-merged worktree

- **Given** Mission A has a worktree session with status `merged`
- **When** Mission A is deleted
- **Then** the worktree is already gone, no cleanup needed
- **And** deletion proceeds normally

### Requirement: Cleanup worktrees on Workspace delete

When a Workspace is deleted, all worktrees across all its Missions SHALL be removed.

#### Scenario: Delete Workspace with multiple Mission worktrees

- **Given** Workspace W has 3 Missions, each with an active worktree
- **When** Workspace W is deleted
- **Then** all 3 worktrees and their branches are removed
- **And** `WorktreeManager.prune()` is called to clean any stragglers

### Requirement: Orphan worktree pruning

The system SHALL periodically check for worktrees in `.worktrees/` that do not correspond to any active chat in the database, and remove them.

#### Scenario: Orphaned worktree from crashed Mission

- **Given** a worktree exists at `<repo>/.worktrees/xyz789`
- **And** no chat record references this worktree path
- **When** the periodic prune runs
- **Then** the orphaned worktree is removed
- **And** its branch is deleted
