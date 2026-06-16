# Mission Switch Performance

Permanent instrumentation and scoring for workspace mission navigation.

## When to run

Run after any change that touches:

- Mission routing / `ChatPane` LRU cache
- `ChatInstance` mount lifecycle
- `useChatWebSocket` context / resume
- Sidebar mission list
- IDE portal (`RightPanel` / `WebIDEPanel`)
- Server `resumeFromChat` / JSONL replay

## Commands

```bash
# Dev server must be running
npm run dev

# Benchmark + score + baseline regression check
npm run perf:mission-switch

# Options (pass after --)
npm run perf:mission-switch -- --rounds 3 --settle-ms 1200
npm run perf:mission-switch -- --include-cold   # add one full-reload round before warm SPA switches

# Refresh baseline after intentional improvements
npm run perf:mission-switch:baseline

# Skip baseline gate (score only)
npm run perf:mission-switch -- --skip-baseline-check
```

The default benchmark uses **SPA sidebar clicks** (warm LRU path): one initial page load, a warm-up pass, then measured rounds via `[data-mission-id]` clicks. Full page reload per switch (`--include-cold`) only measures cold loads and clears the LRU cache.

## Scoring (0–100)

| Metric | Weight | Excellent | Good | Poor |
|--------|--------|-----------|------|------|
| avg interactive (ms) | 25% | ≤50 | ≤100 | ≤200 |
| p95 total (ms) | 35% | ≤300 | ≤500 | ≤900 |
| p95 ide-ready (ms) | — (informational) | ≤80 | ≤200 | ≤500 |
| avg resume sent (ms) | 15% | ≤150 | ≤350 | ≤600 |
| warm-cache avg replay msgs | 25% | 0 | ≤5 | ≤50 |

Letter grade: A ≥90, B ≥75, C ≥60, D ≥45, F &lt;45

Baseline regression fails when:

- Score drops more than **5 points**, or
- p95 total increases more than **80ms**

`p95 ide-ready` is reported separately and does not fail the baseline gate.

After both `interactive` and `ide-ready` marks, traces finalize in ~50ms (`reason: ide-ready`). **`p95 total` now reflects end-to-end switch completion**, not an artificial 600ms post-interactive delay.

## Trace marks

`start` → `chat-pane-active` → `instance-active` → `interactive` → `ide-ready` → `cwd-ready` → `ws-context-sent` → `ws-resume-sent` → `replay-batch` → `done`

## Manual profiling (browser)

In dev, open console after switching missions:

```js
__missionSwitchPerf.score()
__missionSwitchPerf.dump()
```

## Files

| Path | Role |
|------|------|
| `shared/missionSwitchScore.ts` | Metrics + scoring (shared) |
| `web/contexts/ChatIDEOutletContext.tsx` | Stable IDE column props (no portal remount) |
| `scripts/benchmark-mission-switch.ts` | Automated benchmark |
| `scripts/perf-baselines/mission-switch.json` | Checked-in baseline |
