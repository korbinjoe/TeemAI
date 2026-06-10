# Reddit Engage Workflow

Reusable workflow for the social-operator agent. See also `agents/social-operator/SOUL.md` for persona and limits.

## Inputs
- `subreddits`: string[] — default: SaaS, SideProject, indiehackers, webdev, programming
- `minValueScore`: number — default 6
- `maxActions`: number — default 3
- `autonomous`: boolean — default false; when true, enable `autoConfirm` and skip user approval

## Steps

1. **Preflight**
   ```bash
   skill/scripts/browser.sh ensure
   skill/scripts/browser.sh wait-ready --timeout 60
   skill/scripts/status.sh
   ```
   - Stop on exit 10 or `riskLevel: critical`

2. **Autonomous setup** (when `autonomous=true`)
   ```bash
   skill/scripts/configure.sh --set autoConfirm=true
   ```

3. **Monitor** — for each subreddit (auto-navigates via Layer 1 + extracts via Layer 2):
   ```bash
   skill/scripts/monitor.sh --platform reddit --subreddit <name> --limit 10
   ```

4. **Merge & rank** — combine results, sort by `valueScore` desc, take top `maxActions`

5. **Draft & execute**
   - Write reply in agent turn (Quality mode) using Bootstrapped Dev persona
   - Autonomous: `skill/scripts/send.sh reply --targetId "<id>" --content "..."`
   - Manual review: dry-run first (no `--confirm`, `autoConfirm=false`), then `--confirm` after approval

6. **Review** — `skill/scripts/analytics.sh --period daily`

## Outputs
- Draft file: `~/.teemai/agents/social-operator/drafts/reddit-engage-<date>.md`
- Whiteboard `artifact` entries for each posted comment URL
