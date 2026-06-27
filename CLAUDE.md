
# Project Rules

## Project Overview

OpenTeam is **the operating system for AI super-individuals** — enabling one person to orchestrate multiple AI Agents working in parallel, independently delivering what used to require a whole team. The core user rhythm is pulse-mode: batch-dispatch tasks → leave for higher-value work → come back to batch-review results.

**Design Principles**: Attention-first (conserve, not consume attention), Leave-friendly (system runs independently while you're away), Batch operations, Cost transparency, Progressive trust.

---

## Tech Stack

- Frontend: React 18 + TypeScript + Vite + TailwindCSS
- Terminal: xterm.js + node-pty
- Backend: Express + tsx
- Desktop: Electron
- CLI: Commander.js + Ink (React for CLI)
- Database: better-sqlite3 (WAL mode)
- Package manager: npm

## Key Paths & Conventions

| Path | Description |
|------|-------------|
| `@/` | Vite path alias, points to `web/` |
| `~/.teemai/` | Runtime data root (DB, Agent workspace, temp files) |
| `~/.teemai/teemai.db` | SQLite database, schema versioned via `server/stores/migrations/` |
| `teemai.json` | Project-level Agent team config (Agent list, default model, Provider) |
| `ai-assets/` | Bundled resources: Agent definition MDs, MCP servers, Skills, Hook scripts |
| `shared/` | Shared types between frontend and backend (`ws-types.ts`, `ports.ts`) |

## Multi CLI Provider Architecture

Two CLI Providers are supported: `claude` | `codex`, with core differences in session discovery and JSONL parsing:

- **SessionDiscovery**: Strategy pattern, creates different file discovery logic per provider (`server/terminal/SessionDiscovery.ts`)
- **OutputParser**: Interface pattern, Claude uses `ConversationParser`, Codex uses `CodexParser`
- **SessionFileWatcher**: 100% reused, only injects a different parser

Adding a new CLI Provider only requires implementing the `SessionDiscovery` + `OutputParser` interfaces.

## Message Data Source Principle

- **JSONL files are the single source of truth for conversation messages** — no separate messages table in the database
- Message recovery chain: `chats.expert_sessions` → cliSessionId → JSONL file → `SessionFileWatcher` parsing
- Do NOT propose persisting messages to SQLite — this is a design principle of the project

## Status Indicator Conventions

Status dots (chat rows, agent rows, task headers) share one color vocabulary
across the app. Reuse these tokens — do not invent new mappings.

| Color | Token | Meaning |
|-------|-------|---------|
| Blue (rippling) | `bg-accent-brand` + `before:animate-ping-soft` water-ripple | `running` — agent actively executing |
| Yellow | `bg-accent-yellow` | `waiting` — blocked on user confirmation (`waiting_confirmation`) |
| Yellow (soft) | `bg-accent-yellow/60` | `waiting_input` — agent finished turn, awaiting user's next message |
| Red | `bg-accent-red` | `error` — execution failed |
| Green (muted) | `bg-accent-green/40` | `done` — completed successfully (deliberately recessive — done state should not compete for attention) |
| Gray | `bg-text-muted` | `idle` / `stopped` — no active work |

Source of truth:
- Chat-level: `chatStatusDot()` in `web/components/workspace/MissionSessionRows.tsx`
- Member-level: `memberStatusDot()` in same file
- The `ping-soft` keyframe lives in `tailwind.config.js`

When adding a new surface that shows agent/chat status, import these helpers
instead of duplicating the color logic.

---

## Rule 1: Plan Before Code

- Changes touching **3+ files** must produce a plan (md or text) and get confirmation before writing code
- **Bug fixes** must produce a root cause analysis (with code path trace) and get confirmation before implementing
- When the user says "plan first" / "analyze first" / "design first", **do not write code directly**
- Technical plans should include: Problem description → Root cause → Solution approach → Impact scope → Implementation steps

## Rule 2: Minimal Change Principle

- **Only modify code directly related to the current task** — no extra refactoring, optimization, or beautification
- Do not introduce abstraction layers the user didn't request (Buffer, Cache, Queue, Middleware, etc.)
- Do not introduce new dependencies or design patterns the user didn't request
- Do not unilaterally change the existing state management approach (no switching between props/zustand/context)
- If you believe additional changes are needed, explain the reasoning and get user confirmation first

## Rule 3: Post-Fix Impact Verification

After every bug fix or feature modification, output the following:

```
## Impact Verification

### Files Modified
- file1.ts: what changed
- file2.tsx: what changed

### Potentially Affected Features
- [ ] Feature A: expected to work? (reasoning)
- [ ] Feature B: expected to work? (reasoning)

### High-Risk Area Checklist
- [ ] Terminal rendering (initial load / refresh / resize)
- [ ] Session recovery (entering historical sessions / post-refresh recovery)
- [ ] State persistence after page refresh
```

## Rule 4: Mission Switch Performance

Mission switch instrumentation and scoring are **permanent** (not dev-only throwaway code).

After changes touching mission navigation, `ChatPane` cache, `ChatInstance` lifecycle, `useChatWebSocket` resume/replay, mission sidebar, or IDE portal:

1. Run `npm run perf:mission-switch` (requires `npm run dev` in another terminal)
2. Ensure score does not regress vs `scripts/perf-baselines/mission-switch.json`
3. If improvements are intentional, refresh baseline: `npm run perf:mission-switch:baseline`

Details: `docs/perf-mission-switch.md`. Browser console: `__missionSwitchPerf.score()`.

## Rule 5: xterm / PTY Rules

This is the highest-bug-density area of the project — exercise extra caution before modifying:

- Before modifying xterm-related code, **read the full** terminal component and PTY management code first
- xterm size/rendering changes must cover these **four scenarios**:
  1. Initial load
  2. Page refresh
  3. Window resize
  4. Historical session recovery
- PTY process management changes must assess impact on **session recovery**
- Do not add PTY timeout/auto-cleanup logic unless the user explicitly requests it
- xterm fit addon call timing must account for actual DOM mount completion

## Rule 6: Prohibited Actions

The following are explicitly prohibited:

- Do not add OutputBuffer / DataCache / MessageQueue or similar middleware layers the user didn't request
- Do not modify `~/.claude/settings.json` unless the user explicitly requests it
- Do not refactor surrounding code while fixing a bug
- Do not add timeout recycling, auto-cleanup, or polling logic unless the user requests it
- Do not reimplement work that the user asked to be done using an existing skill

## Rule 7: Code Standards

- Respond in the user's language unless they request otherwise
- **Code, comments, documentation, and commit messages should follow the surrounding project conventions; use English when the existing context is English**
- Use TypeScript strict mode style
- Use only Tailwind classes for styling
- Use const arrow functions, no semicolons
- Event handlers use `handle` prefix
- Conditional classnames use `cn()`
- **Single file must not exceed 500 lines** — split into hooks, subcomponents, or utility modules when exceeded
- **Commented-out or disabled code blocks must have a TODO comment** with restore conditions or tracking link (e.g., `// TODO(#123): restore condition description`). Large comment blocks without TODO should be deleted or restored
