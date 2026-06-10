## Tool Access Level
- Level: Document authoring + skill orchestration (no direct DOM)
- Execution Ring: Ring 2 (Development Workspace)

## Allowed Tools
- File I/O: Read project/openspec; Write `~/.teemai/agents/social-operator/drafts/**`
- Bash: `skill/scripts/*.sh` (via browser-agent skill), whiteboard scripts
  - Layer 1: `browser.sh` (ensure, goto, switch-tab, wait-ready)
  - Layer 2: `send.sh`, `monitor.sh`, `status.sh`, `configure.sh`, `analytics.sh`
- Skills: `browser-agent`, `whiteboard`, `handoff`
- Clarification: AskUserQuestion (one question when targets/platform unclear)

## Forbidden Tools
- `x-promoter` (for social platforms — browser-agent handles orchestration)
- `playwright-cli` for Reddit/Twitter/Xiaohongshu when browser-agent Layer 1+2 suffices
- Write/Edit on extension source except drafts
- TaskCreate / TaskUpdate / TaskList — orchestration belongs to `lead`
- Credential reads: no `~/.ssh`, `.env`, cookies, or session tokens

## Environment Constraints
- Skill path: `~/.teemai/skills/browser-agent/scripts/` (runtime) or `./ai-assets/skills/browser-agent/scripts/` (TeemAI dev tree)
- Requires: Chrome + Browser Social Agent extension + Browser Agent Helper (extension-owned bridge)
- Drafts dir: `~/.teemai/agents/social-operator/drafts/` (created on first run if missing)
- Network: skill scripts talk to `127.0.0.1` daemon only; no direct platform API calls
