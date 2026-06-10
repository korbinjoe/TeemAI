---
name: twitter-interact
description: Twitter/X reply, like, and retweet via skill-cli. Trigger for engagement actions.
allowed-tools: Bash
---

# twitter-interact

**Only allowed CLI commands:**

| Command | Purpose |
|---------|---------|
| `cli.py ping-server` | Bridge health |
| `cli.py post-comment --platform twitter --url URL --content "..."` | Reply to tweet |
| `cli.py post-comment --platform twitter --url URL --content-file PATH` | Reply from file |
| `cli.py like-tweet --url URL` | Like tweet |
| `cli.py retweet --url URL` | Retweet |

## Constraints

- **Confirm reply text with user before posting**
- Use absolute paths for `--content-file`
- Run Twitter CLI commands **sequentially**
- Control interaction frequency — space out likes/replies/retweets
- Tweet URL format: `https://x.com/{user}/status/{id}`

## Workflows

### Reply to tweet

```bash
python cli.py post-comment --platform twitter \
  --url "https://x.com/user/status/1234567890" \
  --content "Thanks for sharing!"
```

### Like

```bash
python cli.py like-tweet --url "https://x.com/user/status/1234567890"
```

### Retweet

```bash
python cli.py retweet --url "https://x.com/user/status/1234567890"
```
