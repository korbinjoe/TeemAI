# Design: Lead-Driven Merge Conflict Resolution

## Architecture

```
WorktreeManager.merge() returns conflicts
        │
        ▼
WorktreeLifecycleManager
  detects conflict
        │
        ▼
┌──────────────────┐
│   Lead Agent     │
│  dispatches      │─── handoff.sh fullstack-engineer
│  conflict task   │    "Resolve merge conflicts in [files]"
└──────────────────┘
        │
        ▼ (agent completes)
┌──────────────────┐
│   Lead Agent     │
│  reviews merge   │─── advance (finalize) / reject (retry) / escalate (user)
│  resolution      │
└──────────────────┘
```

## 1. Materializing Conflicts in Worktree

### New method: WorktreeManager.mergeWithConflictMarkers()

Current `merge()` does a dry-run check then aborts if conflicts exist —
it never leaves conflict markers on disk. We need a method that
intentionally leaves the worktree in a conflicted state so the agent can
read and resolve the markers.

```typescript
async mergeWithConflictMarkers(options: {
  worktreePath: string
  targetBranch: string
}): Promise<{
  conflictingFiles: string[]
  baseBranch: string
  featureBranch: string
}> {
  const absPath = resolve(options.worktreePath)
  const featureBranch = await git(['rev-parse', '--abbrev-ref', 'HEAD'], absPath)

  // Switch to target branch in the worktree
  await git(['checkout', options.targetBranch], absPath)

  // Attempt merge — this will leave conflict markers
  try {
    await git(['merge', '--no-commit', featureBranch], absPath)
    // No conflicts — shouldn't reach here if we called this after merge() failed
    await git(['merge', '--abort'], absPath)
    return { conflictingFiles: [], baseBranch: options.targetBranch, featureBranch }
  } catch {
    // Expected: conflicts exist
  }

  // List conflicting files
  const unmerged = await git(['diff', '--name-only', '--diff-filter=U'], absPath)
  const conflictingFiles = unmerged.split('\n').filter(Boolean)

  return {
    conflictingFiles,
    baseBranch: options.targetBranch,
    featureBranch,
  }
}
```

## 2. Conflict Resolution Dispatch

### Integration point: WorktreeLifecycleManager.onMissionTerminal()

When the existing merge attempt returns `{ success: false, conflicts }`,
instead of notifying the user:

```typescript
// In onMissionTerminal, after merge fails with conflicts
if (!mergeResult.success && mergeResult.conflicts?.length) {
  // Materialize conflict markers in the worktree
  const conflictInfo = await worktreeManager.mergeWithConflictMarkers({
    worktreePath: session.worktreePath,
    targetBranch: baseBranch,
  })

  // Build context for the engineer
  const conflictDiffs = await this.collectConflictDiffs(
    worktreeManager, session.worktreePath, conflictInfo,
  )

  // Dispatch to Lead, who will handoff to fullstack-engineer
  this.notifyLeadOfConflict(chatId, {
    worktreePath: session.worktreePath,
    conflictingFiles: conflictInfo.conflictingFiles,
    baseBranch: conflictInfo.baseBranch,
    featureBranch: conflictInfo.featureBranch,
    conflictDiffs,
  })
}
```

### Conflict diff collection

For each conflicting file, collect the diff from both sides so the
engineer understands what each branch was trying to do:

```typescript
private async collectConflictDiffs(
  manager: WorktreeManager,
  worktreePath: string,
  conflictInfo: { conflictingFiles: string[]; baseBranch: string; featureBranch: string },
): Promise<Array<{ file: string; baseChange: string; featureChange: string }>> {
  const diffs: Array<{ file: string; baseChange: string; featureChange: string }> = []

  for (const file of conflictInfo.conflictingFiles.slice(0, 10)) {
    const [baseChange, featureChange] = await Promise.all([
      git(['diff', `${conflictInfo.featureBranch}...${conflictInfo.baseBranch}`, '--', file], worktreePath)
        .catch(() => '(no diff available)'),
      git(['diff', `${conflictInfo.baseBranch}...${conflictInfo.featureBranch}`, '--', file], worktreePath)
        .catch(() => '(no diff available)'),
    ])

    diffs.push({
      file,
      baseChange: baseChange.slice(0, 3000),
      featureChange: featureChange.slice(0, 3000),
    })
  }

  return diffs
}
```

