# Command Reference: browser-agent Skill

## Layer 1: browser.sh (Terminal Chrome Control)

### ensure

Launch Chrome if not already running.

```bash
scripts/browser.sh ensure
# → {"running":true,"app":"Google Chrome"}
# → {"running":true,"app":"Google Chrome","launched":true}
```

### goto

Navigate the active tab to a URL or platform home.

```bash
scripts/browser.sh goto --url "https://reddit.com/r/SaaS"
scripts/browser.sh goto --platform reddit
scripts/browser.sh goto --platform twitter
scripts/browser.sh goto --platform xiaohongshu
```

**Platform URL mapping**:

| Platform | Default URL |
|----------|-------------|
| `reddit` | `https://reddit.com` |
| `twitter` | `https://twitter.com` |
| `xiaohongshu` | `https://www.xiaohongshu.com` |

### switch-tab

```bash
scripts/browser.sh switch-tab --index 2
scripts/browser.sh switch-tab --url-pattern "reddit.com/r/SaaS"
```

### list-tabs

```bash
scripts/browser.sh list-tabs
# → [{"window":1,"index":1,"active":true,"url":"...","title":"..."}]
```

### wait-ready

Wait for extension daemon connection.

```bash
scripts/browser.sh wait-ready --timeout 60
# → {"ready":true,"connected":true,"riskLevel":"safe"}
```

---

## Layer 2: Extension Commands

### navigate

Delegates to `browser.sh goto` + `wait-ready` (does not use content script).

```bash
scripts/send.sh navigate --platform reddit
scripts/send.sh navigate --url "https://reddit.com/r/SaaS"
```

### monitor

Auto-navigates to subreddit (Layer 1), waits for page load, then extracts feed (Layer 2).

```bash
scripts/monitor.sh --platform reddit --subreddit SaaS --limit 10
scripts/monitor.sh --platform reddit --subreddit SaaS --skip-nav  # skip Layer 1 nav
```

**Result**:

```json
[
  {
    "postId": "abc123",
    "title": "Looking for a tool to automate API testing",
    "score": 42,
    "valueScore": 8,
    "url": "https://reddit.com/r/SaaS/comments/abc123/"
  }
]
```

### post / reply

When `autoConfirm=true`, `--confirm` is not required.

```bash
scripts/configure.sh --set autoConfirm=true
scripts/send.sh reply --targetId "abc123" --content "..."
scripts/send.sh post --subreddit SaaS --title "..." --content "..."
```

### configure

```bash
scripts/configure.sh --set autoConfirm=true
scripts/configure.sh --set pageLoadDelayMs=3000
scripts/configure.sh --set chromeAppName="Google Chrome"
scripts/configure.sh --set maxPostsPerDay=3
```

Skill-side keys are mirrored to `~/.teemai/browser-agent/config.json`.

### analytics / pause / resume / feedback / generate

Unchanged — see prior sections in this file or `SKILL.md`.
