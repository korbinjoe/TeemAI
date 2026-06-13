# Architecture Naming & Terminology Review

**Reviewer**: Architect 🦅
**Date**: 2026-06-13
**Scope**: Full-stack noun/term review — domain model, module/dir naming, types & interfaces, `shared/` contracts, DB tables/fields, WS message types, CLI Provider abstraction.
**Mode**: Review-only. No code changed.
**North star**: `prd/terminology.md` (Approved 2026-05-24) is the locked target vocabulary. This review measures the gap between that target and the actual code, **and** surfaces concepts the PRD never addressed.

---

## I. Executive Summary

### Health Score (naming dimension)

| Dimension | Grade | Status |
|---|---|---|
| Domain-model term consistency | D | Critical |
| Front/back term alignment | D | Critical |
| Type/interface naming | C | Warning |
| `shared/` contract naming | C | Warning |
| DB table/field naming | C | Warning |
| WS message-type naming | D | Critical |
| CLI Provider abstraction naming | C | Warning |

### The one-sentence problem

**A single concept — "an AI worker participating in a unit of work" — is called five different names depending on which layer you are in: `Agent` (DB/config), `Expert` (WS/runtime, 259 literal `expert:*` uses across 31 files), `Member` (aggregation/UI), `ChatMember` (relation type), and the unit of work itself is called `Task` / `Chat` / `Session` / `Mission` / `Conversation` interchangeably.** The approved PRD fixes the *unit-of-work* axis (→ Mission) but is **silent on the `Expert`/`Member` axis**, which is the larger and more entrenched problem.

### Top findings (ranked)

1. **[P0] `Expert` is a phantom third name for `Agent`** — pervasive in the live WS control plane, not covered by the rename PRD. (§II-1)
2. **[P0] Participant concept has 5 names across layers** — Agent / Expert / Member / ChatMember + the per-slice. (§II-2)
3. **[P0] Unit-of-work has 4–5 names; PRD approved but 0% implemented** — `rename-task-to-mission` tasks all unchecked. (§II-3)
4. **[P1] `CliProvider` union mixes a protocol (`acp`) with vendors (`claude/codex/qoder`)** — category error. (§II-4)
5. **[P1] `qoder` vs `qodercli` double value + `cwdToQoderProjectKey` is a byte-identical clone of the Claude version** — false distinction. (§II-4)
6. **[P1] `ChatActivityPayload` defined 3× with field drift; `Expert*Snapshot` vs `Agent*Snapshot` twins** — contract duplication. (§II-5)
7. **[P1] Product name split: `OpenTeam` (docs/brand) vs `TeemAI`/`teemai` (runtime/DB/paths)** — even CLAUDE.md cites wrong file names. (§II-6)
8. **[P2] War-Room (prompts/hooks/UX) vs Whiteboard (code/types/dir)** — split term for one concept. (§II-7)
9. **[P2] `chats` table carries 5 overlapping agent-reference columns.** (§II-8)
10. **[P2] `agent-message-types` union is ~50% `@deprecated` mailbox-era dead types.** (§II-9)

### What is already good (keep)

- `Workspace`, `Team`, `Skill`, `Schedule`/`cron`, `Worktree`, `Repository` are correct and stable (PRD confirms).
- `cliSessionId` / JSONL-as-source-of-truth is a clean, deliberate persistence-layer term — correctly isolated.
- ACP spec types (`ACP*`, `JsonRpc*`) faithfully mirror the external protocol — correct to keep verbatim.

---

## II. Detailed Findings

### Finding 1 — [P0] `Expert`: the unowned third name for Agent

