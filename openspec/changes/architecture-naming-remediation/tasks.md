# Architecture Naming Remediation — Tasks

> **Reconstructed 2026-06-14** after this file was accidentally deleted. Checkbox
> state below was re-derived by verifying each item against the real codebase
> (grep/read), not copied from memory. Structure follows
> `docs/architecture-naming-remediation-plan-2026-06-13.md` (workstreams WS-0..WS-8,
> PR sequence PR-A..PR-F).

## Scope Notes

1. **WS-2 is in scope** as part of the "big-cut" epoch (WS-1 + WS-2 + WS-7 run as
   one terminology wave so the codebase converges on `Mission` + `Agent`/`MissionAgent`
   in a single epoch). The original PRD covered only the unit-of-work axis; the WS-2
   Expert/Member fold was an approved amendment.
2. **PR-F is intentionally deferred** to the next release. Alias/compat windows
   (dual `expert:*`/`agent:*` channels, dual `EXPERT_API_BASE`/`AGENT_API_BASE`,
   the `chats` rollback view, HTTP route aliases, the singular `/task/:taskId`
   redirect) must survive at least one release boundary before the old names are
   dropped, to avoid version skew between the desktop app and the server.
3. **This file was reconstructed on 2026-06-14** after an accidental deletion; the
   tracked tasks below were re-verified against the current code state on that date.

---

## PR-A — Pre-shrink (🟢 pure internal) — WS-0, WS-4, WS-3c, WS-8

Status: **DONE** (verified; tsc clean per PR-A review).

### WS-0 — Consolidate duplicated contracts into `shared/`
- [x] A0.1 `ChatMember` / `ChatMemberStatus` / `ChatMemberRole` consolidated into a single home in `shared/chat-types.ts` (server `config/types.ts` and `web/components/workspace/types.ts` copies removed; both sides import from shared)
- [x] A0.2 `ChatActivityPayload` single source established in `shared/ws/chat.ts` (handled fully via WS-4; FE/BE import from shared)

### WS-4 — De-dup `ChatActivityPayload` / `*ActivitySnapshot`
- [x] A4.1 `ChatActivityPayload` re-declarations in `web/types/chat.ts` and `server/terminal/ActivityAggregator.ts` removed; sole definition in `shared/ws/chat.ts`
- [x] A4.2 `ExpertActivitySnapshot` merged into a single `AgentActivitySnapshot` in `shared/ws/chat.ts` (web copy removed)
- [x] A4.3 Dead `ChatActivityPayload.expertActivities` field deleted; only `agentActivities` remains

### WS-3c — Fold redundant project-key function
- [x] A3c.1 `cwdToQoderProjectKey()` + `cwdToClaudeProjectKey()` folded into a single `cwdToCliProjectKey()` in `shared/projectKey.ts`
- [x] A3c.2 Call sites (`SessionDiscovery`, resume handler, `shared/__tests__/projectKey.test.ts`) updated to the folded function

### WS-8 — Delete deprecated `AgentMessage` mailbox variants
- [x] A8.1 Deprecated mailbox union members (`task:accepted`, `task:progress`, `task:milestone`, `task:idle`, `task:rejected`, `task:delegated`, `query`, `response`) removed from `shared/agent-message-types.ts`
- [x] A8.2 Mailbox helpers (`mailboxFileName`, `parseMailboxFileName`, `deserializeMailboxLine`, `serializeLogfmt`) removed (zero live readers/writers confirmed)

---

## PR-B — Docs (🟢) — WS-5, WS-6

Status: **DONE** (verified).

### WS-5 — Product name reconciliation
- [x] B5.1 `CLAUDE.md` Key-Paths table corrected: `openteam.db` → `teemai.db`, `openteam.json` → `teemai.json`
- [x] B5.2 `README.md` documents the brand↔code mapping ("OpenTeam" public brand vs `TeemAI`/`teemai` code truth); `OpenTeam` no longer used as a code identifier

### WS-6 — War-Room ⇄ Whiteboard unification
- [x] B6.1 Agent prompts (`ai-assets/agents/*/SOUL.md`, `WorkflowLeadPrompt.ts`, `server/benchmark/lead-eval.ts`) swept to say "whiteboard"; "war-room" wording removed
- [x] B6.2 `wb-` script prefix left unchanged (cosmetic, intentionally kept)

