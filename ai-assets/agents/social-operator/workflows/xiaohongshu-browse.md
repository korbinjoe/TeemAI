# Xiaohongshu Browse Workflow

Browse-only. For interact/publish use `xhs-interact` / `xhs-publish` in a **separate** invocation after ≥5 min cooldown. See `SOUL.md` → Browse Pacing.

## Prerequisites

```bash
python3 <cli> ping-server
python3 <cli> check-login    # exit 1 → stop, prompt xhs-auth
python3 <cli> risk-report    # optional; medium/high → stop unless user overrides
```

## Inputs
- `keyword`: string — search term (one per run)
- `maxDetails`: number — default 3 (hard max per batch)
- `loadComments`: boolean — default false on browse-only runs

## Steps

1. **Preflight** — ping + login + risk-report; check `memory/browse-<today>.md` (XHS detail cap ≤6/day)

2. **Search** (one keyword per invocation):
   ```bash
   python3 <cli> search-feeds --keyword "<keyword>" --limit 10
   ```

3. **Detail batch** — pick top N notes; max 3 per batch with mandatory pacing:
   ```bash
   python3 <cli> get-feed-detail --feed-id ID1 --xsec-token T1 && \
   python3 <cli> get-feed-detail --feed-id ID2 --xsec-token T2 && \
   python3 <cli> get-feed-detail --feed-id ID3 --xsec-token T3 && \
   sleep $((10 + RANDOM % 10))
   ```
   - Do not start a second batch in the same run
   - On 扫码 / 404 / 不可访问 → stop, write `constraint`, report to user

4. **Summarize** — present candidates in markdown; no auto comment/like

5. **Log** — update `memory/browse-<today>.md` (`xhs_get_feed_detail: N`)

## Outputs
- Draft file: `~/.teemai/agents/social-operator/drafts/xhs-browse-<date>.md`
