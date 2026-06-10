---
name: browser-agent
description: >
  Control the Browser Social Agent extension for automated social media operations.
  Two-layer architecture: `browser.sh` (terminal Chrome orchestration) + extension
  commands via `send.sh` (feed extraction, post, reply, analytics).
  Primitives: `browser.sh` (ensure/goto/switch-tab/wait-ready), `status`, `monitor`,
  `post`, `reply`, `analytics`, `navigate`, `configure`.
  Composed primarily by the `social-operator` TeemAI agent.
allowed-tools: Bash
composed-by: social-operator
---

# browser-agent — TeemAI ↔ Browser Social Agent Bridge

This skill orchestrates **two layers**:

```
Layer 1 — Terminal (browser.sh)
  ensure / goto / switch-tab / wait-ready
  → launches user's Chrome, navigates, switches tabs

Layer 2 — Extension (send.sh / monitor.sh)
  monitor / post / reply / upvote / analytics
  → content scripts perform DOM operations on the active page
```

The extension operates in the user's **real browser session** with real cookies, fingerprints, and login state.

## Architecture

```
TeemAI Agent (social-operator)
  → browser-agent skill
    → browser.sh (Layer 1: OS/Chrome control)
    → curl http://127.0.0.1:<port>/api/... (Layer 2: extension)
      → browser-agent-daemon
        ↔ Chrome Native Messaging ↔ Extension service worker
          → Content Script → Reddit/Twitter/Xiaohongshu DOM
```

See `references/communication-protocol.md` for daemon lifecycle and HTTP API details.

## Primitives

| Script | Layer | Description |
|--------|-------|-------------|
| `scripts/browser.sh` | 1 | Chrome launch, navigation, tab control, wait for extension |
| `scripts/status.sh` | 2 | Extension status, connection health, risk level |
| `scripts/send.sh <command>` | 1+2 | Extension commands; `navigate` delegates to `browser.sh` |
| `scripts/monitor.sh` | 1+2 | Auto-navigates to subreddit, extracts feed via extension |
| `scripts/analytics.sh` | 2 | Metrics summary |
| `scripts/configure.sh` | 2 | Extension + local skill settings |

### browser.sh commands

| Command | Description |
|---------|-------------|
| `ensure` | Launch Chrome if not running |
| `activate` | Bring Chrome to foreground |
| `goto --url URL` | Navigate active tab to URL |
| `goto --platform reddit\|twitter\|xiaohongshu` | Navigate to platform home |
| `switch-tab --index N` | Activate tab by 1-based index (macOS) |
| `switch-tab --url-pattern PAT` | Activate tab matching URL substring (macOS) |
| `list-tabs` | List open tabs as JSON (macOS) |
| `wait-ready [--timeout SEC]` | Wait for extension daemon connection |

## Autonomous mode

Enable fully autonomous post/reply (skip dry-run / `--confirm`):

```bash
scripts/configure.sh --set autoConfirm=true
```

Optional tuning:

```bash
scripts/configure.sh --set pageLoadDelayMs=3000
scripts/configure.sh --set chromeAppName="Google Chrome"
```

Local skill config: `~/.teemai/browser-agent/config.json`

## Typical autonomous flow

```bash
# 1. Ensure Chrome + extension ready
scripts/browser.sh ensure
scripts/browser.sh wait-ready

# 2. Navigate to target community
scripts/browser.sh goto --url "https://reddit.com/r/SaaS"

# 3. Monitor feed (auto-navigates if --subreddit given)
scripts/monitor.sh --platform reddit --subreddit SaaS --limit 10

# 4. Reply (auto-confirms when autoConfirm=true)
scripts/send.sh reply --targetId "abc123" --content "Here's what worked for me..."

# 5. Analytics
scripts/analytics.sh --period daily
```

Shorthand navigation via send.sh (delegates to browser.sh):

```bash
scripts/send.sh navigate --url "https://reddit.com/r/SaaS"
scripts/send.sh navigate --platform reddit
```

## Exit codes (send.sh)

| Code | Meaning |
|------|---------|
| 0    | Command executed successfully |
| 10   | Extension/daemon not connected |
| 11   | Dry run — no `--confirm` and `autoConfirm` is false |
| 20   | Risk block or command failed |
| 30   | Command timeout |
| 40   | Invalid command |

## Boundaries

- **Layer 1** uses OS commands (macOS: `open` + AppleScript). Linux has basic `google-chrome` / `xdg-open` support; tab switching is macOS-first.
- **Layer 2** requires Chrome + Browser Social Agent extension + Browser Agent Helper installed.
- **No credential management.** Authentication uses the browser session.
- **Platform scope.** Reddit (v1), Twitter/X and Xiaohongshu (v2).