- **Location**: `shared/ws/expert.ts`, `shared/expert-event-types.ts`, `server/ws/Expert*.ts` (11 files), `web/hooks/useExpert*.ts`, 259 `expert:*` WS-channel literals across 31 files; env var `EXPERT_API_BASE`; DB column `chats.expert_sessions`; route file `server/routes/agent/expertRoutes.ts`.
- **Current state**: The entire live control plane is `expert:input` / `expert:stop` / `expert:resize` / `expert:cli-attach` / `ExpertStartedPayload` / `ExpertListPayload { experts: ExpertListItem[] }`. **Yet every payload field inside these types is `agentId` / `agentName` / `agentIcon`.** A single type is split-brained: `Expert`-named wrapper, `agent`-named fields.
- **Problem**: `Expert` denotes the same runtime entity as `Agent`. It is not a sub-type, not a role — it is a synonym that leaked from an earlier design and ossified into the protocol. The PRD's "keep `expertSessions` as persistence-only" carve-out does **not** apply here: `expert:input` is a live RPC channel, not persistence.
- **Impact**: New engineers must learn that Expert == Agent == Member. Cross-layer tracing (UI `agentId` → WS `expert:input` → server `ExpertHandler` → DB `agents`) crosses two renames. Highest single source of onboarding friction.
- **Recommendation**: Fold `Expert` → `Agent` everywhere it denotes the worker. WS channels `expert:*` → `agent:*` (alias for one release per PRD migration style). Rename `EXPERT_API_BASE` → `AGENT_API_BASE`, `expertRoutes.ts` → `agentRoutes.ts`. **This belongs in the PRD's Phase 2 and is currently missing from it.**
- **Change estimate**: ~31 files (WS), ~70 files touching `Expert`. Mechanical but wide; TypeScript covers type renames, WS string literals need an alias window.

### Finding 2 — [P0] Five names for the participant concept

- **Location**: `agents` table (DB) · `Expert*` (WS) · `MemberAggregator.ts`, `lib/memberStatus.ts`, `memberStatusDot()` (aggregation/UI) · `ChatMember` (relation type) · per-Agent slice (unnamed).
- **Current state**: Same entity, five vocabularies:
  | Layer | Name |
  |---|---|
  | DB / config | `Agent` |
  | WS / runtime | `Expert` |
  | Aggregation / status UI | `Member` |
  | Chat relation type | `ChatMember` |
  | Per-Agent work slice in a Mission | (no name; PRD rejects `Thread`) |
- **Problem**: Four synonyms + one gap. PRD only maps `ChatMember → MissionAgent`; it does not retire `Expert` or `Member`, so the rename would leave **three** live names (Agent, Expert→?, Member, MissionAgent).
- **Recommendation**: Collapse to **two** code-level terms, matching the PRD's intent:
  - `Agent` — the persona/definition (DB row, config).
  - `MissionAgent` — the participation record (replaces `ChatMember` *and* absorbs `Member`/`Expert` runtime usages where they mean "this agent in this mission").
  Retire `Expert` (§1) and `Member` entirely. Extend the PRD's Phase-1 table accordingly.
- **Change estimate**: Overlaps §1; add ~18 `Member*` files.

### Finding 3 — [P0] Unit-of-work renaming approved but not started

- **Location**: `prd/terminology.md` (Approved), `openspec/changes/rename-task-to-mission/tasks.md` (**all checkboxes empty**).
- **Current state**: Code still uses `Task` (routes/CTAs), `Chat` (`ChatStore`, `useWorkspaceChats`, `chatRoutes`, `chats` table, `chatId` everywhere), `Session` (PTY/JSONL), `Conversation` (`ConversationRecord`, `ConversationParser`). The Mission vocabulary exists only in the PRD + a few already-renamed files (`MissionSessionRows.tsx`, `useMission.ts`, `MobileMissionDetail.tsx`) — producing a **half-migrated** state where `Mission*` and `Chat*`/`Task*` coexist (e.g. `useMission.ts` next to `useWorkspaceChats.ts`/`useAllChats.ts`).
- **Problem**: A partial rename is worse than none — readers cannot trust either vocabulary. `MissionSessionRows.tsx` already calls `memberStatusDot()` while the file's neighbors still say `chat`.
- **Recommendation**: Execute `rename-task-to-mission` as the PRD prescribes (one-shot, Phase A→D), and **merge Finding 1 + 2 into the same wave** so the codebase converges on `Mission` + `Agent`/`MissionAgent` in one cut rather than two terminology epochs.
- **Change estimate**: Per PRD, ~3–5 eng-days; +1–2 days to fold in Expert/Member.

### Finding 4 — [P1] `CliProvider` union mixes protocol with vendors; `qoder`/`qodercli` false split

