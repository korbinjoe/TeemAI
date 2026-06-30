# Tasks: Optimize Mission Runtime Performance

Ordered so each step is independently verifiable and the highest-impact,
lowest-risk wins land first. Type-check (`tsc`) must pass after every code task.

## 0. Baseline & guardrails

- [ ] 0.1 Capture baseline metrics on a long Mission (≥500 msgs, 3 agents):
      `mergedMessages` recompute time per chunk, Mission-switch first-paint
      (warm + cold), dropped frames over 10s streaming, concurrent git requests
      on switch, `/chats` fetches per `teemai:chat-created`. Record in a scratch
      note for before/after comparison. (Manual profiling — run in app.)
- [x] 0.2 Add a dev-only invariant flag (e.g. `import.meta.env.DEV`) used by the
      incremental-merge assertion in Task 1; no behavior change in production.

## 1. Incremental merged-message ordering (Scenario 1 core)

- [x] 1.1 In `web/hooks/useAgentMessages.ts`, replace the flatten + `Array.sort`
      in `mergedMessages` (lines 61-66) with a k-way merge across
      `Object.values(agentMessages)`, exploiting each slot's existing ascending
      timestamp order.
- [x] 1.2 Single-slot fast path: return the slot directly (no copy/sort) when
      only one agent slot exists.
- [x] 1.3 Preserve stable tie-break for equal timestamps (slot/insertion order)
      so `groupMessages` dedup output is byte-identical.
- [x] 1.4 Behind the dev flag, assert the merged id-sequence deep-equals
      `[...all].sort((a,b)=>a.timestamp-b.timestamp)`; log + no-throw in prod.
- [ ] 1.5 Verify: long-Mission append no longer triggers a full sort (measure vs
      0.1); ordering, grouping, and dedup unchanged. (Runtime measurement —
      dev assertion in place; needs in-app soak.)

## 2. Buffered partial-text streaming (Scenario 1 amplifier)

- [x] 2.1 In `web/hooks/useExpertEvents.ts`, change `handleExpertPartialText`
      (lines 363-394) to append into a per-agent partial-text buffer flushed on
      the same 16ms cadence instead of calling `setAgentMessages` directly,
      preserving the `streaming: true` append-to-last-streaming shape inside the
      flush. (Dedicated `partialTextBuffers` accumulator mirrors the delta-buffer
      pattern; `pushDelta` dedups rather than concatenates, so a sibling buffer
      is the faithful realization of D2.)
- [x] 2.2 Keep the existing precedence: pending delta wins over partial-text
      (`handleExpertPartialText` bails when a delta batch is queued; `pushDelta`
      deletes the partial buffer); full replay drops pending buffered entries.
- [ ] 2.3 Verify: multiple chunks within 16ms collapse into one update; no
      trailing text lost when the turn ends (`cleanupDeltaTimer` flush).
      (Runtime measurement — needs in-app streaming soak.)

## 3. Incremental groupActivities effects

- [x] 3.1 In `web/components/chat/ChatInstance.tsx`, rework the effect at lines
      327-361 to update only the last group per agent (plus the last no-agent
      group) instead of scanning every group.
- [x] 3.2 Keep the previous-group "mark completed" effect (lines 313-325) but
      ensure it only touches the just-closed group. (Unchanged — already touches
      only the just-closed `prevId`.)
- [ ] 3.3 Verify: activity dots/labels update correctly for the running group;
      completed groups are not rewritten. (Runtime — needs in-app check.)

## 4. Gate background instance git polling (Scenario 2 main win)

- [x] 4.1 Add an `enabled`/`isActive` input to
      `web/hooks/useMultiRepoGitStatus.ts`; suspend initial fetch and any
      polling when not active.
- [x] 4.2 On transition `false → true`, fire one immediate refresh so the
      change-count badge is never stale. (On re-activate `subscribedPaths` is
      empty, so all targetPaths re-subscribe + `fetchInitialSnapshots` runs.)
- [x] 4.3 In `ChatInstance.tsx`, pass the existing `isActive` into
      `useMultiRepoGitStatus` (call site ~line 262).
- [x] 4.4 Verify: switching among up to 4 cached instances fires git/worktree
      requests only for the active one; returning to a cached instance refreshes
      once and shows correct counts. (Runtime benchmark: git subscribe/unsubscribe
      count matched active switches only.)

## 5. Shared workspace-chats subscription (Scenarios 2 & 4)

- [x] 5.1 Introduce a small shared provider that owns one fetch + one set of WS
      subscriptions (`chat:status-changed`, `chat:activity`,
      `chat:title-updated`) and the `teemai:chat-*` / visibility listeners,
      scoped per `workspaceId` (refcounted registration).
- [x] 5.2 Re-back `web/hooks/useWorkspaceChats.ts` with the shared store while
      keeping its exact return shape (`chats/loading/refresh/awaitingReview/
      running/done`) and memoized selectors.
- [x] 5.3 Mount the provider high enough to cover all consumers (`App.tsx`,
      wrapping `<Routes>`); no consumer call site needed edits.
- [ ] 5.4 Verify: one `chat:activity` updates one shared store; one
      `teemai:chat-created` triggers exactly one `/chats` refresh for the
      workspace (measure vs 0.1). (Runtime — needs in-app check.)

## 6. Mission-switch replay (Scenario 2 completeness)

- [x] 6.1 Confirm `applyAgentReplay` (`useExpertEvents.ts:93`) still produces an
      ordered per-slot list via merge; with Task 1 in place, no full re-sort of
      total history occurs on switch. (Its `result.sort` at line 121 is bounded
      by a single agent's slot, not total Mission history; the aggregate view
      uses T1's k-way merge.)
- [ ] 6.2 Verify: switching into a long historical Mission shows identical
      messages/order; first-paint time meets the warm/cold targets.
      (Runtime — needs in-app check.)

## 7. Regression verification (CLAUDE.md Rule 3)

- [ ] 7.1 Run dev server; exercise streaming, switching (single/split/quad),
      new-Mission creation; screenshot key states. (Manual — run in app.)
- [ ] 7.2 Confirm high-risk checklist from design.md is all green. (Manual —
      pending in-app soak.)
- [ ] 7.3 Remove the dev-only invariant assertion (Task 1.4 / 0.2) after soak,
      or gate it permanently behind DEV with zero prod cost. (Currently gated
      behind `import.meta.env.DEV` — zero prod cost; remove after soak.)
- [x] 7.4 Produce the Impact Verification block (files changed, affected
      features, high-risk checklist) per CLAUDE.md Rule 3.

## 8. Validate

- [x] 8.1 `openspec validate optimize-mission-runtime-performance --strict`
      passes.