---

## PR-C — DB migration (🔴, isolated) — WS-7, WS-3 provider normalization

Status: **DONE** (per known final state; migration smoke-tested on a real DB copy,
500 rows, idempotent). `server/stores/migrations/index.ts` registers `migrateToV27`.

### WS-7 — `chats` table → `missions` consolidation (v27)
- [x] C7.1 `server/stores/migrations/v27.ts` renames table `chats` → `missions`
- [x] C7.2 FK column `chat_id` → `mission_id` rename across tables (`execution_logs`, `cron_job_executions`, `agent_memories`, `token_usage`) — done in `server/stores/migrations/v28.ts` (isolated `RENAME COLUMN`, guarded for re-run / fresh DBs)
- [x] C7.3 Column `primary_agent_id` → `lead_agent_id` renamed
- [x] C7.4 Column `expert_sessions` → `mission_agent_sessions` renamed
- [x] C7.5 Rollback `CREATE VIEW chats AS SELECT … FROM missions` with `INSTEAD OF` triggers added for one-release rollback safety

### WS-3 (a/b) — provider normalization (same migration)
- [x] C3.1 `agents.provider` normalized: `acp` → `claude` + transport flag
- [x] C3.2 `agents.provider` normalized: `qodercli` → `qoder` + surface flag

---

## PR-D — Big cut, shared + server (🔴) — WS-1, WS-2 (a–d)

Status: **DONE** (verified; tsc clean per known final state).

### WS-1 — Unit of work → Mission (server/shared)
- [x] D1.1 `ChatService` → `MissionService` (`server/services/chat/ChatService.ts` exports `MissionService`; `ChatService` kept as deprecated alias)
- [x] D1.2 `missionRoutes.ts` added with `/api/missions/*` → `/api/chats/*` rewrite alias
- [x] D1.3 Chat-level WS payload renames: `MissionStatusChangedPayload`, `MissionActivityPayload`, `MissionPermission*`, `MissionUserInputPayload` in `shared/ws/chat.ts` (old `Chat*` names kept as deprecated aliases)

### WS-2a — Participant type/file/symbol renames → Agent / MissionAgent
- [x] D2.1 16 `Expert*Payload` types → `Agent*Payload` in `shared/ws/agent.ts` (`shared/ws/expert.ts` retired)
- [x] D2.2 11 server `Expert*` files → `MissionAgent*` (`server/ws/MissionAgent*.ts`)
- [x] D2.3 `MemberAggregator` → `MissionAgentAggregator` (`server/stores/MissionAgentAggregator.ts`)
- [x] D2.4 `ExpertSessionStore` → `MissionAgentSessionStore` (`server/ws/MissionAgentSessionStore.ts`)
- [x] D2.5 `createExpertRoutes` → `createAgentRoutes` (`server/routes/agent/agentRoutes.ts`)
- [x] D2.6 `ExpertListPayload.experts` field → `.agents` in `shared/ws/agent.ts`
- [x] D2.7 `ExpertActivitySnapshot` → `AgentActivitySnapshot` (already landed in WS-4)

### WS-2b — HTTP route rename (alias)
- [x] D2b.1 Agent routes mounted at `/api/agent*` with the legacy `/api/expert*` path kept as a forwarding alias (one-release window)

### WS-2c — WS channel rename `expert:*` → `agent:*` (alias window)
- [x] D2c.1 Dual-emit/dual-accept compat layer added (`server/ws/wireCompat.ts`): server emits both `expert:*` + `agent:*`, both `chat:*` + `mission.*`, and `.experts` + `.agents`
- [x] D2c.2 Compat layer wired through send/receive paths (`WSRouter` `canonicalizeInbound`; `sendFrame`/`outboundFrames` used by handlers and `server/index.ts`)

### WS-2d — Runtime env `EXPERT_API_BASE` → `AGENT_API_BASE` (dual-name window)
- [x] D2d.1 `server/runtime/ConfigCompiler.ts` dual-injects both `EXPERT_API_BASE` and `AGENT_API_BASE` (also in resume env and the env-key allowlist)

### WS-1/WS-2 — Keep-unchanged guarantees
- [x] D-keep.1 `cliSessionId`, `WorktreeSession`, PTY "session", `Workspace`, `Team`, `Skill`, `Schedule` preserved (not renamed)

---

