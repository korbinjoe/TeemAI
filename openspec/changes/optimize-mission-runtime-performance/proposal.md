# Proposal: Optimize Mission Runtime Performance

## Why

The desktop app shows noticeable jank in four hot interactions: switching
between Missions, viewing the message area (especially while an agent streams),
and creating a new Mission. A read-only diagnostic traced the lag to a small
set of structural hotspots in the frontend render/state pipeline — not to the
JSONL parsing, list virtualization, xterm lifecycle, or server-side chat
creation, which were each examined and ruled out.

The dominant cost is that the aggregate Mission message view is rebuilt from
scratch on every message mutation: `mergedMessages` flattens and re-sorts the
**entire** Mission history on each change (`O(n log n)` per streamed chunk),
which then forces `groups` and two `groupActivities` effects to recompute over
all groups. Streaming amplifies this because partial-text events bypass the
16ms delta buffer and call `setState` per chunk. Switching Missions adds a full
replay re-sort plus the cost of up to four concurrently-mounted `ChatInstance`s
(each running WebSocket listeners and git polling even when hidden). New-Mission
creation additionally fans out into 16 independent `useWorkspaceChats` refetches.

For a product whose core principle is attention-first and whose core metric is
task success rate, interaction jank during the most frequent operations
directly erodes the experience.

## What Changes

- **Incremental merged-message ordering**: replace the full flatten + `sort()`
  in `useAgentMessages.mergedMessages` with an incremental k-way merge that
  maintains per-agent sorted invariants, so appends are near-`O(k)` instead of
  `O(n log n)` over total history.
- **Buffered partial-text streaming**: route `handleExpertPartialText` through
  the existing 16ms delta buffer (`pushDelta`) so streaming no longer triggers
  one full recompute per chunk.
- **Incremental groupActivities updates**: the two effects in `ChatInstance`
  that map over all groups on every change update only the changed/last group
  per agent.
- **Background instance gating**: hidden (non-active) cached `ChatInstance`s
  must not run git status polling; gate `useMultiRepoGitStatus` on `isActive`.
- **Shared workspace-chats subscription**: collapse the 16 independent
  `useWorkspaceChats` fetch + WS subscriptions into a single shared source so a
  `chat:activity` event updates one reducer, and `teemai:chat-created` triggers
  one refresh.
- **Mission-switch replay without full re-sort**: ensure `applyAgentReplay`
  + merged view do not re-sort the whole per-agent history on each switch.

Out of scope: no changes to JSONL-as-source-of-truth, no message persistence to
SQLite, no xterm lifecycle changes, no new state-management library.

## Affected Scenarios

| # | Lag scenario | Root cause | Primary code location |
|---|--------------|-----------|-----------------------|
| 1 | Message area viewing / streaming | Full `O(n log n)` re-sort + groups recompute per message; unbuffered partial-text | `web/hooks/useAgentMessages.ts:61-66`, `web/components/chat/ChatInstance.tsx:281,313-361`, `web/hooks/useExpertEvents.ts:363-394` |
| 2 | Mission / Chat switching | Full replay re-sort + merged re-sort + 4 concurrent mounted instances + ungated git polling | `web/hooks/useExpertEvents.ts:81`, `web/components/workspace/ChatPane.tsx:9,94-114`, `web/components/chat/ChatInstance.tsx:262` |
| 3 | xterm terminal lifecycle | **No defect found** — instances reused via `terminalsRef` Map, disposed only on experts-change/unmount, prewarmed; rendered only in terminal view | `web/components/terminal/useTerminalInstances.ts` (ruled out) |
| 4 | New Mission initialization | Server `createChat` is DB-only (lightweight); cost is 16 duplicate `useWorkspaceChats` refetches + new instance bootstrap | `server/services/chat/ChatService.ts:32-105` (ruled out), `web/hooks/useWorkspaceChats.ts:30-143`, `web/components/chat/modals/NewChatForm.tsx:182` |

## Goals

1. Eliminate the per-chunk full re-sort during streaming (scenario 1).
2. Make Mission switching cost proportional to the visible window, not total
   Mission history (scenario 2).
3. Stop background (hidden) ChatInstances from issuing git/network work
   (scenario 2).
4. Collapse duplicate workspace-chats fetching/subscription into one source
   (scenarios 2 & 4).
5. Keep behavior identical — same messages, same ordering, same status dots,
   same dedup guarantees.

## Quantified Targets

Measured on a representative long Mission (≥ 500 total messages, 3 active
agents) on the reference dev machine. Numbers are targets to validate, not
guarantees; baseline is captured in Task 0 before any change.

| Metric | Baseline (to capture) | Target |
|--------|----------------------|--------|
| `mergedMessages` recompute time per streamed chunk | ~`O(n log n)` full sort | ≤ 1ms (amortized, append fast-path) |
| Mission switch time-to-first-paint (warm cache) | capture | ≤ 50% of baseline |
| Mission switch time-to-first-paint (cold) | capture | ≤ 70% of baseline |
| Dropped frames during 10s of active streaming | capture | ≥ 50% reduction |
| Concurrent git/`worktree` requests fired on switch | up to 4 | 1 (active instance only) |
| `/api/workspaces/:id/chats` fetches per `teemai:chat-created` | up to 16 | 1 |

## Non-Goals

- Reducing `MAX_CACHED` below the current 4 unless profiling shows it is the
  dominant cost after the above fixes (kept as a deferred toggle).
- Virtualization changes — the list is already virtualized via `react-virtuoso`
  and is not a bottleneck.
- Server-side message storage, JSONL parsing rewrites, or `SessionFileWatcher`
  debounce tuning (the unbounded in-memory `allLines`/`messages` growth is noted
  as a separate concern, explicitly deferred).
- xterm/PTY changes (CLAUDE.md Rule 4 high-bug-density area; no defect found).
- Any change to the message dedup semantics in `groupMessages` /
  `messageDedup`.

## Risks

| Risk | Mitigation |
|------|------------|
| Incremental merge introduces ordering/dedup regressions vs. full sort | Keep a dev-only assertion comparing incremental result to a full-sort reference behind a flag during rollout; preserve existing `buildContentKey`/`buildMessageInstanceKey` dedup unchanged |
| Buffering partial-text changes perceived streaming smoothness | 16ms window already used for deltas; flush on turn end via existing `cleanupDeltaTimer` so no text is lost |
| Gating git polling on `isActive` could leave a stale change count when switching back | Trigger an immediate refresh on becoming active; the active instance always polls |
| Shared `useWorkspaceChats` is consumed by 16 call sites — refactor blast radius | Preserve the existing hook's return shape; back it with a shared provider so call sites are unchanged; land behind incremental file edits with type-check between steps |
| Mission-switch replay change touches the message-merge core | Covered by the same incremental-merge invariants and dev assertion; switch is exercised in manual verification across single/split/quad layouts |
