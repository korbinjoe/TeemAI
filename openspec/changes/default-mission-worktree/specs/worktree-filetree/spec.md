# Spec: Worktree FileTree Alignment

When a Mission has an active worktree, the file tree SHALL show the worktree directory instead of the original repository, so the user sees exactly what the agent sees.

## ADDED Requirements

### Requirement: FileTree roots switch to worktree path

When a Mission has active worktree sessions, the IDE file tree roots SHALL use the worktree paths instead of the original Workspace repository paths. This ensures the user sees the agent's working copy, including uncommitted changes.

#### Scenario: Mission with active worktree

- **Given** a Mission with an active worktree at `<repo>/.worktrees/abc123`
- **And** the Workspace has repository `<repo>` configured
- **When** the user views the Mission's IDE panel
- **Then** the file tree root is `<repo>/.worktrees/abc123`
- **And** the root display name stays the original repository name (not the worktree hash)
- **And** file changes made by the agent are immediately visible in the tree

#### Scenario: Mission without worktree

- **Given** a Mission with no worktree sessions (worktreeEnabled is false)
- **When** the user views the Mission's IDE panel
- **Then** the file tree roots are the original Workspace repository paths
- **And** behavior is unchanged from current

#### Scenario: Worktree merged or abandoned

- **Given** a Mission whose worktree has been merged (status = `merged`)
- **When** the user views the Mission's IDE panel
- **Then** the file tree roots fall back to the original Workspace repository paths
- **And** the user sees the post-merge state on the main branch

#### Scenario: Multiple repositories with partial worktrees

- **Given** a Workspace with 3 repositories, 2 of which have active worktree sessions
- **When** the user views the Mission's IDE panel
- **Then** the 2 repos with worktrees show their worktree paths
- **And** the 1 repo without a worktree shows its original path
