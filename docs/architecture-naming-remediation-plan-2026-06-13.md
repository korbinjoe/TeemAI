# Naming Remediation Plan (Actionable)

**Author**: Architect 🦅
**Date**: 2026-06-13
**Companion to**: `docs/architecture-naming-review-2026-06-13.md` (findings), `prd/terminology.md` (approved unit-of-work vocabulary)
**Mode**: Plan only. No code changed. Downstream implementor = fullstack-engineer.

---

## 0. How to read this plan

- Each **Workstream (WS-n)** = one concept rename. Independently reviewable.
- Every rename is tagged:
  - 🟢 **SAFE** — pure internal identifier; TypeScript catches every call site; no data/protocol/contract crosses a process boundary. Ship freely.
  - 🔴 **BREAKING** — touches persisted data (SQLite, JSONL, config files) **or** an external wire/runtime contract (WS channel strings, injected env vars, HTTP route paths consumed by shell hooks/CLI/mobile). Requires a migration and/or a dual-name compatibility window.
- "Impact" columns use: **FE** (web), **BE** (server), **SH** (shared), **DB** (schema), **WS** (websocket protocol), **CFG** (config/env/hooks), **PR** (agent prompts/docs).

**Golden ordering rule** (applies within and across workstreams):
`shared/ types → server runtime → web → CLI/mobile → prompts/docs`, with **DB migrations isolated into their own PR**, and **breaking wire/env renames shipped behind a one-release alias** before the old name is deleted.

---

## 1. Workstream index & dependency order

| Order | Workstream | Risk | Depends on |
|---|---|---|---|
| WS-0 | Consolidate duplicated contracts into `shared/` (pre-req) | 🟢 | — |
| WS-1 | Unit of work → **Mission** (execute approved PRD) | 🔴 (DB+WS+routes) | WS-0 |
| WS-2 | Participant → **Agent / MissionAgent** (retire Expert + Member) | 🔴 (WS+env+DB) | WS-0, WS-1 |
| WS-3 | `CliProvider` axis split + `qoder/qodercli` collapse | 🔴 (DB+CFG) | WS-0 |
| WS-4 | De-dup `ChatActivityPayload` / `*ActivitySnapshot` | 🟢 | WS-0 |
| WS-5 | Product name reconciliation (TeemAI vs OpenTeam) | 🟢 (docs) | — |
| WS-6 | War-Room ⇄ Whiteboard unification | 🟢 (prompts/docs) | — |
| WS-7 | `chats` agent-column consolidation | 🔴 (DB) | WS-1, WS-2 |
| WS-8 | Delete deprecated `AgentMessage` mailbox variants | 🟢 | — |

**Recommendation**: bundle **WS-1 + WS-2 + WS-7** into one terminology wave (the "big cut") so the codebase converges on `Mission` + `Agent`/`MissionAgent` in a single epoch. WS-0, WS-4, WS-5, WS-6, WS-8 can ship independently and *before* the big cut to shrink it.

---

## WS-0 — Consolidate duplicated contracts (pre-requisite) 🟢

These types are declared in two/three places and have already drifted. Renames downstream are unsafe until there is a single source of truth.

| Old (duplicated) | Action → New (single home) |
|---|---|
| `ChatMember`, `ChatMemberStatus`, `ChatMemberRole` in **both** `server/config/types.ts:123-130` **and** `web/components/workspace/types.ts:21-27` | Move canonical definition to `shared/` (new `shared/mission-agent-types.ts` after WS-2, or `shared/chat-types.ts` now); both sides import. |
| `ChatActivityPayload` in `shared/ws/chat.ts`, `web/types/chat.ts:145`, `server/terminal/ActivityAggregator.ts` | Keep `shared/ws/chat.ts` as sole definition; FE/BE import (handled fully in WS-4). |

- **Impact**: SH, BE, FE. **Risk**: 🟢 (compile-checked).
- **Change points**: delete the web/server copies, replace with `import type` from shared, fix import paths.
- **Why first**: WS-1/WS-2 rename these symbols; doing it once in shared avoids 2–3× the edits and prevents re-drift.

---

## WS-1 — Unit of work → Mission 🔴

**This is the approved PRD `rename-task-to-mission`. Do not re-derive — execute `openspec/changes/rename-task-to-mission/tasks.md` (Phase A–D).** Summary of the mapping for cross-reference:

