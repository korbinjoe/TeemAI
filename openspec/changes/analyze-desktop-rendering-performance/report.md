# Desktop Frontend Rendering Performance Report

Date: 2026-06-26
Scope: Electron desktop renderer (`web/`, Electron shell, mission workspace)
Change type: analysis + benchmark harness; no shipped product runtime changes.

## Executive Summary

The previous A-grade mission-switch score is not representative of real
multi-mission running workload. It only measures the early idle/warm-cache path:
cached SPA switches hit 100% cache and replay 0 messages, but the trace
finalizes at `interactive` / `ide-ready` and misses post-switch WebSocket
fanout, git subscription churn, long tasks, and frame gaps.

A new running-load benchmark (`perf:mission-switch:running`) reproduced the
gap: the same run reported a perfect mission-switch score while the renderer
still produced >50ms long tasks and a 66ms max frame gap during 16 mission
switches under synthetic multi-mission activity. The practical conclusion is
that mission switching has two separate performance surfaces: idle cached
navigation is healthy; switching while multiple missions are running still has
main-thread responsiveness risk.

Key measured results:

| Area | Result |
|------|--------|
| Warm idle mission switch | Score 94/100, grade A; avg interactive 117ms; p95 total 180ms; replay 0; cache hit 100% |
| Running mission switch stress | Early score 100/100, grade A; 7,372 synthetic WS events; 16 switches; 10 long tasks >50ms; max long task 63ms; max frame gap 66ms |
| Existing baseline | Score 99/100; avg interactive 61ms; p95 total 211ms; replay 0 |
| Cold/full reload + warm pass | Score 77/100, grade B; cold replay 124-646 msgs; p95 total 473ms |
| Initial dev renderer load | DCL 237ms, load 239ms, responseEnd 93ms |
| Runtime after switches | CDP nodes 5,097; JS heap used 73.8MB / total 135.5MB |
| Long tasks | 3 long tasks during switches: 64ms, 66ms, 68ms |
| Local git query cost | 5-sample avg 172ms, min 160ms, max 190ms |
| Focused tests | 4 files passed, 39 tests passed |

## What Is Already Working

The previous mission-runtime optimization work is present in the current code:

- Route-level lazy loading is used for workspace/resource/mobile pages
  (`web/App.tsx:7`, `web/App.tsx:44`).
- `ChatPane` keeps a mounted LRU of mission panes and workspace metadata cache,
  which is why warm switches avoid JSONL replay (`web/components/workspace/ChatPane.tsx:10`,
  `web/components/workspace/ChatPane.tsx:31`,
  `web/components/workspace/ChatPane.tsx:82`).
- Message state is per-agent, snapshotted, and merged with a stable k-way merge
  instead of a full aggregate sort (`web/hooks/useAgentMessages.ts:36`,
  `web/hooks/useAgentMessages.ts:73`,
  `web/hooks/useAgentMessages.ts:152`).
- WebSocket delta and partial-text events are coalesced on a 16ms cadence
  (`web/hooks/useAgentEvents.ts:142`, `web/hooks/useAgentEvents.ts:148`,
  `web/hooks/useAgentEvents.ts:460`).
- `ChatInstance` updates group activity only for current target groups, not the
  full history (`web/components/chat/ChatInstance.tsx:419`).
- Background git status work is gated by `gitStatusLive`, which is delayed and
  disabled when inactive (`web/components/chat/ChatInstance.tsx:217`,
  `web/components/chat/ChatInstance.tsx:322`,
  `web/hooks/useMultiRepoGitStatus.ts:25`,
  `web/hooks/useMultiRepoGitStatus.ts:199`).
- Workspace mission lists use one shared provider instead of independent fetch
  subscriptions per consumer (`web/hooks/useWorkspaceMissions.ts:61`,
  `web/hooks/useWorkspaceMissions.ts:124`,
  `web/App.tsx:47`).
- xterm setup waits for font/renderability, buffers pending output, caps pending
  chars at 2MB, uses `ResizeObserver`, and upgrades WebGL during idle
  (`web/components/terminal/TerminalInstance.ts:35`,
  `web/components/terminal/TerminalInstance.ts:109`,
  `web/components/terminal/TerminalInstance.ts:202`,
  `web/components/terminal/TerminalInstance.ts:343`).

## Findings

### 1. Current Mission Switch Score Is Idle/Warm-Cache Only

Running-load benchmark:

```text
command: npm run -s perf:mission-switch:running
missions: LrZW4TTp, gFI2uzI4, Es0GX2PG, cIJ6XNzV
agents: lead, 7eacaf83, social-operator
synthetic WS events: 7,372
switches: 16
early score: 100/100, grade A
avgInteractiveMs: 40
p95TotalMs: 122
replayMsgs: 0
longTaskCount: 12
longTaskOver50: 10
longTaskMaxMs: 63
frameGapP95Ms: 16.7
frameGapMaxMs: 66
git subscribe/unsubscribe sends: 32 / 32
heap: 141.1MB used / 256.5MB total
```

