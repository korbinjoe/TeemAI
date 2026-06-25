# Fix Codex Terminal Env

## Summary
Fix Codex terminal-view conversations so the resume PTY receives the same provider credential environment as normal TeemAI Codex launches.

## Root Cause
`ConfigCompiler.compileForCodex` resolves provider `env_key` values from `~/.codex/config.toml`, TeemAI config, Claude settings, and the login shell before spawning Codex. `TerminalViewManager` launches the terminal-view `codex resume` process separately and only passes `process.env`, so custom providers can miss required environment variables such as `IDEALAB_API_TOKEN`.

## Goals
- Inject Codex provider environment variables into terminal-view `codex resume`.
- Keep Claude and Qoder terminal-view behavior unchanged.
- Cover the Codex terminal env path with a focused unit test.

## Non-Goals
- Change Codex app-server message-mode behavior.
- Change credential storage or discovery order.
- Add new UI for missing credentials.

## Approach
Reuse the existing `resolveCodexProviderEnv(cwd)` helper inside `TerminalViewManager` only when the target provider is Codex, then merge the resolved variables into the PTY spawn environment.

## Risks
- Environment resolution can perform a login-shell lookup. This is already used for normal Codex launches, so terminal view will match existing behavior.