| Old | New | Layer | Risk |
|---|---|---|---|
| `Chat` / `Task` (user-facing concept) | `Mission` | SH/FE/BE | — |
| `ChatStatusChangedPayload` | `MissionStatusChangedPayload` | SH/WS | 🔴 wire |
| `ChatActivityPayload` | `MissionActivityPayload` | SH/WS | 🔴 wire |
| `ChatPermissionRequest/ResolvedPayload` | `MissionPermission…` | SH/WS | 🔴 wire |
| `TaskStatus`/`TaskSummary` (chat-level) | `MissionStatus`/`MissionSummary` | SH | 🟢 |
| `ChatService` | `MissionService` | BE | 🟢 |
| `chatRoutes.ts`, `/api/chat*`, `/task/*` routes | `missionRoutes.ts`, `/api/mission*`, `/mission/*` | BE/FE | 🔴 route alias |
| `useWorkspaceChats`, `useAllChats`, `TaskSessionList`, `web/components/task/` | `useWorkspaceMissions`, `useAllMissions`, `MissionList`, `web/components/mission/` | FE | 🟢 |
| Route param `taskId` | `missionId` | FE | 🔴 URL redirect |
| DB table `chats`, column `chat_id` | `missions`, `mission_id` | DB | 🔴 migration (WS-7) |
| WS channel namespace (none today; events are `expert:*`/`chat:*`) | `mission.*` for chat-level events | WS | 🔴 alias |

- **Keep unchanged** (PRD §"do NOT rename"): `cliSessionId`, `WorktreeSession`, PTY "session", `Workspace`, `Team`, `Skill`, `Schedule`.
- **Breaking pieces** (need alias window): WS chat-level payload event names; HTTP routes; URL params (`/task/:taskId` → `/mission/:missionId` with `<Navigate replace>`); DB `chats`→`missions` (WS-7).
- **Open amendment**: extend the PRD's Phase-1/2 tables to also cover WS-2 (Expert/Member) so the big cut is one epoch — see §"Open decision".

---

## WS-2 — Participant → Agent / MissionAgent (retire Expert + Member) 🔴

**Decision**: collapse the five participant names to **two**:
- **`Agent`** = the persona/definition (DB `agents` row, config). *Already correct — keep.*
- **`MissionAgent`** = the participation record + runtime actor ("this Agent in this Mission"). Absorbs `ChatMember`, `Member*`, and runtime `Expert*`.

### 2a. Internal type/file/symbol renames 🟢

| Old | New | Location |
|---|---|---|
| `ChatMember` / `ChatMemberStatus` / `ChatMemberRole` | `MissionAgent` / `MissionAgentStatus` / `MissionAgentRole` | shared (post WS-0) |
| `MemberAggregator` (class) | `MissionAgentAggregator` | `server/stores/MemberAggregator.ts` → `MissionAgentAggregator.ts` |
| `PHASE_TO_MEMBER_STATUS`, `phaseToMemberStatus`, `reconcileMembersFromActivity` | `PHASE_TO_AGENT_STATUS`, `phaseToAgentStatus`, `reconcileAgentsFromActivity` | `web/lib/memberStatus.ts` → `agentStatus.ts` |
| `memberStatusDot()` | `agentStatusDot()` | `web/components/workspace/MissionSessionRows.tsx` |
| `ExpertStartedPayload`, `ExpertDataPayload`, `ExpertExitPayload`, `ExpertActivityPayload`, `ExpertListItem`, `ExpertListPayload`, `ExpertErrorPayload`, `ExpertStartFailedPayload`, `ExpertVersionBlockedPayload`, `ExpertResumeFailedPayload`, `ExpertSlashCommandsPayload`, `ExpertPlanUpdatePayload`, `ExpertModeChangePayload`, `ExpertCommandsUpdatePayload`, `ExpertSessionInfoPayload` (16 types) | `Agent*Payload` equivalents | `shared/ws/expert.ts` → `shared/ws/agent.ts` |
| `ExpertListPayload.experts` field | `.agents` | `shared/ws/agent.ts` (🔴 wire — see 2c) |
| `ExpertActivitySnapshot` | `AgentActivitySnapshot` (merge w/ WS-4) | `web/types/chat.ts` |
| server files: `ExpertActivityHandler`, `ExpertAttacher`, `ExpertDirectInput`, `ExpertEventWiring`, `ExpertExitHandler`, `ExpertHandler`, `ExpertLifecycle`, `ExpertPendingTaskFlush`, `ExpertResumeHandler`, `ExpertSessionStore`, `ExpertTokenTracker` (11 files) | `Agent*` / `MissionAgent*` equivalents | `server/ws/` |
| web hooks/components: `useExpertActivities`, `useExpertEvents`, `ExpertProgressView` | `useAgentActivities`, `useAgentEvents`, `AgentProgressView` | `web/hooks/`, `web/components/chat/indicators/` |
| `createExpertRoutes` | `createAgentRoutes` | `server/routes/agent/expertRoutes.ts` → `agentRoutes.ts` |
| ExpertSessionStore semantics (`expert_sessions` accessor) | `MissionAgentSessionStore` | `server/ws/ExpertSessionStore.ts` |