This is the clearest result from the audit. The score says "perfect" because
the existing `missionSwitchPerf` trace finalizes around the early UI-ready
marks. The same run still shows main-thread stalls and frame gaps after the
switch while cached `ChatInstance`s, workspace mission state, activity rows,
partial text, structured message deltas, and git subscriptions continue to
process running mission events.

Impact scope: this does not mean warm cached navigation is broken. It means the
current score is not a valid proxy for perceived responsiveness when several
missions are running and the user switches between them.

Recommendation: split mission-switch scoring into two required modes:

- Idle/warm-cache score: keep current trace for cache/replay regression.
- Running-load score: include long-task count, max/p95 frame gap, synthetic or
  real WS event volume, git subscribe/unsubscribe churn, heap, and DOM size.

### 2. Warm Idle Mission Switching Is Healthy, But Interactive Regressed vs Baseline

Warm benchmark:

```text
samples=8
avgInteractiveMs=117
p95InteractiveMs=129
avgResumeMs=66
avgTotalMs=168
p95TotalMs=180
avgReplayMsgs=0
cachedHitRate=100
score=94/100
```

This is still an A-grade idle/warm-cache result. However, it must not be used
as the overall desktop renderer score. The checked-in baseline records
avgInteractiveMs 61ms and score 99/100. The regression is not caused by replay:
warm replay stayed at 0 messages. Runtime trace shows `instance-active` around
47-81ms and `interactive` around 107-139ms, with 64-68ms long tasks during
switching.

Likely contributors:

- React dev `StrictMode` is enabled at the root (`web/main.tsx:29`), so dev
  benchmark marks can double-run effects. This affects dev profiling more than
  packaged desktop behavior, but it also affects the current baseline method.
- Hidden cached panes remain mounted and register WebSocket handlers. Many
  handlers are gated by `isActive`, but status/context work still exists for
  cached instances (`web/hooks/useChatWebSocket.ts:385`,
  `web/hooks/useChatWebSocket.ts:418`).
- `WorkspaceChatsProvider` has one shared context value containing all slices;
  every slice mutation changes the provider value and can wake all consumers
  (`web/hooks/useWorkspaceMissions.ts:224`,
  `web/hooks/useWorkspaceMissions.ts:241`).

Recommendation: rerun the mission-switch benchmark against a production/preview
renderer and add a Chrome trace profile around the 64-68ms long tasks. Target:
avg interactive under 80ms in dev and under 60ms in packaged renderer.

### 3. Cold/Full Reload Restore Is The Dominant Remaining Bottleneck

Cold/full reload benchmark with the same four missions:

```text
cold replayMsgs: 124, 646, 245, 128
cold totalMs: 417-473
warm-after-cold replayMsgs: 0
warm-after-cold totalMs: 173-180
score=77/100
```

Replay processing itself is cheap (`0.0-0.1ms` in the browser), so the cost is
not the k-way merge or React message processing. The slow path is context setup
and server/session replay round-trip: first-load `resumeMs` was ~319-329ms.
The skip-replay guard requires a warm mounted instance or a safe hydrated
snapshot before it can send `{ skipReplay: true }`
(`web/hooks/useChatWebSocket.ts:37`,
`web/hooks/useChatWebSocket.ts:203`,
`web/hooks/useChatWebSocket.ts:216`).

Recommendation: add a cold-safe message snapshot layer. The lowest-risk version
is an IndexedDB/sessionStorage snapshot keyed by `chatId + expertSessionIds +
lastKnownStatus`, used only when `isSnapshotReplaySafeChat()` is true. Longer
term, expose a compact server-side mission message snapshot so the renderer can
hydrate without replaying JSONL on every full reload.

### 4. Bundle Weight Is Acceptable For Desktop But Still Shapes First Paint

Production build passed, but Vite reports chunks over 500KB:

| Chunk | Size | Gzip |
|-------|------|------|
| `monaco-*.js` | 2,526KB | 648KB |
| `index-*.js` | 752KB | 241KB |
| `TerminalInstance-*.js` | 518KB | 139KB |
| `WorkspaceLayout-*.js` | 394KB | 107KB |
| `WhiteboardSidebar-*.js` | 211KB | 66KB |
| `index-*.css` | 109KB | 19KB |
| `monaco-*.css` | 74KB | 12KB |

Monaco is already isolated. The next bundle target is terminal code: in dev,
`TerminalPanel.tsx` is fetched on initial message-view load even when there are
no xterms mounted. Verify production request timing, then lazy-load terminal
surface only when `viewMode === 'terminal'`, prewarm is enabled, or keepalive is
active.

Recommendation: terminal code should not be requested for a normal message-view
mission. Acceptance: production initial message-view load has no terminal/xterm
chunk request until terminal mode is entered.

### 5. Git Status Is Gated, But Runtime Logs Show Subscription Churn

The local git benchmark averaged 172ms for `git status --porcelain` plus
`git diff HEAD --numstat`. The current active gating is therefore important.
`ChatInstance` delays enabling git status by 450ms and passes `enabled` into
`useMultiRepoGitStatus` (`web/components/chat/ChatInstance.tsx:217`,
`web/components/chat/ChatInstance.tsx:322`), and the hook preserves stale status
without live subscriptions while disabled (`web/hooks/useMultiRepoGitStatus.ts:199`).

