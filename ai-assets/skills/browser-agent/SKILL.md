---
name: browser-agent
description: >
  Root router for Browser Social Agent skills. All browser automation MUST use
  `python skill-cli/cli.py` only — never bash send.sh/monitor.sh or HTTP daemon.
allowed-tools: Bash
composed-by: social-operator
---

# browser-agent — Skill Router

Route user intent to platform sub-skills. **Only execution path:**

```bash
python <skill-cli>/cli.py <subcommand> [args]
```

Resolve CLI path: `$BROWSER_SKILL_CLI`, `~/.teemai/browser-agent/config.json` → `cliPath`, or `browser-plugin/skill-cli/cli.py`.

## Intent routing

| Intent | Sub-skill |
|--------|-----------|
| Xiaohongshu login | `xhs-auth` |
| Xiaohongshu search/browse | `xhs-explore` |
| Xiaohongshu publish | `xhs-publish` |
| Xiaohongshu comment/like | `xhs-interact` |
| Reddit monitor/reply | `reddit-engage` |
| Twitter/X session check | `twitter-auth` |
| Twitter/X search/browse/analyze | `twitter-explore` |
| Twitter/X publish | `twitter-publish` |
| Twitter/X reply/like/retweet | `twitter-interact` |

## Bootstrap

```bash
python cli.py ping-server
# extension_connected: true required before social actions
```

## Forbidden

- `send.sh`, `monitor.sh`, `daemon.mjs`, Native Messaging HTTP API
- MCP browser tools for covered platforms

See `references/bridge-protocol.md` for Skill ↔ extension communication.
