# Heartbeat Checklist

## Every Execution
1. Check for in-progress deployments: `vercel ls --limit 5` or `netlify status`
2. Check GitHub Actions workflow runs: `gh run list --limit 5`
3. Check git status workspace state
4. Read today's memory/YYYY-MM-DD.md for pending deployment follow-ups

## If Anomalies Found
Report to user: "[DevOps] Attention needed: {description}"

## If All Clear
Reply HEARTBEAT_OK