However, the profiling dev-server log showed repeated `git:subscribe` /
`git:unsubscribe` cycles during mission switching, including same-path
subscribe-then-unsubscribe sequences, and slow worktree endpoints:

```text
/api/worktree/diff   1223ms
/api/worktree/status 1778ms
```

This does not currently block the measured warm interactive mark because git is
delayed, but it can still steal CPU/IO immediately after switching and can
produce visible jank on busy repos.

Recommendation: keep the active gating, but add a perf assertion or debug
counter that one mission switch among cached panes results in at most one active
`git:subscribe` set and one initial snapshot fetch per repo. Also stabilize the
hook dependencies around `targetPaths` and ensure delayed `gitStatusLive`
timers cannot fire for instances that became inactive before the delay elapsed.

### 6. Cached ChatInstances Trade Latency For Memory/Fanout

`ChatPane` caches up to 8 full `ChatInstance`s (`web/components/workspace/ChatPane.tsx:10`).
This is why warm switch replay is 0, but it means inactive instances stay mounted.
Runtime after switching through four missions showed about 5,097 CDP nodes and
73.8MB JS heap used; this is acceptable for four missions, but the worst case
at eight cached missions plus terminal/IDE surfaces should be measured.

Recommendation: use a two-tier cache:

- Keep active + recent 3 missions fully mounted.
- Demote older missions to message snapshots only.
- Restore demoted missions from snapshot first, then refresh in the background.

This preserves attention-first warm switching while bounding DOM, hooks, WS
listeners, and heap.

### 7. Workspace Mission Store Is Shared, But Not Selector-Scoped

The shared provider removes duplicate fetch/subscription work, which is a major
improvement. But it still pushes a single context value containing all slices,
so every mission-list consumer sees a new context value on any slice update.

Recommendation: move the provider internals behind `useSyncExternalStore` or a
small selector API keyed by workspace id. Keep the existing hook return shape,
but subscribe consumers only to the active workspace slice. This is lower
priority than cold replay, but it should reduce global render fanout during
live agent activity.

## Recommended Roadmap

1. **P0: Replace the single mission-switch score with two required modes.**
   Target: keep idle/warm-cache score for replay/cache regressions, and add
   running-load score with long-task count, max/p95 frame gap, WS event volume,
   git churn, DOM nodes, and heap.

2. **P0: Trace and reduce running-load long tasks.**
   Target: no >50ms long task and max frame gap under 50ms while switching
   across four running missions with three active agents each.

3. **P0: Cold-safe message snapshots.**
   Target: cold/full reload p95 total under 250ms for replay-safe missions;
   replayMsgs 0 on revisit.

4. **P1: Lazy-load terminal surface on demand.**
   Target: message-view initial load does not fetch terminal/xterm code.

5. **P1: Remove git subscription churn.**
   Target: one mission switch emits one unsubscribe for the old active repo and
   one subscribe for the new active repo, with no same-path churn.

6. **P1: Two-tier mission cache.**
   Target: keep warm switch replay 0 for recent missions while bounding mounted
   `ChatInstance`s to 4.

7. **P1: Selector-scoped workspace mission store.**
   Target: a `mission.activity` event only re-renders consumers of the owning
   workspace slice.

8. **P1: Instrument real multi-agent/multi-mission sessions.**
   Target: validate the synthetic benchmark against actual concurrent agent
   runs before treating the score as release-gating.

9. **P2: Bundle and payload cleanup.**
   Review font weights/subsets, notification payload size (~184KB in dev probe),
   and icon import strategy after P0/P1 fixes.

## Verification Run

Commands run:

```bash
npm run -s build:ui
npm run -s perf:sample:quick
npm run -s perf:mission-switch -- --rounds 2 --settle-ms 1200 --skip-baseline-check
npm run -s perf:mission-switch -- --rounds 1 --settle-ms 1400 --include-cold --skip-baseline-check
npm run -s perf:mission-switch:running
npm run -s test -- web/__tests__/hooks/useChatWebSocket.test.ts web/__tests__/terminal/TerminalInstance.test.ts web/__tests__/terminal/TerminalPanel.prewarm.test.tsx web/__tests__/workspace/ChatPane.test.tsx
```

Results:

- `build:ui`: passed; Vite chunk-size warning remains.
- `perf:sample:quick`: passed; local git query avg 172ms.
- warm mission switch: score 94/100, grade A.
- running-load mission switch: early score 100/100, but 10 long tasks >50ms
  and max frame gap 66ms; this invalidates the score as an overall UX metric.
- cold + warm mission switch: score 77/100, grade B.
- focused tests: 4 files passed, 39 tests passed.

Notes:

- The repo had unrelated pre-existing dirty files in chat/file-link areas before
  this analysis. They were not modified by this audit.
- The local dev server was started for profiling and left running only during
  the analysis.
