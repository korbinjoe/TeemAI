# Mission Worktree Lifecycle

## Summary

Complete the worktree feature by adding auto-merge and lifecycle management. The existing `worktreeEnabled` toggle in Workspace settings stays as the opt-in control (default off). When enabled, each Mission automatically gets a worktree; on Mission completion, the system auto-squash-merges (single Mission) or surfaces for batch review (multi-Mission). Orphaned worktrees are cleaned up automatically.

## Motivation

The worktree creation path already works — `ChatService.createChat()` creates a worktree per repo when `worktreeEnabled=true`. But the lifecycle after creation is incomplete:

1. **No auto-merge** — user must manually open MergeDialog even when the Mission succeeded cleanly
2. **No squash merge** — agent intermediate commits ("fix lint", "retry") pollute main branch history
3. **No lifecycle cleanup** — orphaned worktrees accumulate on disk after Mission deletion or crashes
4. **Single-Mission UX overhead** — user has to manually merge even when there's only one Mission and no conflict

### Current State

- `Workspace.worktreeEnabled`: manual toggle, default `false` — **keep as-is**
- `ChatService.createChat()`: creates worktree per repo when toggle is on — **keep as-is**
- `WorktreeManager.merge()`: full merge only (`--no-ff`), no squash option
- `MergeDialog`: manual merge UI, no squash option
- No auto-merge on Mission completion
- No auto-cleanup on Mission/Workspace deletion

## Goals

1. Add squash merge as the default merge strategy
2. Auto-squash-merge on Mission completion when it's the sole Mission (transparent UX)
3. Auto-cleanup worktrees on Mission/Workspace deletion
4. Prune orphaned worktrees periodically

## Non-Goals

- Changing the default value of `worktreeEnabled` (stays `false`)
- Removing the toggle from Workspace settings
- Per-agent worktree isolation
- Conflict resolution UI beyond existing terminal fallback

## Approach

### 1. Squash merge support

Add `squash` and `message` options to `WorktreeManager.merge()`. Default to squash. Update `MergeDialog` to use squash merge.

### 2. Auto-merge on Mission completion

When a Mission reaches terminal state and has worktree sessions:
- **Solo Mission in Workspace**: auto-squash-merge if clean, auto-delete worktree
- **Multiple Missions running**: leave for user batch review in MergeDialog
- **No changes**: silent cleanup (delete worktree, no merge commit)
- **Merge conflicts**: keep worktree alive, notify user

### 3. Lifecycle cleanup

- Mission delete → force-remove associated worktrees and branches
- Workspace delete → clean all worktrees
- Server startup → prune orphaned worktrees (no matching chat in DB)

## Risks

| Risk | Mitigation |
|------|-----------|
| Auto-merge conflicts on single Mission | Only auto-merge when merge is clean; conflict → surface for manual review |
| Disk space from accumulated worktrees | Lifecycle cleanup + periodic prune |
| Auto-merge changes base for sibling Missions | Only auto-merge when no other Missions are running |
