# Design: Optimize Mission Runtime Performance

## Context

The diagnostic established that the render/state pipeline — not parsing,
virtualization, xterm, or the server — is the source of jank. This design
keeps every observable behavior identical and only changes *how often* and
*how much* work is redone. It follows CLAUDE.md Rule 2 (minimal change): no new
abstraction layers (no Buffer/Cache/Queue middleware), no state-library swap.

The current data flow per Mission:

```
WS event ─▶ useExpertEvents (delta buffer 16ms / partial-text DIRECT)
        ─▶ setAgentMessages(map: agentId -> Message[])
        ─▶ useAgentMessages.mergedMessages  (FULL flatten + sort, O(n log n))
        ─▶ ChatInstance.visibleMessages
        ─▶ groups = groupMessages(visibleMessages)   (O(n) dedup + group)
        ─▶ groupActivities effects (iterate ALL groups)
        ─▶ ChatBody <Virtuoso> (already virtualized — fine)
```

Each per-agent slot (`agentMessages[agentId]`) is **already kept in timestamp
order** by both the delta merge (`mergeAgentBatch`) and replay
(`applyAgentReplay`), which insert via ordered merge. That invariant is the key
the current `mergedMessages` ignores when it re-sorts from scratch.

## Decisions

### D1: Incremental k-way merge for `mergedMessages`

**Decision**: Replace the flatten + `Array.sort` in `useAgentMessages.ts:61-66`
with a k-way merge across the per-agent slots, exploiting the existing
per-slot sorted invariant.

**Rationale**: Each slot is sorted. Merging `k` sorted lists of total length
`n` is `O(n)` (not `O(n log n)`), and — more importantly — the common case
during streaming is "one slot gained a tail element", which can take an
append fast-path. We memoize on `agentMessages` identity (unchanged), but the
inner work drops from a full sort to a linear merge, and to near-constant when
only one slot changed and the new items are newest.

**Algorithm**:
```
mergedMessages(agentMessages):
  slots = Object.values(agentMessages)          // each already sorted asc by ts
  if slots.length === 1: return slots[0]          // no copy needed
  // standard k-way merge by timestamp
  return kWayMergeByTimestamp(slots)
```
A heap is unnecessary at `k≈1–6`; a simple per-slot cursor min-scan is fine and
allocation-light. The result must be **stable** with the same tie-break the old
`a.timestamp - b.timestamp` sort produced (equal timestamps keep slot order /
insertion order) so downstream `groupMessages` dedup is unaffected.

**Invariant guard (rollout only)**: behind a dev flag, assert the incremental
result deep-equals `[...all].sort(...)` by id sequence; remove after soak.

### D2: Buffer partial-text through the delta path

**Decision**: `handleExpertPartialText` (`useExpertEvents.ts:363-394`) appends
into the per-agent delta buffer via `pushDelta` instead of calling
`setAgentMessages` directly.

**Rationale**: Deltas already coalesce on a 16ms timer and flush atomically;
partial-text is the one streaming path that skips it, so each token-ish chunk
triggers the full downstream recompute. Routing it through the buffer means
N chunks within a frame collapse into one state update. The existing
streaming-message shape (`streaming: true`, append-to-last-streaming) is
preserved inside the buffer flush so visible behavior is unchanged. `flushDeltaBuffer`
/ `cleanupDeltaTimer` already guarantee no text is dropped on turn end.

**Care**: the existing guard "if a queued delta batch exists, let delta win"
(line 368) and the full-replay drop of pending deltas (lines 343-350) must keep
working; partial-text now lives in the same buffer so the precedence is natural.

### D3: Incremental `groupActivities` effects

**Decision**: The two effects in `ChatInstance.tsx` (lines 313-325 and 327-361)
update only the last group per agent (and the just-closed previous group),
rather than scanning every group on each `groups`/`expertActivities` change.

**Rationale**: Activity only ever changes for the currently-running group(s).
The map already builds `lastGroupIds` per agent; we use it to touch just those
entries. Completed groups never change activity, so re-scanning them is wasted.

### D4: Gate background instance git polling on `isActive`

