# Skill ↔ Browser Extension Communication

```
TeemAI Agent → SKILL.md → python skill-cli/cli.py
  → BridgePage (WebSocket short-connect)
    → bridge_server.py (localhost:9333)
      → Extension SW (WebSocket long-connect)
        → Tab primitives (navigate, evaluate, click, debugger)
        → Content script actions (platform_action, CSP-safe)
```

## WebSocket protocol

**Extension handshake:** `{ "role": "extension" }`

**CLI request:** `{ "role": "cli", "method": "navigate", "params": { "url": "..." } }`

**Platform action (content script, CSP-safe):** `{ "role": "cli", "method": "platform_action", "params": { "action": "extractFeed", "platform": "reddit", "payload": { "limit": 10 } } }`

**Response:** `{ "id": "<uuid>", "result": ... }` or `{ "id": "<uuid>", "error": "..." }`

**Health:** `{ "role": "cli", "method": "ping_server" }` → `{ "result": { "extension_connected": bool } }`

## Components

| Component | Location | Role |
|-----------|----------|------|
| bridge_server | `extension-bridge/bridge_server.py` | Local WS relay (not in extension) |
| skill-cli | `skill-cli/cli.py` | Platform business + JSON output |
| Extension SW | `src/background/bridge-handler.ts` | WS client + primitive execution |
| Content scripts | `src/content/reddit.ts`, etc. | ISOLATED-world DOM extraction |

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Extension not connected / not logged in |
| 2 | Business error |
| 4 | Timeout |

## Bootstrap

CLI `_ensure_bridge_ready()` starts bridge_server if down, opens Chrome if extension disconnected, polls 20s.
