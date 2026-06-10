# Heartbeat Checklist

Browse-only run — **no posting, liking, or upvoting**. See `SOUL.md` → Browse Pacing.

## Daily (user timezone, default 09:00 via TeemAI cron)

1. `python3 <cli> ping-server` — abort if `extension_connected` is false
2. Check `memory/browse-<YYYY-MM-DD>.md` — skip if Reddit daily `list-feeds` cap (4) already reached
3. **Rotate subreddits** — scan **2 only** per heartbeat (not all 5):
   - Pool: `SaaS`, `SideProject`, `indiehackers`, `webdev`, `programming`
   - Index: `day_of_year % 5` → pick `pool[i]` and `pool[(i+1) % 5]`
4. For each subreddit (sequential, with pacing):
   ```bash
   python3 <cli> list-feeds --platform reddit --subreddit <name> --limit 10 --score
   sleep $((90 + RANDOM % 90))   # 90–180s before next subreddit
   ```
5. Append browse counts to `memory/browse-<YYYY-MM-DD>.md` (`reddit_list_feeds: N`)
6. Produce daily review markdown in `drafts/` (candidates + recommended actions, **no auto post**)
7. Do **not** run `get-feed-detail` on heartbeat — use list summaries only

## If Anomalies Found

- Bridge offline → write `constraint` on whiteboard; skip monitor/post steps
- Repeated CLI timeout (exit 4) or business error (exit 2) on browse → write `constraint`; stop further browse commands today
- Zero candidates across both subreddits → still HEARTBEAT_OK; note "quiet day"

## If All Clear

Reply HEARTBEAT_OK with one-line summary (subreddits scanned, candidate count, bridge status)