- **Impact**: SH, BE, FE. **Risk**: 🟢 (TS-checked) for type/symbol/file renames.
- **Scope reference**: `Expert` appears in **70 files**; `Member` in ~18 files. All compile-checked once shared is the single source.

### 2b. HTTP route rename 🔴 (alias)

- `server/routes/agent/expertRoutes.ts` mount → `/api/agent*` (was `/api/expert*`). Keep old path as a forwarding alias for one release if mobile/CLI call it.
- **Impact**: BE, FE, mobile. **Risk**: 🔴 (external callers).

### 2c. WS channel rename `expert:*` → `agent:*` 🔴 (alias window)

~30 distinct channels (send + receive). Full list:

```
expert:direct-input  expert:input        expert:stop          expert:stop-all
expert:resize        expert:cli-attach    expert:cli-detach    expert:list
expert:clear-completed  expert:permission-response  expert:user-input
expert:start         expert:error
— server→client —
expert:structured-message  expert:activity  expert:started  expert:exit
expert:stopped  expert:data  expert:partial-text  expert:resume-failed
expert:list-updated  expert:already-running  expert:start-failed
expert:slash-commands  expert:plan-update  expert:mode-change
expert:commands-update  expert:session-info  expert:permission-request
```

- **Change points**: `shared/ws/index.ts` (`WsSendMessages` keys), `web/services/WebSocketEventMap.ts`, `server/ws/WSRouter.ts`, every emit/handler site (31 files).
- **Compat strategy**: server emits **both** `agent:*` and `expert:*` for one release; accepts both on receive. Web switches to `agent:*`. CLI client (`cli/commands/`, `web/services/WebSocketClient.ts`) updated. Drop `expert:*` next release.
- **Impact**: WS, FE, BE, CLI. **Risk**: 🔴 (wire protocol; version skew between desktop app and server).

### 2d. Runtime env var `EXPERT_API_BASE` → `AGENT_API_BASE` 🔴 (dual-name window)

- **Producer**: `server/runtime/ConfigCompiler.ts` (injects into agent process env).
- **Consumers** (shell, outside TS — TypeScript will NOT catch these): `ai-assets/hooks/wb-auto-extract.sh`, `wb-cursor-diff.sh`, `wb-post-tool-write.sh`, `ai-assets/skills/workflow/scripts/fallback-workflow.sh`, `_env.sh`, plus the whiteboard/handoff skill scripts under `~/.teemai/skills/`.
- **Compat strategy**: ConfigCompiler injects **both** `AGENT_API_BASE` and `EXPERT_API_BASE` for one release; update all `.sh` consumers to read the new name with `${AGENT_API_BASE:-$EXPERT_API_BASE}` fallback; drop old next release.
- **Impact**: CFG, BE, PR. **Risk**: 🔴 (cross-language contract, no compiler safety net — grep-verify every consumer).

### 2e. DB column `chats.expert_sessions` — handled in WS-7.

---

## WS-3 — `CliProvider` axis split + `qoder/qodercli` collapse 🔴

### 3a. Remove protocol from the vendor enum 🔴

- **Old**: `type CliProvider = 'claude' | 'codex' | 'acp' | 'qoder' | 'qodercli'` (`server/config/types.ts:3`).
- **New (recommended)**: separate the axes —
  - `type CliVendor = 'claude' | 'codex' | 'qoder'`
  - `type CliTransport = 'native' | 'acp'`
  - drop `'acp'` from the vendor union.
- **Data risk**: `agents.provider` (DB TEXT) and `teemai.json` may contain `'acp'` / `'qodercli'`. Needs a normalization migration (map stored `acp`→ vendor+transport; `qodercli`→ `qoder` + surface flag).
- **Impact**: SH, BE, FE, DB, CFG. **Risk**: 🔴 (persisted enum values).

### 3b. Collapse `qoder` vs `qodercli` 🔴

- **Old**: two provider values; ≥10 sites test `(provider === 'qoder' || provider === 'qodercli')` (e.g. `server/runtime/ConfigCompiler.ts:159,301`, `TerminalViewManager.ts:117`, `SessionDiscovery.ts:44`, `ExpertResumeHandler.ts:66`, `web/lib/models.ts:60`).
- **New**: single vendor `qoder` + a `surface: 'cli' | 'cloud'` discriminator where the binary-vs-tier distinction actually matters.
- **Sites to update**: all `|| === 'qodercli'` predicates collapse to one vendor check.
- **Impact**: SH, BE, FE, DB, CFG. **Risk**: 🔴 (persisted values + config schema).

