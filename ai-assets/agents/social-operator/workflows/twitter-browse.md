# Twitter/X Browse Workflow

Browse-only. For reply/like/retweet use `twitter-interact` in a **separate** invocation. See `SOUL.md` → Browse Pacing.

## Prerequisites

```bash
python3 <cli> ping-server
python3 <cli> check-twitter-session   # or twitter-auth flow; exit 1 → stop
```

## Inputs
- `mode`: `search` | `timeline` | `profile` — default `search`
- `keyword`: string — required when mode=search
- `username`: string — required when mode=profile
- `maxBrowseCommands`: number — default 3 per run

## Steps

1. **Preflight** — ping + session check; check `memory/browse-<today>.md` (Twitter cap ≤8 browse commands/day)

2. **Browse** (pick one path per run; ≤3 CLI calls total):
   ```bash
   # Search
   python3 <cli> search-feeds --platform twitter --keyword "<keyword>" --limit 10
   sleep $((45 + RANDOM % 45))

   # Optional: detail for top 1–2 only
   python3 <cli> get-feed-detail --platform twitter --url "<tweet_url>"
   sleep $((45 + RANDOM % 45))
   ```

3. **Stop** on two consecutive exit 2/4, or if results empty after retry

4. **Summarize** — structured tweet summaries; no auto reply/like

5. **Log** — update `memory/browse-<today>.md` (`twitter_browse_commands: N`)

## Outputs
- Draft file: `~/.teemai/agents/social-operator/drafts/twitter-browse-<date>.md`
