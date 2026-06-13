# Code Review — Naming Remediation PR-A (WS-8 + WS-3c)

**Reviewer**: Code Reviewer 🦅
**Date**: 2026-06-13
**Scope reviewed**: the *landed* safe batch only —
- `c40c5fe` WS-8: delete deprecated `AgentMessage` mailbox types
- `5f79a41` WS-3c: fold `cwdToQoderProjectKey` → `cwdToCliProjectKey`

Companion plan: `docs/architecture-naming-remediation-plan-2026-06-13.md`.
The breaking wave (WS-1/2/7: Mission/Agent rename, DB migration, WS-protocol
rename, `EXPERT_API_BASE`) is **not in this diff** — still blocked by
open_question `3kwQrzPR7-FD`. This review does **not** cover it.

---

## Review Summary

> Both commits are clean, behavior-preserving internal renames. All call sites
> are synchronized, no residual old names in live code, no DB/WS/JSONL contract
> touched, and the relevant tests pass (20/20). The only issues found are
> **out-of-scope working-tree changes** unrelated to the rename that currently
> break `tsc`. No blocking issues attributable to the rename itself.

---

## Checklist Results (against task brief)

| # | Check | Result |
|---|-------|--------|
| 1 | Cross-layer references synced, no residual old names | ✅ Pass |
| 2 | DB migration / WS protocol backward compatible | ✅ N/A — neither commit touches DB or WS protocol |
| 3 | JSONL single-source-of-truth respected, no `messages` table added | ✅ Pass |
| 4 | tsc / build passes | ⚠️ Fails — but solely due to an out-of-scope untracked file (see P1-1) |
| 5 | No out-of-plan changes | ⚠️ Working tree contains unrelated changes (see P1-1) |

---

## Issues Found

### [P0] Must Fix
*None attributable to the rename commits.*

### [P1] Out-of-Scope / Needs Separation
1. **[Scope leak — breaks build]** The working tree carries three files that are
   **not** part of the rename and belong to a separate "finaltext race" effort:
   - `web/hooks/useExpertEvents.ts` (modified)
   - `web/__tests__/hooks/useExpertEvents.test.ts` (modified)
   - `web/__tests__/hooks/finaltext.race.test.ts` (untracked, new)

   `npx tsc --noEmit` currently fails with exactly one error, from the new file:
   ```
   web/__tests__/hooks/finaltext.race.test.ts(3,42):
     error TS6133: 'ExpertEventContext' is declared but its value is never read.
   ```
   This is an unused-import lint-level error in the new test, **not** caused by
   WS-8/WS-3c. Recommendation: land the rename batch separately (it is already
   committed and green), and fix the unused `ExpertEventContext` import before
   the finaltext-race work is committed. Do not let this block or contaminate
   the rename PR.

### [P2] Nice to Have
1. **[Dead export left behind]** `createAgentMessage` in
   `shared/agent-message-types.ts` now has **zero importers** in `server/**`
   (grep confirms none). WS-8 deliberately scoped to the mailbox helpers, so
   this is not a regression, but `createAgentMessage` + the remaining
   `AgentMessage` union may now be entirely dead. Worth a follow-up grep across
   `cli/` and `ai-assets/` to decide whether the whole module can go. Out of
   scope for this PR — flag only.
2. **[Doc drift]** `cwdToQoderProjectKey` / `cwdToClaudeProjectKey` still appear
   in openspec design docs (`add-qoder-provider/{design,tasks,proposal}.md`,
   `external-session-adoption/*`). These are historical design records, not live
   code, so no action is required — but if those changes are ever re-opened,
   their tasks reference functions that no longer exist.

---

## Verification Performed

- **No residual old names in source**: grep for `cwdToQoderProjectKey`,
  `cwdToClaudeProjectKey`, `mailboxFileName`, `parseMailboxFileName`,
  `deserializeMailboxLine`, `serializeLogfmt`, `ProgressReport` → matches only in
  `docs/` and `openspec/` markdown; **zero `.ts` source references**.
- **Deleted union members not switched on anywhere**: grep for `task:progress`,
  `task:accepted`, `task:milestone`, `task:idle`, `task:delegated`, `'query'`,
  `'response'` in live `.ts` → only hit is a `content: 'response'` string literal
  in `ActivityDeriver.test.ts` (unrelated field value), not the deleted type.
- **All `cwdToCliProjectKey` call sites updated** (12 files: `SessionDiscovery`,
  `ExpertResumeHandler`, `ExpertExitHandler`, `ExpertDirectInput`,
  `DevInspector`, `SessionPager`, `sessionFilePurger`, `expertRoutes`,
  `chatRoutes`, `PTYSessionManager`, + 2 tests). Inline `~/.qoder` lambda in
  `SessionDiscovery.ts:47` correctly repointed.
- **Behavior preserved**: WS-3c is a byte-identical fold (`cwd.replace(/[/.]/g,'-')`);
  the test suite explicitly froze the old Claude/Qoder equivalence cases and they
  still pass.
- **No DB / WS / JSONL contract change**: neither commit adds a migration, alters
  `shared/ws*`, or introduces a messages table. JSONL source-of-truth principle
  intact. The deleted `deserializeMailboxLine` was the *only* reader of mailbox
  JSONL files; with it gone and no callers, stale on-disk mailbox files are simply
  ignored (no crash path) — acceptable since the mailbox era is retired.
- **Tests**: `npx vitest run shared/__tests__/projectKey.test.ts
  server/__tests__/sessionFilePurger.test.ts` → **20 passed**.
- **tsc**: only the out-of-scope error in P1-1; the two rename commits are clean
  at their HEAD.

---

## Verdict

**The rename commits (WS-8 + WS-3c) are approved** — correct, complete, and
behavior-preserving. The single build failure and the extra modified/untracked
files are **separate work that must not ride along** with this rename; resolve
P1-1 by isolating those changes before committing the finaltext-race fix.
