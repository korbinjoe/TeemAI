# Proposal: Lead-Driven Merge Conflict Resolution

## Summary

When multiple Mission worktrees merge back to the base branch and produce
conflicts, Lead dispatches a fullstack-engineer to resolve them, then reviews
the resolution result. Replaces the current "fall back to user terminal"
behavior.

## Motivation

Current worktree merge flow has a gap:

1. Single Mission, no conflict → auto squash-merge (good)
2. Multiple Missions → user batch review in MergeDialog (ok)
3. Merge conflict → **"please resolve manually in terminal"** (bad)

Step 3 breaks the core promise of OpenTeam: the system should run
independently while the user is away. A merge conflict stalls the entire
pipeline and requires the user to context-switch into a terminal to run
`git merge` manually. This is especially painful in pulse-mode — the user
comes back to find everything blocked on a conflict they could have been
notified about hours ago.

Lead already has the judge capability (lead-as-judge) to review agent output
and reject/advance. Extending this to merge conflict resolution is a natural
fit: Lead detects the conflict, dispatches an engineer to resolve it, then
reviews the result.

## Goals

1. When `WorktreeManager.merge()` returns conflicts, the system
   automatically dispatches a fullstack-engineer to resolve them
2. Lead reviews the resolution (via enriched context from lead-as-judge)
   before finalizing the merge
3. If auto-resolution fails twice, escalate to user with conflict details
4. Works for both auto-merge (single Mission completion) and user-triggered
   merge (MergeDialog)

## Non-Goals

- Resolving conflicts that involve binary files or submodules
- Changing the worktree creation or lifecycle flow
- Building a visual conflict resolution UI
- Resolving conflicts between uncommitted changes (only committed branch
  divergence)

## Approach

### 1. Conflict detection and dispatch

When `WorktreeManager.merge()` returns `{ success: false, conflicts: [...] }`,
instead of surfacing "resolve manually", the system:

1. Creates a conflict resolution worktree (or reuses the existing one)
2. Starts the merge in that worktree to materialize conflict markers
3. Lead dispatches a fullstack-engineer with:
   - The list of conflicting files
   - The diff from both branches for each conflicting file
   - The base branch and feature branch names
   - Instructions to resolve conflicts and commit

### 2. Engineer resolves conflicts

The fullstack-engineer agent:

1. Reads each conflicting file with conflict markers
2. Understands intent from both branches' diffs
3. Resolves conflicts by editing files to remove markers
4. Runs `git add` on resolved files
5. Commits the merge

### 3. Lead reviews resolution

After the engineer finishes, Lead receives the enriched context (same as
lead-as-judge flow):

- Git diff stat of the merge commit
- Content preview of resolved files
- List of files that were conflicting

Lead judges: did the resolution preserve intent from both branches? If not,
reject with feedback. If yes, finalize.

### 4. Escalation

If the engineer fails to resolve (2 reject cycles), Lead writes an
`open_question` to the war-room with:

- Which files conflict
- What both branches were trying to do
- Why auto-resolution failed

User sees this in the MergeDialog or notification and can resolve manually.

## Risks

| Risk | Mitigation |
|------|-----------|
| Engineer resolves conflict incorrectly (drops code from one side) | Lead reviews the resolution diff before finalizing; reject + feedback loop |
| Complex semantic conflicts (same function modified differently) | Engineer has full diff context from both branches; 2 retry cap before escalation |
| Binary file conflicts | Explicitly excluded — immediate escalation to user |
| Merge resolution introduces new bugs | Downstream reviewer agents in the DAG still run; this only unblocks the merge step |

## Impact

### Files Modified

- `server/git/WorktreeManager.ts` — add `mergeWithConflictMarkers()` method to materialize conflicts in worktree
- `server/git/WorktreeLifecycleManager.ts` — hook conflict dispatch into `onMissionTerminal()` flow
- `server/orchestration/WorkflowScheduler.ts` — add merge conflict resolution as a dispatchable task type
- `ai-assets/agents/lead/SOUL.md` — add merge conflict handling to judgment protocol
- `web/components/worktree/MergeDialog.tsx` — show "auto-resolving" status instead of "resolve manually"

### No Changes To

- `WorktreeManager.create()` / `remove()` / worktree lifecycle
- DAG format or WorkflowEngine state machine
- Database schema