- **Location**: `server/config/types.ts:3` — `type CliProvider = 'claude' | 'codex' | 'acp' | 'qoder' | 'qodercli'`; `shared/projectKey.ts:8,10`.
- **Current state**:
  - `acp` sits in the **provider** union, but ACP (Agent Client Protocol) is a *transport/protocol*, orthogonal to which vendor CLI runs. `claude` and `codex` are *also* reached via ACP adapters (`server/acp/CliACPAdapter.ts`). So `acp` is a different axis wedged into the same enum.
  - `qoder` and `qodercli` are two values for one vendor; the code constantly tests `(provider === 'qoder' || provider === 'qodercli')` (≥10 sites) — a smell that the distinction is not load-bearing as a *provider* identity (it's really model-tier vs CLI-binary).
  - `cwdToQoderProjectKey()` (`shared/projectKey.ts:10`) is a **byte-for-byte clone** of `cwdToClaudeProjectKey()` (line 8) — same `cwd.replace(/[/.]/g, '-')`. The separate name implies a separate algorithm that does not exist.
- **Problem**: The abstraction's central enum doesn't model one clean axis; it conflates "vendor", "protocol", and "binary vs cloud tier". This undermines the documented "add a provider = implement 2 interfaces" story.
- **Recommendation**:
  - Split axes: `CliVendor = 'claude' | 'codex' | 'qoder'` × `transport = 'native' | 'acp'` × (for qoder) `surface = 'cli' | 'cloud'`. Or, minimally, drop `acp` from `CliProvider` and model transport separately.
  - Collapse `cwdToQoderProjectKey` into `cwdToCliProjectKey` (one function) until a provider genuinely needs a different key scheme.
- **Change estimate**: ~15 files reference the union; contained.

### Finding 5 — [P1] Duplicated contracts with field drift

- **Location**: `interface ChatActivityPayload` defined in **3** places — `shared/ws/chat.ts` (canonical), `web/types/chat.ts` (re-declared), `server/terminal/ActivityAggregator.ts`. Plus twin types `ExpertActivitySnapshot` (`web/types/chat.ts:134`) vs `AgentActivitySnapshot` (`shared/ws/chat.ts:8`) — identical shape, different names.
- **Current state**: `web/types/chat.ts` ships its own `ChatActivityPayload` carrying **both** `expertActivities` *and* `agentActivities`, with an inline comment admitting `expertActivities` is "a legacy alias that the server never populates". A dead field preserved purely by naming inertia.
- **Problem**: A shared contract is re-declared per layer, so the layers can (and did) drift. The `expert`/`agent` field duplication is the §1 split-brain crystallised inside one payload.
- **Recommendation**: Single source of truth in `shared/ws/`; `web` and `server` import it, never re-declare. Delete `expertActivities`. Unify `*ActivitySnapshot` to one name (`AgentActivitySnapshot`).
- **Change estimate**: 3 type sites + their importers.

### Finding 6 — [P1] Product name split: OpenTeam vs TeemAI

- **Location**: Brand/docs say **OpenTeam** (`README.md`, `CLAUDE.md` overview, `openspec`, PRD title). Runtime says **TeemAI/teemai**: `~/.teemai/`, `teemai.json`, `teemai.db`, `TEEMAI_HOME`, `TeemAIParsedMessage`, `_teemai/*` ACP extensions, dist artifact `TeemAI.app`.
- **Current state**: Two product identities coexist. **CLAUDE.md itself is wrong**: it documents `~/.teemai/openteam.db` and `openteam.json`, but the real files are `teemai.db` (`Database.ts:21`) and `teemai.json` (root). The `openteam.json` it names does not exist.
- **Problem**: Documentation drift on the most basic identifiers; ambiguity in branded type names (`TeemAIParsedMessage` vs ACP-spec `ACPMessage`).
- **Recommendation**: Pick one product name (the runtime already commits to TeemAI). Fix CLAUDE.md's path table to `teemai.json` / `teemai.db`. If OpenTeam is the public brand, document the mapping explicitly and stop using it as a code identifier.
- **Change estimate**: Docs + a handful of constants; the runtime is already consistent on `teemai`.

### Finding 7 — [P2] War-Room vs Whiteboard

- **Location**: Code = **Whiteboard** (`server/whiteboard/WhiteboardManager.ts`, `shared/whiteboard-types.ts`, `WhiteboardSidebar.tsx`, `wb-*` scripts). Agent-/user-facing = **War-Room** (every `ai-assets/agents/*/SOUL.md`, `wb-*.sh` hook docs, `WorkflowLeadPrompt.ts`, `LeadEval`).
- **Problem**: The thing agents are told to "write to the war-room" is typed/stored as `Whiteboard`. One concept, two names across the prompt/code boundary; `wb-` prefix matches neither word cleanly.
- **Recommendation**: Choose one (recommend **Whiteboard** — already the typed/stored term; "war-room" is evocative but undocumented in code). Sweep agent prompts to match, or formally document war-room as the user-facing synonym of the Whiteboard subsystem.
- **Change estimate**: Prompts/docs-heavy; low code risk.

### Finding 8 — [P2] `chats` table: 5 overlapping agent-reference columns

- **Location**: `server/stores/Database.ts:70-89`.
- **Current state**: `chats` has `primary_agent_id`, `team_agent_ids`, `expert_sessions`, `participant_agents`, `last_agent_id` — five columns all encoding "which agents relate to this chat", in three vocabularies (agent/expert/participant).
- **Problem**: Overlapping, ambiguously-scoped columns; unclear which is authoritative for "who is in this mission". `expert_sessions` reuses the §1 phantom term at the schema level.
- **Recommendation**: As part of the `chats → missions` migration, consolidate the agent-set columns and standardize on `agent`/`mission_agent` naming; document each column's distinct role or merge redundant ones.
- **Change estimate**: Schema migration (already planned in PRD Phase 2 — extend it).

### Finding 9 — [P2] `AgentMessage` union is half-deprecated

- **Location**: `shared/agent-message-types.ts:50-73`.
- **Current state**: ~11 of the union members are `@deprecated` "Mailbox-era … no longer written" (`task:accepted`, `task:progress`, `task:milestone`, `task:idle`, `task:rejected`, `task:delegated`, `query`, `response`). `mailboxFileName`/`parseMailboxFileName`/`deserializeMailboxLine` persist alongside.
- **Problem**: The active protocol surface is buried in dead variants; readers cannot tell live from legacy without reading every doc-comment. "Mailbox" itself is a retired subsystem name still shaping the type.
- **Recommendation**: Once consumers are confirmed gone, delete the deprecated members and mailbox helpers (per CLAUDE.md Rule 6 on dead code). Keep only the live A2A envelope.
- **Change estimate**: Contained to one file + verifying no readers.

---

## III. Cross-Layer Term Map (current reality)

| Concept | DB | shared/contract | server runtime | web/UI | agent prompts |
|---|---|---|---|---|---|
| Unit of work | `chats` | `Chat*` / `Task*` | `ChatService` | `useWorkspaceChats` + `useMission` (mixed) | "mission" / "task" |
| Participant | `agents` | `ChatMember`, `Agent*` | `Expert*`, `Member*` | `Member*`, `agentId` | "agent" / "member" |
| Shared scratchpad | `chats.whiteboard_*` | `Whiteboard*` | `WhiteboardManager` | `WhiteboardSidebar` | "war-room" |
| CLI backend | `agents.provider` | `CliProvider` (+`acp`) | `*ACPAdapter` | provider enums (+`qodercli`) | — |
| Product | `teemai.db` | `_teemai/*`, `TeemAI*` | `TEEMAI_HOME` | — | "OpenTeam" |

The diagonal should be a single word per row. Today every row uses 2–5.

---

## IV. Recommended Action Sequence

### P0 — fold into one terminology wave (do not ship piecemeal)
1. Execute `rename-task-to-mission` (PRD Phase A–D) — unit-of-work → **Mission**.
2. **Extend that wave** with: `Expert*` → `Agent*` (WS `expert:*` → `agent:*` w/ 1-release alias), retire `Member*`, `ChatMember` → `MissionAgent`. (Amend `prd/terminology.md` Phase 1–2 tables to include Expert/Member — currently absent.)
3. De-duplicate `ChatActivityPayload`/`*ActivitySnapshot` into one shared definition; delete `expertActivities`.

### P1
4. Refactor `CliProvider` to separate vendor / protocol / surface axes; drop `acp` from the provider enum; collapse `cwdToQoderProjectKey` into the Claude version.
5. Fix CLAUDE.md path table (`teemai.json`/`teemai.db`); decide OpenTeam-vs-TeemAI and document the brand/code split.

### P2 (backlog)
6. Unify War-Room/Whiteboard.
7. Consolidate `chats` agent-reference columns during the schema migration.
8. Delete deprecated `AgentMessage` mailbox variants once readers are confirmed gone.

---

## V. One open question for the Lead / Product

`prd/terminology.md` is **approved and locked**, but it scopes only the *unit-of-work* axis (Task/Chat → Mission) and explicitly keeps `expertSessions` as "persistence-only". It does **not** address that `Expert` and `Member` are live synonyms for `Agent` across the WS control plane and aggregation layer. **Should the approved PRD be amended to absorb the Expert/Member collapse into the same one-shot migration** (recommended — avoids two terminology epochs), or is Expert/Member intentionally deferred? This is the single decision that determines whether the rename converges the codebase or leaves it half-renamed.
