# Spec: Worktree Creation

No changes to existing worktree creation behavior. This spec documents the current behavior for reference.

## MODIFIED Requirements

### Requirement: Worktree creation gated by workspace toggle

When `worktreeEnabled` is true on the Workspace, creating a Mission SHALL automatically create a git worktree for each git repository. When false (default), no worktree is created.

#### Scenario: worktreeEnabled is true with git repo

- **Given** a Workspace with `worktreeEnabled = true` and one git repository
- **When** a new Mission is created
- **Then** a worktree is created at `<repo>/.worktrees/<sessionId>`
- **And** a new branch `wt/<sessionId>` is created from the current branch
- **And** the worktree session is attached to the chat record

#### Scenario: worktreeEnabled is false

- **Given** a Workspace with `worktreeEnabled = false`
- **When** a new Mission is created
- **Then** no worktree is created
- **And** `chat.worktreeSessions` is empty

#### Scenario: worktreeEnabled is true but no git repos

- **Given** a Workspace with `worktreeEnabled = true` but no git repositories
- **When** a new Mission is created
- **Then** no worktree is created
- **And** Mission functions normally
