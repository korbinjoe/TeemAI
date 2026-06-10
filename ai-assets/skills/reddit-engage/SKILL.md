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

## Constraints

- Use absolute paths for `--content-file`
- Confirm reply text with user before posting
- Run `ping-server` first; exit 1 → extension not connected
- Run Reddit CLI commands sequentially (shared bridge tab)
