# Reddit Engage Workflow

Reusable workflow for the social-operator agent. See also `agents/social-operator/SOUL.md` for persona and limits.

## Inputs
- `subreddits`: string[] — default: SaaS, SideProject, indiehackers, webdev, programming
- `minValueScore`: number — default 6
- `maxActions`: number — default 3
- `autonomous`: boolean — default false; when true, post without user approval (use with care)

## Steps

1. **Preflight**
   ```bash
   python3 <cli> ping-server
   ```
   - Stop if `extension_connected` is false

2. **Monitor** — for each subreddit (run sequentially):
   ```bash
   python3 <cli> list-feeds --platform reddit --subreddit <name> --limit 10 --score
   ```

3. **Merge & rank** — combine results, sort by score / relevance, take top `maxActions`

4. **Draft & execute**
   - Write reply in agent turn using Bootstrapped Dev persona
   - Manual review (default): present draft, wait for approval
   - Execute after approval:
     ```bash
     python3 <cli> post-comment --platform reddit --url "<url>" --content-file /abs/path/reply.txt
     ```

5. **Optional detail pass**
   ```bash
   python3 <cli> get-feed-detail --platform reddit --url "<url>"
   ```

## Outputs
- Draft file: `~/.teemai/agents/social-operator/drafts/reddit-engage-<date>.md`
- Whiteboard `artifact` entries for each posted comment URL
