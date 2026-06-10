# Reddit Engage Workflow

Reusable workflow for the social-operator agent. See `SOUL.md` for persona, browse pacing, and engage limits.

## Inputs
- `subreddits`: string[] — default: SaaS, SideProject, indiehackers, webdev, programming
- `minValueScore`: number — default 6
- `maxActions`: number — default 3
- `maxSubredditsPerRun`: number — default 3 (do not scan entire default list in one run)
- `autonomous`: boolean — default false; when true, post without user approval (use with care)

## Steps

1. **Preflight**
   ```bash
   python3 <cli> ping-server
   ```
   - Stop if `extension_connected` is false
   - Check `memory/browse-<today>.md` for daily Reddit cap

2. **Monitor** — for each subreddit, up to `maxSubredditsPerRun` (sequential with pacing):
   ```bash
   python3 <cli> list-feeds --platform reddit --subreddit <name> --limit 10 --score
   sleep $((60 + RANDOM % 60))   # 60–120s before next subreddit
   ```

3. **Merge & rank** — combine results, sort by score / relevance, take top `maxActions`

4. **Optional detail pass** — only for top 1–2 draft candidates (not every candidate):
   ```bash
   sleep $((60 + RANDOM % 60))
   python3 <cli> get-feed-detail --platform reddit --url "<url>"
   ```
   - Max 2 `get-feed-detail` per run

5. **Draft & execute**
   - If browse + engage in same run: `sleep 300` after last browse command before `post-comment`
   - Write reply in agent turn using Bootstrapped Dev persona
   - Manual review (default): present draft, wait for approval
   - Execute after approval (≥15 min between multiple posts if `maxActions` > 1):
     ```bash
     python3 <cli> post-comment --platform reddit --url "<url>" --content-file /abs/path/reply.txt
     ```

6. **Log** — update `memory/browse-<today>.md` with command counts

## Outputs
- Draft file: `~/.teemai/agents/social-operator/drafts/reddit-engage-<date>.md`
- Whiteboard `artifact` entries for each posted comment URL
