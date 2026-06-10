---
name: reddit-engage
description: Reddit monitoring and engagement via skill-cli. Trigger for Reddit reply/monitor/upvote tasks.
allowed-tools: Bash
---

# reddit-engage

**Only allowed CLI commands:**

| Command | Purpose |
|---------|---------|
| `cli.py ping-server` | Bridge health |
| `cli.py list-feeds --platform reddit --subreddit NAME` | Monitor subreddit |
| `cli.py list-feeds --platform reddit --subreddit NAME --score` | Scored feed |
| `cli.py search-feeds --platform reddit --keyword QUERY` | Search Reddit (default sort: top, window: month) |
| `cli.py search-feeds --platform reddit --keyword QUERY --subreddit NAME` | Search within subreddit |
| `cli.py get-feed-detail --platform reddit --url POST_URL` | Post detail + comments |
| `cli.py post-comment --platform reddit --url URL --content-file PATH` | Reply (confirm first) |
| `cli.py upvote --platform reddit --url URL` | Upvote |

## Reddit search options

| Flag | Values |
|------|--------|
| `--sort-by` | `top` (default), `new`, `relevance`, `comments` |
| `--publish-time` | `day`, `week`, `month` (default), `year`, `all` |
| `--limit` | Max posts (default 10) |
| `--score` | Add 0–10 relevance score |

## Browse pacing (social-operator — mandatory)

Enforced by agent `SOUL.md`. Summary:

- ≤3 `list-feeds` / `search-feeds` per invocation; ≤2 `get-feed-detail`
- `sleep $((60 + RANDOM % 60))` between browse commands
- ≤4 `list-feeds` per day (tracked in `memory/browse-<date>.md`)
- `sleep 300` between last browse and first `post-comment` in same session
- ≥15 min between multiple engage commands: `sleep $((900 + RANDOM % 300))`

## Constraints

- Use absolute paths for `--content-file`
- Confirm reply text with user before posting
- Run `ping-server` first; exit 1 → extension not connected
- Run Reddit CLI commands sequentially (shared bridge tab)