### 3c. Fold redundant project-key function 🟢

- **Old**: `cwdToQoderProjectKey()` (`shared/projectKey.ts:10`) is byte-identical to `cwdToClaudeProjectKey()` (line 8).
- **New**: single `cwdToCliProjectKey()`; update `SessionDiscovery.ts:19`, `ExpertResumeHandler.ts:26`, `shared/__tests__/projectKey.test.ts`.
- **Impact**: SH, BE. **Risk**: 🟢 (pure internal; keep behavior identical).

---

## WS-4 — De-dup `ChatActivityPayload` / `*ActivitySnapshot` 🟢

| Old | New |
|---|---|
| `ChatActivityPayload` re-declared in `web/types/chat.ts:145` & `server/terminal/ActivityAggregator.ts` | import the sole `shared/ws/chat.ts` definition |
| `ExpertActivitySnapshot` (`web/types/chat.ts:134`) + `AgentActivitySnapshot` (`shared/ws/chat.ts:8`) | one `AgentActivitySnapshot` in shared |
| `ChatActivityPayload.expertActivities` (dead field — "server never populates") | **delete**; keep `agentActivities` only |

- **Impact**: SH, FE, BE. **Risk**: 🟢. **Note**: after WS-1, this type is `MissionActivityPayload`; do WS-4 as part of WS-1 to avoid renaming twice.

---

## WS-5 — Product name reconciliation 🟢

- **Reality**: runtime is consistently **TeemAI/teemai** (`~/.teemai/`, `teemai.json`, `teemai.db`, `TEEMAI_HOME`, `TeemAIParsedMessage`, `_teemai/*`). **OpenTeam** survives only in docs/brand.
- **Action (no code rename — doc/policy)**:
  1. Fix `CLAUDE.md` Key-Paths table: `openteam.db` → `teemai.db`, `openteam.json` → `teemai.json` (these are factually wrong today).
  2. Decide: is the public brand "OpenTeam" or "TeemAI"? Document the brand↔code mapping in `README.md`; stop using `OpenTeam` as a code identifier.
  3. Optional later: rename branded code types `TeemAIParsedMessage`/`_teemai/*` only if the brand decision demands it (🔴 wire for `_teemai/*` sessionUpdate strings — defer).
- **Impact**: PR/docs (CFG if `_teemai/*` later). **Risk**: 🟢 for the doc fix.

---

## WS-6 — War-Room ⇄ Whiteboard unification 🟢

- **Reality**: code/types/dir = **Whiteboard** (`server/whiteboard/`, `shared/whiteboard-types.ts`, `WhiteboardSidebar.tsx`, `wb-*` scripts); agent-facing = **War-Room** (all `ai-assets/agents/*/SOUL.md`, `wb-*.sh`, `WorkflowLeadPrompt.ts`).
- **Decision**: keep **Whiteboard** as the canonical noun (already the typed/stored term). Treat "war-room" as deprecated.
- **Action**: sweep agent prompts (`ai-assets/agents/*/SOUL.md`, `WorkflowLeadPrompt.ts`, `server/benchmark/lead-eval.ts`) to say "whiteboard"; OR, if "war-room" is the preferred UX metaphor, rename code instead (larger). Recommend prompt-side sweep (smaller, no code risk).
- **Impact**: PR/docs. **Risk**: 🟢. **Note**: leave `wb-` script prefix as-is (cosmetic).

---

## WS-7 — `chats` table agent-column consolidation 🔴 (DB migration, isolated PR)

This is the **single DB migration PR** that backs WS-1 + WS-2.

| Old (schema, `Database.ts:70-89`) | New | Note |
|---|---|---|
| table `chats` | `missions` | rename; keep a `chats` **view** alias for one release for rollback |
| `chat_id` (in `execution_logs`, `cron_job_executions`, etc.) | `mission_id` | FK rename across tables |
| `primary_agent_id` | `lead_agent_id` | clarify role |
| `team_agent_ids` | `team_agent_ids` | keep (it is the recruited set) |
| `participant_agents` | **merge/clarify** vs `team_agent_ids` | resolve overlap — document or drop one |
| `expert_sessions` | `mission_agent_sessions` | drop the phantom "expert" term |
| `last_agent_id` | `last_agent_id` | keep |
| `whiteboard_path`, `whiteboard_goal` | keep (WS-6 keeps Whiteboard) | — |

