# Design: Browser Bridge Redesign

## Context

### Current state (TeemAI + browser-plugin)

```
TeemAI Agent (social-operator)
  → browser-agent skill (bash)
    → browser.sh          # Layer 1: macOS AppleScript / open Chrome
    → send.sh / monitor.sh
      → curl HTTP POST → daemon.mjs (~/.teemai/browser-agent/daemon.port)
        ↔ Native Messaging (stdin/stdout) ↔ Chrome extension service worker
          → agent-core.ts (business logic: monitor/post/reply + LLM + risk)
            → content scripts (DOM actions)
```

Pain points:

- **Install friction**: Native Host registration, Browser Agent Helper LaunchAgent, random HTTP port file.
- **Logic in wrong layer**: Platform operations (`monitor`, `post`, `reply`) are coarse extension commands; Xiaohongshu adapter is feed-extraction only.
- **Skill boundaries weak**: Single `browser-agent` skill with `send.sh reply` — AI cannot enforce platform-specific constraints (e.g. `feed_id` + `xsec_token` pairing).
- **Dual source drift**: `TeemAI/ai-assets/skills/browser-agent/` and `browser-plugin/skill/` diverge.

### Reference state (xiaohongshu-skills)

```
AI Agent
  → SKILL.md (sub-skill router)
    → python scripts/cli.py <subcommand>
      → BridgePage._call(method, params)
        → WebSocket short-connect ws://localhost:9333
          → bridge_server.py routes to extension (long-connect)
            → background.js executes primitives (navigate/evaluate/debugger click)
```

Proven for Xiaohongshu: auth, search, detail, comment, publish (with anti-bot navigation and CDP trusted input).

### Stakeholders

- **social-operator** agent — primary consumer; Reddit + Xiaohongshu workflows.
- **End users** — must keep real-browser login; simpler setup than Native Host.
- **browser-plugin maintainers** — single repo owns extension + CLI + skills.

## Goals / Non-Goals

**Goals:**

1. Skill ↔ extension communication via **WebSocket bridge** (port 9333 default), no Native Messaging for TeemAI path.
2. Extension exposes **browser primitives**; platform business logic lives in **Python CLI**.
3. Xiaohongshu capabilities at parity with `xiaohongshu-skills` via module port.
4. Skill tree with enforceable CLI-only boundaries per platform × capability.
5. `browser-plugin` as source of truth; sync skills into `TeemAI/ai-assets/skills/`.
6. Preserve optional extension **autonomous mode** (alarms/LLM) without conflicting with CLI-driven control.

**Non-Goals:**

- Replacing Playwright-based `x-promoter` skill (separate use case).
- Official Xiaohongshu/Reddit/Twitter APIs.
- Credential storage or password management.
- Windows/Linux parity for deprecated AppleScript paths (bridge replaces them).
- Removing extension UI (popup/options) in this change.

---

## How Skill Communicates with the Browser Extension

This section is the core communication model.

### End-to-end call chain

```mermaid
sequenceDiagram
    participant Agent as TeemAI Agent
    participant Skill as SKILL.md sub-skill
    participant CLI as skill-cli/cli.py
    participant Page as BridgePage client
    participant Bridge as bridge_server.py<br/>ws://127.0.0.1:9333
    participant SW as Extension SW<br/>bridge-handler
    participant Tab as Browser Tab<br/>MAIN world / debugger

    Agent->>Skill: natural language intent
    Skill->>CLI: python cli.py search-feeds --keyword 露营
    CLI->>CLI: _ensure_bridge_ready()
    CLI->>Page: page.navigate(url); page.evaluate(...)
    Page->>Bridge: WS connect (role=cli, one message)
    Bridge->>SW: forward { id, method, params }
    SW->>Tab: execute primitive
    Tab-->>SW: result
    SW-->>Bridge: { id, result }
    Bridge-->>Page: JSON response
    Page-->>CLI: Python values
    CLI-->>Agent: stdout JSON + exit code
```

**Key property**: The Skill layer never talks to the extension directly. It only invokes `cli.py`. The CLI is the sole programmatic bridge between AI and browser.

### Layer responsibilities

| Layer | Location | Talks to | Responsibility |
|-------|----------|----------|----------------|
| **Skill** | `skills/*/SKILL.md` | Bash → `cli.py` only | Intent routing, user confirmation, forbidden tools list |
| **CLI + business** | `skill-cli/` | `BridgePage` | Platform workflows: URLs, selectors, sleeps, JSON output |
| **BridgePage client** | `skill-cli/bridge/page.py` | WebSocket | One method = one WS round-trip |
| **Bridge server** | `extension-bridge/bridge_server.py` | Extension WS + CLI WS | Route by `role`, correlate `id` |
| **Extension SW** | `src/background/bridge-handler.ts` | Tab APIs, debugger | Execute primitives, no platform publish logic |
| **Content / MAIN** | injected scripts | DOM | evaluate, interceptor events |

### WebSocket protocol