## PR-E — Big cut, web + CLI (🔴) — WS-1, WS-2 (FE/CLI side)

Status: **DONE** (verified; tsc clean, exit 0 per known final state).

- [x] E1.1 Web switched to `agent:*` / `mission.*` channels in `web/services/WebSocketEventMap.ts` (no `expert:*` remaining on the web map)
- [x] E1.2 CLI client switched to `agent:*` / `mission.*` channels (`cli/bin/teemai.ts`, `cli/commands/*`)
- [x] E2.1 `/tasks` and `/chats` → `/missions` redirects via `<Navigate replace>` in `web/App.tsx` (incl. workspace-scoped variants)
- [x] E2.2 Singular legacy `/workspace/:wsId/task/:taskId` → `/mission/:taskId` redirect (`LegacyMissionRedirect`)
- [x] E3.1 `web/lib/memberStatus.ts` → `web/lib/agentStatus.ts` (`PHASE_TO_AGENT_STATUS`, `phaseToAgentStatus`, `reconcileAgentsFromActivity`, `agentStatusDot()`)
- [x] E4.1 D2.1 `ChatMember` / `ChatMemberStatus` / `ChatMemberRole` → `MissionAgent` / `MissionAgentStatus` / `MissionAgentRole` in `shared/chat-types.ts`, with `ChatMember*` kept as deprecated aliases
- [x] E4.2 D2.7 `ExpertActivitySnapshot` → `AgentActivitySnapshot` (already done in WS-4)
- [x] E5.1 Web/CLI read `AGENT_API_BASE` (with `EXPERT_API_BASE` fallback during the compat window)

---

## PR-F — Cleanup, next release (🔴) — drop all aliases

Status: **MOSTLY DONE** — F1–F5 dropped this epoch. The single-bundled app
(Electron ships server+web+CLI together) has no client/server version skew, so the
release-boundary rationale below no longer applies and the shims were removed.
F6 is partially done (see note); the value-level `CliProvider`/`qodercli` cascade
remains deferred (separate item below).

- [x] F1 Drop `expert:*` WS channels (stop dual-emit/accept) — verified: zero `'expert:'` channel literals in code
- [x] F2 Drop legacy `EXPERT_API_BASE` env injection from `ConfigCompiler` (and the shell `${AGENT_API_BASE:-$EXPERT_API_BASE}` fallbacks) — verified: zero `EXPERT_API_BASE` in code (`.ts`/`.tsx`/`.sh`); only docs/specs mention it
- [x] F3 Drop the `chats` rollback view + `INSTEAD OF` triggers from the schema — done in `v28.ts`; `CREATE VIEW chats` now exists only in v27 (create) + v28 (drop) migration history
- [x] F4 Drop HTTP route aliases (`/api/chats/*`, `/api/expert*`) — canonical handlers are now `/api/missions/*` and `/api/agent/*`; rewrite-middleware shims removed; all mission-resource clients migrated. (Note: `/api/all-chats`, `/api/workspaces/:id/chats`, and the whiteboard/token-usage routers legitimately keep `/api/chats` — workspace-scoped, not the mission resource.)
- [x] F5 Drop the singular `/task/:taskId` → `/mission/:missionId` redirect — `LegacyMissionRedirect` + legacy `/chats` redirects removed from `web/App.tsx`
- [ ] F6 Remove deprecated type aliases — **PARTIAL**: `ChatMember*` removed (`shared/chat-types.ts`). Still **DEFERRED**: `ChatActivityPayload` (`shared/ws/chat.ts`, ~20 importers), `ChatService` (`server/services/chat/ChatService.ts`, used by `index.ts`/`CronScheduler`/routes), `ExpertUserInputPayload` — same class of wide value/type cascade as the `CliProvider` item below; tracked for a follow-up.
- [ ] F7 Drop the `@deprecated` `CliProvider` union + legacy `qodercli` provider value (collapse to `CliVendor`/`CliTransport`) — **DEFERRED**: `qodercli` is the literal qoder CLI binary + npm package name (`CliAutoInstaller`, `TerminalViewManager`, `ConfigCompiler`, `SessionDiscovery`), so a "zero `qodercli`" sweep is not literally satisfiable; the value-level cascade spans ~13 files incl. web radio/filter values and i18n keys. This is the ~20-file change the spec author deferred via the `@deprecated` comment.
