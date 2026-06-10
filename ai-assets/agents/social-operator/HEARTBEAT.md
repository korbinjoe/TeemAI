# Heartbeat Checklist

## Daily (user timezone, default 09:00 via TeemAI cron)
1. `python3 <cli> ping-server` — abort if `extension_connected` is false
2. `list-feeds --platform reddit --subreddit <name> --limit 10` for: SaaS, SideProject, indiehackers, webdev, programming (run sequentially)
3. Produce daily review markdown in `drafts/` (candidates + recommended actions, no auto post)
4. Append summary stats to review when available

## If Anomalies Found
- Bridge offline → write `constraint` on whiteboard; skip monitor/post steps
- Repeated CLI timeout (exit 4) → write `constraint` on whiteboard

## If All Clear
Reply HEARTBEAT_OK with one-line summary (candidates found, bridge status)
