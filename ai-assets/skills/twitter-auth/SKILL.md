---
name: twitter-auth
description: Twitter/X session check via skill-cli. Trigger when user asks about Twitter login status.
allowed-tools: Bash
---

# twitter-auth

**Only allowed CLI commands:**

| Command | Purpose |
|---------|---------|
| `cli.py ping-server` | Bridge health |
| `cli.py check-twitter-session` | Check if logged into X |

## Constraints

- Twitter/X has no programmatic login via CLI — user must log in manually in Chrome
- Run `ping-server` first; extension must be connected

## Workflow

### Check session

```bash
python cli.py check-twitter-session
```

Output:
- `loggedIn: true` → ready for explore/publish/interact
- `loggedIn: false` → instruct user to open `https://x.com` in Chrome and log in, then retry

### Login guidance (manual)

1. Open Chrome with the Browser Social Agent extension enabled
2. Navigate to `https://x.com/login`
3. Complete login (email/phone + 2FA if required)
4. Re-run `check-twitter-session`
