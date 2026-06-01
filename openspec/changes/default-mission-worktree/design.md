# Design — Mission Worktree Lifecycle

## Architecture Overview

```
[Existing — no change]
Workspace settings: worktreeEnabled toggle (default off)
  → User enables toggle
  → Mission created → ChatService.createChat()
    → worktreeEnabled? → detectGitRepo() → WorktreeManager.create()
    → attach worktreeSessions to chat record

[New — auto-merge + lifecycle]
Mission reaches terminal state
  → WorktreeLifecycleManager.onMissionTerminal(chatId)
    → has commits ahead of base?
      → sole Mission in Workspace? → auto squash-merge + cleanup
      → multiple Missions? → skip (leave for user review)
    → no commits? → silent cleanup

Mission deleted
  → WorktreeLifecycleManager.onMissionDeleted(chatId)
    → force-remove worktrees + branches

Server startup
  → WorktreeLifecycleManager.pruneOrphans()
    → scan .worktrees/ dirs, remove those without matching chat
```

## Key Changes

### 1. Squash merge in WorktreeManager

**File**: `server/git/WorktreeManager.ts`

Add `squash` and `message` options to existing `merge()` method:

```typescript
async merge(options: {
  worktreePath: string
  targetBranch: string
  squash?: boolean     // NEW — default true
  message?: string     // NEW — custom commit message
}): Promise<MergeResult>
```

When `squash=true`:
1. `git merge --squash <branch>` in repo root
2. `git commit -m "<message>"` with Mission title as default
3. Return commit hash

### 2. WorktreeLifecycleManager

**New file**: `server/git/WorktreeLifecycleManager.ts`

```typescript
export class WorktreeLifecycleManager {
  constructor(
    private chatStore: ChatStore,
    private workspaceStore: WorkspaceStore,
  ) {}

  async onMissionTerminal(chatId: string): Promise<void>
  async onMissionDeleted(chatId: string): Promise<void>
  async pruneOrphans(): Promise<void>
}
```

**`onMissionTerminal`** logic:
1. Get chat and its worktree sessions
2. Count other running missions in same workspace
3. For each active worktree session:
   - 0 ahead + 0 changed → silent cleanup (status = `abandoned`)
   - Has changes + sole Mission → auto squash-merge (status = `merged` on success)
   - Has changes + siblings running → skip (leave `active`)
   - Merge conflicts → keep alive, notify user
4. Update chat record with new session statuses

**`onMissionDeleted`** logic:
1. Force-remove all worktrees for this chat
2. Delete associated branches

**`pruneOrphans`** logic:
1. For each workspace repo, list worktrees in `.worktrees/`
2. Cross-reference with all chat records in DB
3. Remove worktrees with no matching chat

### 3. Hook into chat status transitions

When chat status changes to terminal (`stopped`, `idle` after agents finish), call `onMissionTerminal()`. When chat is deleted, call `onMissionDeleted()` before removing the DB record.

### 4. MergeDialog squash option

Update `MergeDialog` to default to squash merge. The API call changes from:
```json
{ "worktreePath": "...", "targetBranch": "main" }
```
to:
```json
{ "worktreePath": "...", "targetBranch": "main", "squash": true }
```

## Decisions

### D1: Squash merge as default

Agent intermediate commits are noise. Users think "this Mission did one thing" → one commit. Both auto-merge and manual MergeDialog default to squash.

### D2: Auto-merge only when sole Mission

If Mission A auto-merges while Mission B is running, B's base changes and B's eventual merge may conflict. When multiple Missions are active, let the user batch-review and merge in order.

### D3: Silent cleanup for no-change worktrees

If a worktree has 0 commits ahead and 0 changed files (pure research Mission, failed agent), delete silently — no notification, no merge commit.

### D4: Keep worktreeEnabled toggle as-is

The toggle is the opt-in control. Default off. No change to the toggle behavior or UI. This lets users try the feature explicitly rather than having it imposed.

### D5: FileTree roots switch to worktree path

**File**: `web/components/ide/RightPanel.tsx`

Current logic (`RightPanel.tsx:75-77`):
```typescript
if (repositories && repositories.length > 0) {
  return repositories.map(r => ({ path: r.path, name: r.name }))
}
```

This always uses the original repo path, even when a worktree is active. The agent works in the worktree directory, so the user sees stale files.

**Change**: When active worktree sessions exist, map each repository to its worktree path. The `worktreeSessions` array carries `repositoryId` which links back to each repository. For repos without a worktree session, fall back to the original path.

```typescript
const roots = useMemo<WorkspaceRoot[]>(() => {
  if (repositories && repositories.length > 0) {
    return repositories.map(r => {
      const wtSession = worktreeSessions?.find(
        s => s.repositoryId === r.id && s.status === 'active'
      )
      return {
        path: wtSession?.worktreePath ?? r.path,
        name: r.name,  // keep original name, not worktree hash
      }
    })
  }
  if (ideRootPath) {
    return [{ path: ideRootPath, name: ideRootPath.split('/').pop() || ideRootPath }]
  }
  return []
}, [repositories, ideRootPath, worktreeSessions])
```

**Props change**: `RightPanel` needs to receive `worktreeSessions` (currently only gets `worktreePath` which is the first session's path). `ChatInstance` already has `allWorktreeSessions` and passes it as a single path — change to pass the full array.

**Display name**: Use the original repository name, not the worktree directory name (`.worktrees/abc123` is not meaningful to users).
