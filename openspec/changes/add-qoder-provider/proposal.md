# Add Qoder CLI as a New Provider

## Summary

Add Qoder CLI (`qodercli`) as a first-class provider in the multi-CLI provider architecture, alongside the existing `claude` and `codex` providers. Qoder CLI is a Claude Code-compatible CLI that writes JSONL transcripts in the same format as Claude Code but stores them under `~/.qoder/projects/<project-key>/transcript/`. This proposal covers session discovery, output parsing, agent spawn/install flow, config schema changes, frontend integration, and session resume.

## Motivation

The multi-CLI provider architecture was designed for extensibility — adding a new provider requires implementing only the `SessionDiscovery` strategy and `OutputParser` interface. The codebase already contains partial Qoder support:

- `CliProvider` type already includes `'qoder'` (`server/config/types.ts:3`)
- `createSessionDiscovery()` has a `case 'qoder'` branch that reuses `ClaudeSessionDiscovery` with a custom `dirBuilder` (`server/terminal/SessionDiscovery.ts:44-48`)
- `ConfigCompiler.compile()` handles `'qoder'` in the `claude` branch, emitting `command: 'qodercli'` (`server/runtime/ConfigCompiler.ts:105-106, 158, 300`)
- `TerminalViewManager` handles `'qoder'` alongside `'claude'` for `--resume` spawns (`server/terminal/TerminalViewManager.ts:117-119`)
- Frontend `AgentSummary.provider` and `ModelOption.provider` already accept `'qoder'` (`web/types/agentConfig.ts:89`, `web/lib/models.ts:6`)

However, several gaps remain:

1. **Session discovery path is untested** — the `dirBuilder` lambda uses `cwd.replace(/[/.]/g, '-')` as the project key, which needs verification against actual Qoder behavior.
2. **No Qoder-specific models** in the model list — Qoder-native models should be tagged with `provider: 'qoder'`.
3. **`AgentStore.rowToEntity`** only maps `provider` to `'claude' | 'codex'`, dropping `'qoder'` on DB read (`server/stores/AgentStore.ts:113`).
4. **`ExpertResumeHandler.readMessagesFromJsonl`** falls through to Claude's path for `qoder`, using `cwdToClaudeProjectKey()` instead of Qoder's project key scheme — JSONL files won't be found for session recovery.
5. **No install/version-check** mechanism for `qodercli` binary.
6. **Frontend provider selector** doesn't display Qoder as an option when creating/editing agents.

### Why now

1. The scaffolding is already in place — this is finishing work, not green-field.
2. Qoder CLI uses Claude Code-compatible JSONL format, meaning the existing `claudeOutputParser` can be reused directly — no new parser needed.
3. Completing Qoder support validates the provider extensibility claim of the architecture.

## Goals

1. **Complete the SessionDiscovery implementation** — verify and solidify the Qoder project key derivation and transcript directory structure.
2. **Fix AgentStore deserialization** — ensure `'qoder'` provider survives DB round-trip.
3. **Fix ExpertResumeHandler** — route Qoder sessions to the correct JSONL path on resume.
4. **Add Qoder models** to the model config with `provider: 'qoder'`.
5. **Surface Qoder in frontend** — agent creation/edit form, provider badge, model filtering.
6. **Add install check** — detect `qodercli` on PATH; show actionable install instructions if missing.
7. **Document the provider** in openspec specs for future reference.

## Non-Goals

- **No custom OutputParser.** Qoder CLI writes Claude Code-compatible JSONL — reuse `claudeOutputParser` as-is. If Qoder diverges in the future, a `QoderParser` can be added incrementally.
- **No custom StreamJsonParser handlers.** Qoder's stream-json output matches Claude's format.
- **No new transport or protocol.** Same stdin/stdout stream-json + JSONL file watching.
- **No Qoder-specific hooks or skills.** Qoder agents use the same hook and skill system as Claude agents.
- **No auto-install.** The user is expected to install `qodercli` manually via `curl -fsSL https://qoder.com/install | bash`. We detect and inform, not auto-install.

## Approach

Qoder CLI is architecturally a "Claude-compatible provider" — it uses the same JSONL format, the same stream-json protocol, and the same CLI flags (`--print`, `--output-format stream-json`, `--resume`, etc.). The only differences are:

1. **Binary name**: `qodercli` instead of `claude`
2. **Transcript path**: `~/.qoder/projects/<project-key>/transcript/` instead of `~/.claude/projects/<project-key>/`
3. **Project key derivation**: `cwd.replace(/[/.]/g, '-')` instead of `cwdToClaudeProjectKey()`

This means we can reuse the entire Claude pipeline (parser, watcher, compiler) with only path and command overrides — exactly the extensibility the architecture was designed for.

## Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Qoder JSONL format diverges from Claude | Low (currently identical) | Monitor; add QoderParser if needed |
| Qoder project key derivation is wrong | Medium | Verify against actual Qoder installation; add integration test |
| `qodercli` not on PATH after install | Medium | `resolveCliCommandAsync` already handles this; surface install instructions in UI |
| Model names change between Qoder versions | Low | Models are configurable via `~/.teemai/config.json` |

## Dependencies

- Qoder CLI must be installed by the user (`curl -fsSL https://qoder.com/install | bash`)
- No new npm dependencies required
