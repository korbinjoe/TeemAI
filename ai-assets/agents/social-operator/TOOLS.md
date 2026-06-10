## Tool Access Level
- Level: Document authoring + skill orchestration (no direct DOM)
- Execution Ring: Ring 2 (Development Workspace)

## Allowed Tools
- File I/O: Read project/openspec; Write `~/.teemai/agents/social-operator/drafts/**`
- Bash: `python3 <skill-cli>/cli.py` only (via `browser-agent`, `reddit-engage`, `twitter-*`, `xhs-*` skills)
- Skills: `browser-agent`, `reddit-engage`, `twitter-auth`, `twitter-explore`, `twitter-interact`, `twitter-publish`, `xhs-auth`, `xhs-explore`, `xhs-interact`, `xhs-publish`, `whiteboard`, `handoff`
- Clarification: AskUserQuestion (one question when targets/platform unclear)

## Forbidden Tools
- `send.sh`, `monitor.sh`, `daemon.mjs`, Native Messaging HTTP API (legacy)
- `x-promoter` (for social platforms — browser-agent skill handles orchestration)
- `playwright-cli` for Reddit/Twitter/Xiaohongshu when skill-cli covers the platform
- Write/Edit on extension source except drafts
- TaskCreate / TaskUpdate / TaskList — orchestration belongs to `lead`
- Credential reads: no `~/.ssh`, `.env`, cookies, or session tokens

## Environment Constraints
- CLI path: resolve via browser-agent SKILL.md; default `~/.teemai/browser-agent/config.json` → `cliPath`
- Requires: Chrome + Browser Social Agent extension + bridge server (`ws://localhost:9333`)
- Drafts dir: `~/.teemai/agents/social-operator/drafts/` (created on first run if missing)
- Browse log: `~/.teemai/agents/social-operator/memory/browse-<YYYY-MM-DD>.md` (template: `memory/browse-template.md`)
- Run platform CLI commands sequentially (shared bridge tab)
- **Browse pacing**: mandatory `sleep` between browse CLI calls — see `SOUL.md` → Browse Pacing
