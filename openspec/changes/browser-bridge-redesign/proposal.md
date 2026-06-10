# Proposal: Browser Bridge Redesign

## Why

TeemAI's `browser-agent` skill and the companion `browser-plugin` Chrome extension were built as a monolithic "social operator" stack: bash scripts talk to an HTTP daemon over Native Messaging, while platform business logic (monitor/post/reply) lives inside the extension's `agent-core`. Xiaohongshu support is effectively a stub (feed extraction only), and the bridge requires a multi-step install (Native Host, LaunchAgent, daemon port file).

The reference project `xiaohongshu-skills` demonstrates a cleaner pattern: **Skill → Python CLI → WebSocket Bridge → Extension primitives**, with platform logic in testable CLI modules and anti-bot browser techniques in the extension. Adopting this pattern lets TeemAI reuse proven Xiaohongshu automation, simplify cross-platform setup, and give AI agents clear, enforceable skill boundaries (sub-skills per platform × capability).

## What Changes

- **Replace** HTTP daemon + Native Messaging bridge with a **WebSocket bridge server** (`ws://localhost:9333`) modeled on `xiaohongshu-skills`.
- **Introduce** `skill-cli/` — unified Python CLI (`cli.py`) with `BridgePage` client and per-platform modules (`platforms/xhs/`, `platforms/reddit/`, `platforms/twitter/`).
- **Refactor** `browser-plugin` extension to expose **browser primitives** (navigate, evaluate, click, debugger input, file upload) instead of coarse business commands.
- **Split** the single `browser-agent` skill into a **skill tree**: root router + platform sub-skills (`xhs-auth`, `xhs-explore`, `xhs-publish`, `xhs-interact`, `reddit-engage`).
- **Port** Xiaohongshu Python modules and interceptor/debugger logic from `xiaohongshu-skills` into `browser-plugin/skill-cli/platforms/xhs/`.
- **Deprecate** `scripts/daemon.mjs`, `native-host/`, `browser.sh` Layer 1 (AppleScript tab control), and coarse `send.sh`/`monitor.sh` commands. **BREAKING** for existing `social-operator` workflows that call these scripts directly.
- **Retain** extension-side optional autonomous mode (alarms, LLM fallback, risk scoring) as a separate control path that does not conflict with TeemAI-driven CLI commands.
- **Establish** `browser-plugin` as the single source of truth for skills; sync to `TeemAI/ai-assets/skills/` at build or via symlink.

## Capabilities

### New Capabilities

- `browser-bridge-protocol`: WebSocket bridge server, extension long-connection, CLI short-connection, message schema, exit codes, environment bootstrap (`_ensure_bridge_ready`).
- `browser-bridge-primitives`: Extension-side browser primitive API (navigate, evaluate, click, contenteditable input, debugger trusted events, file upload, DOM stability wait, 404/token diagnostics).
- `skill-cli`: Unified Python CLI entry, `BridgePage` client, platform module layout, auto-start bridge, Chrome launch polling.
- `xhs-platform-cli`: Xiaohongshu subcommands (auth, explore, publish, interact) ported from `xiaohongshu-skills`.
- `reddit-platform-cli`: Reddit subcommands (list-feeds, post-comment, upvote) orchestrated via BridgePage.
- `browser-agent-skills`: Root skill router + sub-skill definitions with enforced CLI-only boundaries and user-confirmation flows.
- `social-operator-bridge`: Updated `social-operator` agent boot, workflows, and `teemai.agent.json` to use `skill-cli` instead of bash daemon scripts.

### Modified Capabilities

- _(none — no existing OpenSpec specs for browser-agent; all capabilities are net-new)_

## Impact

| Area | Impact |
|------|--------|
| `~/work/browser-plugin/` | Major refactor: new `extension-bridge/`, `skill-cli/`, bridge handler in SW; deprecate `native-host/`, `skill/scripts/daemon.mjs` |
| `TeemAI/ai-assets/skills/browser-agent/` | Replaced by synced skill tree from browser-plugin; bash scripts removed |
| `TeemAI/ai-assets/agents/social-operator/` | BOOT.md, workflows, TOOLS.md updated for `cli.py` |
| `openteam.json` / agent registry | social-operator skills list expanded (`xhs-*`, `reddit-engage`) |
| User setup | Simpler: load extension + `uv sync` in skill-cli; no Native Host install |
| Breaking | Existing `send.sh`, `monitor.sh`, `status.sh`, `browser.sh` callers must migrate to `cli.py` |
| Dependencies | Python ≥ 3.11, `uv`, `websockets` in skill-cli; Node native-host no longer required |
