# Tasks: Lead-Driven Merge Conflict Resolution

## Phase 1: WorktreeManager Conflict Materialization

- [x] Add `mergeWithConflictMarkers()` to `WorktreeManager` — leaves worktree in conflicted state with markers, returns conflicting file list
- [x] Add binary file detection — check `git diff --numstat` for `-` entries, separate them from resolvable text conflicts
- [x] Add conflict file cap check — if >10 conflicting files, skip auto-resolution

## Phase 2: Conflict Dispatch Flow

- [x] Add `collectConflictDiffs()` to `ConflictResolver` — collect base/feature diffs for each conflicting file (capped at 3000 chars per side)
- [x] Add `notifyLead()` on `WorkflowScheduler` — build conflict prompt and wake Lead agent with conflict details
- [x] Create `ConflictResolver` module — orchestrates conflict detection, diff collection, and Lead dispatch
- [x] Hook into merge API route — when user-triggered merge returns conflicts, trigger auto-resolution and return `{ autoResolving: true }`

## Phase 3: Lead Conflict Handling

- [x] Update `ai-assets/agents/lead/SOUL.md` — add merge conflict handling section: dispatch engineer, review resolution, escalation protocol
- [x] Add conflict resolution prompt template to `ConflictResolver.buildConflictPrompt()`

## Phase 4: Post-Resolution Review

- [x] After engineer completes, Lead reviews merge commit via existing lead-as-judge enriched context flow
- [x] On reject: engineer retries with feedback (reuse lead-as-judge reject mechanism)
- [x] On 2nd rejection: Lead writes `open_question` with conflict details for user escalation
- [x] On accept: finalize merge commit, clean up worktree

## Phase 5: Frontend Integration

- [x] Update MergeDialog — show "Resolving conflicts..." spinner when `autoResolving: true`
- [x] Pass `chatId` to merge API for conflict resolver to dispatch Lead in correct chat

## Phase 6: Verification

- [x] Test: text file conflict triggers Lead dispatch via `notifyLead`
- [x] Test: binary file conflict escalates immediately (returns `binary_conflicts_only`)
- [x] Test: >10 file conflicts escalate immediately (returns `too_many_conflicts`)
- [x] Test: mixed binary+text conflict dispatches Lead and notes binary files in prompt
- [x] Test: no conflicts returns `no_text_conflicts`