**Port**: `9333` default; overridable via `--port` or `BROWSER_BRIDGE_PORT` env.

**Extension handshake** (persistent connection):

```json
{ "role": "extension" }
```

**CLI request** (short connection — connect, send one message, receive one reply, disconnect):

```json
{
  "role": "cli",
  "method": "navigate",
  "params": { "url": "https://www.xiaohongshu.com/explore" }
}
```

Bridge assigns `id` (UUID) before forwarding to extension:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "method": "navigate",
  "params": { "url": "..." }
}
```

**Success response**:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "result": null
}
```

**Error response**:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "error": "Extension 未连接"
}
```

**Health probe** (no extension forward):

```json
{ "role": "cli", "method": "ping_server" }
→ { "result": { "extension_connected": true } }
```

**Timeout**: 90s per CLI command (configurable); bridge cancels pending future on extension disconnect.

### Primitive methods (extension implements)

| Method | Purpose |
|--------|---------|
| `navigate` | Tab navigation; same-origin `location.href` when already on platform domain |
| `wait_for_load` | `tabs.onUpdated` complete |
| `wait_dom_stable` | Poll DOM node count / scroll height |
| `evaluate` | `scripting.executeScript` world MAIN |
| `has_element` / `wait_for_selector` | DOM presence |
| `click_element` | Synthetic click or debugger trusted click |
| `input_text` / `input_content_editable` | Form fill; execCommand for editors |
| `set_file_input` | debugger `DOM.setFileInputFiles` |
| `scroll_by` / `dispatch_wheel_event` | Human-like scroll |
| `get_cookies` | `chrome.cookies.getAll` |
| `screenshot_element` | `captureVisibleTab` |
| `get_404_diagnostics` | interceptor + webRequest 302 buffer |
| `analyze_risk_control` | In-page fingerprint probe |

Platform modules compose these — e.g. `post-comment` in `platforms/xhs/comment.py`:

1. `navigate(make_feed_detail_url(feed_id, xsec_token))`
2. `wait_dom_stable()`
3. `click_element(COMMENT_TRIGGER)`
4. `input_content_editable(COMMENT_INPUT, content)`
5. `click_element(COMMENT_SUBMIT)`

### Environment bootstrap (`_ensure_bridge_ready`)

Before any CLI subcommand:

```
1. BridgePage.ping_server()
   └─ if bridge not running → subprocess.Popen bridge_server.py (detached)
2. ping_server.extension_connected == false
   └─ subprocess: open -a "Google Chrome" (platform-specific launcher)
   └─ poll ping_server up to 20s
