---
name: twitter-explore
description: Twitter/X content discovery and analysis via skill-cli. Trigger for search, timeline, tweet detail, profile tasks.
allowed-tools: Bash
---

# twitter-explore

**Only allowed CLI commands:**

| Command | Purpose |
|---------|---------|
| `cli.py ping-server` | Bridge health |
| `cli.py list-feeds --platform twitter` | Home timeline |
| `cli.py list-feeds --platform twitter --username HANDLE` | User timeline |
| `cli.py search-feeds --platform twitter --keyword QUERY` | Search tweets |
| `cli.py get-feed-detail --platform twitter --url TWEET_URL` | Tweet detail + replies |
| `cli.py user-profile --platform twitter --username HANDLE` | Profile info |

## Search options

| Flag | Values |
|------|--------|
| `--sort-by` | `top` (default), `latest` / `live` |
| `--limit` | Max tweets (default 10) |

## Constraints

- Run `ping-server` first; exit 1 → extension not connected
- Run Twitter CLI commands **sequentially** (shared bridge tab)
- User must be logged into X in Chrome before browsing/search
- Present results as structured summaries: author, text preview, likes, replies, URL

## Workflows

### Home timeline

```bash
python cli.py list-feeds --platform twitter --limit 15
```

### Search tweets

```bash
python cli.py search-feeds --platform twitter --keyword "AI agent" --sort-by top --limit 10
```

### Tweet detail

```bash
python cli.py get-feed-detail --platform twitter --url "https://x.com/user/status/1234567890"
```

### User profile

```bash
python cli.py user-profile --platform twitter --username elonmusk
```

## Analysis tips

- Compare engagement (likes, replies, retweets) across top search results
- Use profile data for account research before engagement
- For batch detail reads, keep intervals between commands to avoid rate limits
