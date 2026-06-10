# Heartbeat Checklist

## Daily (user timezone, default 09:00 via TeemAI cron)
1. `status.sh` — abort if disconnected or critical risk
2. `monitor.sh --platform reddit` for default subreddits: SaaS, SideProject, indiehackers, webdev, programming (limit 10 each)
3. Produce daily review markdown in `drafts/` (candidates + recommended actions, NO auto `--confirm`)
4. `analytics.sh --period daily` — append stats to review

## If Anomalies Found
- `riskLevel` critical → `send.sh pause`; notify user
- Repeated exit 30 (timeout) → write `constraint` on whiteboard
- Exit 10 (offline) → write `constraint`; skip monitor/post steps

## If All Clear
Reply HEARTBEAT_OK with one-line stats (posts/comments today, risk level)