3. if still false → exit 1 with JSON error "extension not connected"
```

Skill scripts and agents rely on exit code `1` to prompt user: load unpacked extension from `browser-plugin/dist/`.

### Exit codes (CLI → Skill → Agent)

| Code | Meaning | Agent action |
|------|---------|--------------|
| 0 | Success | Present JSON result |
| 1 | Not logged in / extension not connected | Prompt install/login |
| 2 | Business error (element not found, etc.) | Report error field |
| 3 | Risk block (platform or extension limiter) | Back off, notify user |
| 4 | Timeout | Retry or simplify request |

### Control mode: TeemAI vs autonomous

Extension stores `controlMode: 'teemai' | 'autonomous'` (default `'teemai'`).

| Mode | Who drives actions | Path |
|------|-------------------|------|
| `teemai` | CLI via bridge | Skill → cli.py → bridge → SW |
| `autonomous` | Extension alarms + LLM | SW internal scheduler → primitives directly |

When `controlMode === 'teemai'`, autonomous scheduler MUST NOT enqueue post/reply/upvote. Bridge commands always allowed.

### Comparison: old vs new path

| Step | Old (browser-agent) | New (browser-bridge) |
|------|---------------------|----------------------|
| Skill invokes | `scripts/send.sh reply ...` | `python skill-cli/cli.py post-comment ...` |
| Transport | HTTP POST `/api/command` | WebSocket `{ role: cli, method }` |
| Port discovery | Read `~/.teemai/.../daemon.port` | Fixed/default 9333 or env |
| Extension link | Native Messaging stdin | Extension WS to bridge_server |
| Business logic | `agent-core.ts` switch cases | `platforms/xhs/comment.py` |
| Navigation | `browser.sh goto` (OS) + extension tab | `navigate` primitive (extension) |
| Xiaohongshu | `extractFeed` only | Full xhs module port |

---

## Decisions

### D1: WebSocket bridge over HTTP + Native Messaging

**Choice**: Adopt `xiaohongshu-skills` bridge_server pattern.

**Rationale**: Eliminates Native Host install, LaunchAgent, port file race; extension connects outbound to localhost (works through MV3 service worker); CLI short-connect is simple to debug with `websocat`.

**Alternative rejected**: Keep HTTP daemon — extra hop, duplicate protocol definitions, harder for Python CLI to consume than WS.

### D2: Python CLI as execution layer

**Choice**: `skill-cli/` with Python 3.11+, `uv`, port xhs modules from reference repo.

**Rationale**: Proven xhs codebase; dataclass types; `BridgePage` already matches CDP interface; easier unit tests than bash+node.

**Alternative rejected**: TypeScript CLI in browser-plugin — would require rewriting all xhs Python business logic.

### D3: Extension = primitives only for TeemAI path

**Choice**: Move `monitor`/`post`/`reply` out of `agent-core.ts` dispatch; keep risk/frequency as optional gates callable from CLI via `configure` primitive or pre-check commands.

**Rationale**: Single place for selectors and URLs; Skill sub-commands map 1:1 to testable functions.

**Alternative rejected**: Keep coarse extension commands — perpetuates weak XHS support and untestable TS business logic.

### D4: Skill tree split

**Choice**: Root `browser-agent` router + `xhs-*` + `reddit-engage` sub-skills (mirror xiaohongshu-skills).

**Rationale**: Each SKILL.md lists allowed CLI subcommands; reduces AI tool misuse.

### D5: Source of truth in browser-plugin

**Choice**: Develop in `~/work/browser-plugin`; sync script copies `skills/` → `TeemAI/ai-assets/skills/`.

**Rationale**: Extension + CLI + skills co-evolve; avoids current dual-folder drift.

### D6: Deprecation period for bash scripts

**Choice**: Phase 0–1 ship bridge + CLI alongside old daemon; Phase 3 remove bash scripts with CHANGELOG **BREAKING** note.

**Rationale**: Allows social-operator workflow migration without hard cutover day one.

---

## Repository layout (target)

```
browser-plugin/
├── src/                           # Chrome extension
│   ├── background/
│   │   ├── bridge-handler.ts      # NEW: WS client + command router
│   │   └── index.ts               # wire bridge; gate autonomous mode
│   ├── lib/bridge/
│   │   ├── primitives.ts          # navigate, evaluate, click, ...
│   │   ├── navigation.ts          # same-origin strategy
│   │   └── debugger.ts            # trusted input
│   └── content/
│       └── interceptor.ts         # port from xhs extension
├── extension-bridge/
│   └── bridge_server.py           # fork from xiaohongshu-skills
├── skill-cli/
│   ├── cli.py
│   ├── bridge/page.py             # BridgePage
│   ├── platforms/
│   │   ├── xhs/                   # port from xiaohongshu-skills/scripts/xhs
│   │   ├── reddit/
│   │   └── twitter/
│   └── pyproject.toml
├── skills/                        # synced to TeemAI
│   ├── browser-agent/SKILL.md
│   ├── xhs-auth/SKILL.md
│   ├── xhs-explore/SKILL.md
│   ├── xhs-publish/SKILL.md
│   ├── xhs-interact/SKILL.md
│   └── reddit-engage/SKILL.md
└── agents/social-operator/        # updated BOOT, workflows

TeemAI/
├── ai-assets/skills/              # copy/sync from browser-plugin/skills
└── scripts/sync-browser-skills.sh # optional CI step
```

---

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| MV3 service worker disconnects WS | Extension auto-reconnect + `chrome.alarms` keepalive (xhs pattern) |
| Port 9333 conflict | `--port` flag + config file; CLI reads env |
| Breaking social-operator users | Deprecation window; BOOT.md detects old vs new bridge |
| Reddit rewrite delays XHS value | Phase 1 ships XHS first; Reddit stub wraps old adapter temporarily |
| Two repos out of sync | Mandatory sync script in browser-plugin `npm run build:skills` |
| Platform DOM breakage | Centralize selectors per platform module; version tag in extension |

---

## Migration Plan

### Phase 0 — Bridge foundation (week 1)

- Add `extension-bridge/bridge_server.py` to browser-plugin
- Add `bridge-handler.ts` + primitive subset in extension
- Add `skill-cli` with `ping-server`, `BridgePage`
- Keep old daemon; document both in README

### Phase 1 — Xiaohongshu port (week 2)

- Copy `platforms/xhs/*` from xiaohongshu-skills
- Port interceptor + debugger into extension
- Add `xhs-*` skills; sync to TeemAI
- social-operator XHS workflow uses `cli.py`

### Phase 2 — Reddit CLI (week 3)

- Implement `platforms/reddit/*`
- `reddit-engage` skill; update reddit workflow md

### Phase 3 — Cleanup (week 4)

- Remove `native-host/`, `daemon.mjs`, bash skill scripts
- Update CHANGELOG **BREAKING**
- Remove deprecated paths from TeemAI ai-assets

**Rollback**: Revert to previous extension build + bash scripts tag; bridge_server is additive until Phase 3.

---

## Open Questions

1. Should `bridge_server.py` live in browser-plugin or ship as part of TeemAI `ai-assets` for users who only clone TeemAI?
2. Default `controlMode` for existing extension users — force `teemai` or preserve `autonomous` if already configured?
3. Reddit Phase 2: full parity with current `agent-core` monitor scoring, or minimal list-feeds + reply first?