- **Migration shape**: new `server/stores/migrations/v27.ts` — `ALTER TABLE … RENAME`, column renames via table-rebuild (SQLite), backfill, compatibility `CREATE VIEW chats AS SELECT … FROM missions` for one release.
- **Also normalize** `agents.provider` values from WS-3 (`acp`/`qodercli` mapping) in the same migration.
- **Impact**: DB, BE. **Risk**: 🔴 (irreversible data; WAL; FK cascades). Must ship alone, with the view alias + a rollback note.

---

## WS-8 — Delete deprecated `AgentMessage` mailbox variants 🟢

- **Old** (`shared/agent-message-types.ts:50-73`): `task:accepted`, `task:progress`, `task:milestone`, `task:idle`, `task:rejected`, `task:delegated`, `query`, `response` (all `@deprecated` "no longer written"), plus `mailboxFileName` / `parseMailboxFileName` / `deserializeMailboxLine` / `serializeLogfmt`.
- **Action**: grep-confirm zero live writers/readers, then delete the dead union members + mailbox helpers.
- **Impact**: SH (+ BE if any importer). **Risk**: 🟢 once readers confirmed absent. Independent of all other workstreams.

---

## 2. Safe vs Breaking — master classification

### 🟢 Safe (ship anytime, TS-checked)
- WS-0 (contract de-dup), WS-4 (activity de-dup), WS-3c (`cwdToCliProjectKey` fold), WS-5 (CLAUDE.md doc fix), WS-6 (prompt sweep), WS-8 (dead-type deletion).
- Within WS-1/WS-2: all internal type/symbol/file/hook/class renames.

### 🔴 Breaking (migration and/or one-release alias)
| Item | Breaks | Mitigation |
|---|---|---|
| WS-1 chat-level WS payload event names | wire | dual-emit one release |
| WS-1 HTTP routes `/api/chat*`, URL `/task/:taskId` | external callers, bookmarks | route alias + `<Navigate replace>` |
| WS-1/WS-7 `chats`→`missions`, `chat_id`→`mission_id` | persisted data | migration + `chats` view alias |
| WS-2c WS channels `expert:*`→`agent:*` | wire (desktop↔server, CLI) | dual-emit/accept one release |
| WS-2d `EXPERT_API_BASE`→`AGENT_API_BASE` | shell hooks/skills (no compiler) | inject both names one release |
| WS-2b `/api/expert*`→`/api/agent*` | mobile/CLI | route alias |
| WS-3a/3b `acp` removal, `qoder/qodercli` collapse | `agents.provider` data + `teemai.json` | normalization migration + config compat read |

---

## 3. Suggested PR sequence

1. **PR-A (🟢 pre-shrink)**: WS-0 + WS-4 + WS-3c + WS-8. Pure internal; shrinks the big cut. No user impact.
2. **PR-B (🟢 docs)**: WS-5 (CLAUDE.md fix + brand decision) + WS-6 (prompt sweep). Independent.
3. **PR-C (🔴 DB, isolated)**: WS-7 migration (`v27`) incl. WS-3 provider normalization. Ship alone; verify rollback view.
4. **PR-D (🔴 big cut, shared+server)**: WS-1 + WS-2 type/server renames; emit dual WS channels + dual env; mount route aliases.
5. **PR-E (🔴 big cut, web+CLI+mobile)**: switch FE/CLI to `mission.*`/`agent:*` channels, new routes, `AGENT_API_BASE`.
6. **PR-F (cleanup, next release)**: drop all aliases — old WS channels, old env name, `chats` view, old routes, URL redirects.

Effort: PR-A/B ≈ 1–1.5 d; PR-C ≈ 1 d (+ careful test); PR-D/E ≈ 3–4 d (per PRD + Expert/Member fold); PR-F ≈ 0.5 d.

---

## 4. Open decision (blocks scope of PR-D/E)

`prd/terminology.md` is **approved but scopes only the unit-of-work axis** and explicitly keeps `expertSessions` as "persistence-only". It does **not** retire `Expert`/`Member` as Agent-synonyms. **WS-2 requires amending the PRD** to absorb Expert/Member into the same wave.

**Recommendation**: amend the PRD (add WS-2's mappings to its Phase-1/2 tables) and run WS-1+WS-2+WS-7 as one epoch. Shipping WS-1 alone would leave `Expert`/`Member` as live third/fourth names — a half-rename that is worse than the status quo.

→ Decision owner: Lead + Product Strategist. Tracked as war-room `open_question` (id `3kwQrzPR7-FD`).
