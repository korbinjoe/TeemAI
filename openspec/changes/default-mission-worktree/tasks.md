# Tasks — Mission Worktree Lifecycle

## Phase 1: Squash merge support

- [ ] Add `squash` and `message` options to `WorktreeManager.merge()`
- [ ] Implement squash merge: `git merge --squash` + `git commit -m`
- [ ] Update `MergeDialog` to default to squash merge
- [ ] Update `/api/worktree/merge` route to accept `squash` and `message` params
- [ ] Add unit test for squash merge in `WorktreeManager`

## Phase 2: Auto-merge on Mission completion

- [ ] Create `WorktreeLifecycleManager` in `server/git/WorktreeLifecycleManager.ts`
- [ ] Implement `onMissionTerminal()`: check sibling count → auto-merge or skip
- [ ] Hook into chat status transition to call `onMissionTerminal()`
- [ ] Handle auto-merge failure (conflicts): keep worktree, notify user
- [ ] Silent cleanup for no-change worktrees (0 ahead, 0 changed)

## Phase 3: Lifecycle cleanup

- [ ] Implement `onMissionDeleted()`: force-remove worktrees on Mission delete
- [ ] Hook into Mission delete flow to call `onMissionDeleted()`
- [ ] Implement `pruneOrphans()`: scan `.worktrees/` dirs, cross-reference with DB
- [ ] Call `pruneOrphans()` on server startup
- [ ] Cleanup on Workspace delete: remove all Mission worktrees

## Phase 4: FileTree worktree alignment

- [ ] Pass `worktreeSessions` array to `RightPanel` (replace single `worktreePath` prop)
- [ ] Update `RightPanel` roots logic: map repos to worktree paths when active sessions exist
- [ ] Keep original repo name as display name (not worktree hash)
- [ ] Fall back to original repo path when worktree is merged/abandoned or not present
- [ ] Update `ChatInstance` to pass `allWorktreeSessions` to `RightPanel`

## Phase 5: UX polish

- [ ] Suppress worktree UI noise when auto-merge succeeds (no badge, no dialog)
- [ ] Add notification when auto-merge fails due to conflicts
- [ ] Ensure `WorktreePanel` / `MergeDialog` still work for multi-Mission manual review
- [ ] Test: single Mission → complete → auto-merge → code on main
- [ ] Test: two Missions → both complete → user reviews and merges each