**Decision**: Pass `isActive` (already known to `ChatInstance`) into
`useMultiRepoGitStatus` and suspend fetching/polling when `false`; on the
transition to `true`, fire one immediate refresh.

**Rationale**: `ChatPane` keeps up to 4 instances mounted (visibility-hidden).
Today each polls git independently, so a switch can fan out 4× git/worktree
requests and keep background instances doing periodic work. Only the visible
instance needs live git state. This is the cheapest large win for switching.

**Behavior preserved**: when an instance becomes active it refreshes
immediately, so the change-count badge is never stale to the user.

### D5: Single shared `useWorkspaceChats`

**Decision**: Back `useWorkspaceChats` with one shared provider that owns a
single fetch + single set of WS subscriptions (`chat:status-changed`,
`chat:activity`, `chat:title-updated`) and the `teemai:chat-*` / visibility
listeners. The hook keeps its exact return shape (`chats/loading/refresh/
awaitingReview/running/done`) so all 16 call sites are untouched.

**Rationale**: Today each of the 16 consumers fetches `/chats` and runs its own
`setChats` reducer on every `chat:activity`. With agents active, one event
re-runs N reducers and re-renders N subtrees; one `teemai:chat-created` fires N
refetches. Centralizing makes it O(1) per event and per creation. This is the
primary fix for new-Mission jank and for global activity-driven churn.

**Scoping note**: the hook is parameterized by `workspaceId`. The provider holds
a small map keyed by `workspaceId` (or scopes to the active workspace) so two
different workspace ids do not collide; consumers read their slice. Selectors
(`awaitingReview/running/done`) stay memoized as today.

### D6: Mission-switch replay stays incremental

**Decision**: Verify/keep `applyAgentReplay` producing an ordered per-slot list
via merge (it already does), and rely on D1 so the merged view does not re-sort
the entire history on switch. No new full sort is introduced anywhere on the
switch path.

**Rationale**: With D1 in place, replay populates each sorted slot and the
merged view is a linear merge — switch cost becomes proportional to what is
merged for the visible window rather than `n log n` over everything.

## Impact Scope

| File | Change | Risk |
|------|--------|------|
| `web/hooks/useAgentMessages.ts` | `mergedMessages`: full sort → k-way merge (D1) | Medium — core ordering; guarded by dev assertion |
| `web/hooks/useExpertEvents.ts` | `handleExpertPartialText` → `pushDelta` (D2) | Medium — streaming path |
| `web/components/chat/ChatInstance.tsx` | groupActivities effects incremental (D3); pass `isActive` to git hook (D4) | Low–Medium |
| `web/hooks/useMultiRepoGitStatus.ts` | accept `enabled/isActive`; suspend + refresh-on-activate (D4) | Low |
| `web/hooks/useWorkspaceChats.ts` | back with shared provider; same return shape (D5) | Medium — 16 consumers, but API unchanged |
| `web/components/.../*Provider` (new, small) | shared chats store provider mounted high in the tree (D5) | Low — additive |

No backend changes. No schema changes. No new dependencies.

## High-Risk Area Checklist (CLAUDE.md Rule 3)

- [ ] Message ordering identical to pre-change (dev assertion green over a soak)
- [ ] Dedup unchanged — same `groupMessages` output for the same input
- [ ] Streaming: partial-text still renders incrementally, no lost trailing text
- [ ] Session recovery / replay on entering a historical Mission unchanged
- [ ] Git change-count badge correct after switching back to a cached instance
- [ ] Single/split/quad layout switches do not unmount message state
- [ ] Status dots (running/waiting/done) unchanged across chat rows and members

## Alternatives Considered

- **Persist messages to SQLite to avoid recompute** — rejected, violates the
  project's JSONL-as-source-of-truth principle.
- **Lower `MAX_CACHED` to 1–2** — deferred; D4 removes most of the background
  cost without giving up warm-switch instant paint.
- **Replace react-virtuoso** — rejected; virtualization is already correct and
  not the bottleneck.
- **Heap-based merge** — unnecessary at small `k`; a cursor min-scan is simpler
  and allocation-light.