## 3. Lead Notification Prompt

When Lead is woken for a merge conflict, the prompt includes:

```
[Merge conflict detected]

Worktree: {worktreePath}
Base branch: {baseBranch}
Feature branch: {featureBranch}
Conflicting files ({count}):
  - src/auth.ts
  - src/middleware.ts

Conflict details:
--- src/auth.ts ---
Base branch change:
{baseChange}

Feature branch change:
{featureChange}
---

Dispatch a fullstack-engineer to resolve these conflicts:
1. Use `handoff.sh fullstack-engineer "<task>"` with the conflict details
2. The agent should work in {worktreePath}, resolve conflict markers,
   `git add` resolved files, and commit
3. After the agent completes, review the merge commit diff
4. If resolution looks correct, finalize the merge
5. If resolution dropped code from either side, reject with feedback
6. If resolution fails after 2 attempts, write an `open_question`
   to escalate to the user
```

## 4. Engineer Task Prompt

The fullstack-engineer receives:

```
[Merge conflict resolution]

Working directory: {worktreePath}
Conflicting files: {list}

For each conflicting file:
1. Read the file to see conflict markers (<<<<<<< / ======= / >>>>>>>)
2. Understand the intent of both sides from the diffs below
3. Edit the file to resolve — preserve functionality from BOTH branches
4. Run `git add {file}` after resolving

After all files are resolved:
- Run `git commit -m "Resolve merge conflicts between {baseBranch} and {featureBranch}"`
- Do NOT drop changes from either side unless they are truly redundant

{conflict diffs for each file}
```

## 5. Post-Resolution Flow

After the engineer completes, Lead receives its standard workflow progress
notification (enriched with git diff). Lead judges:

- Does the merge commit touch all previously conflicting files?
- Does the diff show changes from both branches preserved?
- Are there any remaining conflict markers in the committed files?

If rejected, the engineer retries with feedback. After 2 rejections, Lead
escalates with an `open_question` containing:

- Which files still have issues
- What both branches were trying to do
- Why the engineer couldn't resolve it

## 6. MergeDialog Integration

When a user-triggered merge hits conflicts:

Current behavior:
```
{ success: false, conflicts: ["file1.ts", "file2.ts"],
  message: "MergeExistsConflict" }
```
→ UI shows "resolve manually in terminal"

New behavior:
→ API returns additional field `{ autoResolving: true }`
→ UI shows "Resolving conflicts..." with a spinner
→ WebSocket event `worktree:conflict-resolved` or
  `worktree:conflict-escalated` updates the dialog

## Decisions

### D1: Resolve in existing worktree, not a new one

Creating a fresh worktree for conflict resolution adds complexity. The
conflicting worktree already has the right branch state — just materialize
the markers there. The engineer works in-place.

### D2: Cap at 10 conflicting files per dispatch

If more than 10 files conflict, the merge is likely a large divergence that
needs human judgment. Escalate immediately rather than letting the agent
attempt a massive resolution.

### D3: Binary file conflicts → immediate escalation

Binary files (images, compiled assets) cannot be meaningfully resolved by
an LLM. Detect via `git diff --numstat` (binary files show `-` for
insertions/deletions) and escalate immediately.

### D4: Conflict resolution is a handoff, not a DAG task

The merge conflict is a single-agent job (fullstack-engineer), not a
multi-step workflow. Lead dispatches via `handoff.sh`, reviews on return.
No need for DAG overhead.
