---
name: twitter-publish
description: Twitter/X tweet publishing via skill-cli. Trigger when user wants to post a tweet.
allowed-tools: Bash
---

# twitter-publish

**Only allowed CLI commands:**

| Command | Purpose |
|---------|---------|
| `cli.py ping-server` | Bridge health |
| `cli.py check-twitter-session` | Verify logged in |
| `cli.py post-tweet --content "..."` | Publish tweet |
| `cli.py post-tweet --content-file PATH` | Publish from file |

## Constraints

- **Confirm tweet text with user before posting**
- Use absolute paths for `--content-file`
- Max 280 characters (adapter truncates if needed)
- Run `check-twitter-session` first; exit 1 → user must log in at x.com
- Control posting frequency — avoid rapid consecutive posts

## Workflow

1. Run `ping-server` and `check-twitter-session`
2. Draft tweet text; show user for approval
3. Post:

```bash
python cli.py post-tweet --content "Your approved tweet text here"
```

Or from file:

```bash
python cli.py post-tweet --content-file /absolute/path/to/tweet.txt
```

4. Report success with tweet URL if returned
