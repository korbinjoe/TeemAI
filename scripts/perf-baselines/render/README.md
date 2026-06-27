# Render Performance Baselines

`budgets.json` contains hard render-performance budgets. `baseline.json` stores
reviewed local baseline metrics used for relative regression checks.

Normal verification commands must not update baselines:

```bash
npm run perf:render
npm run perf:render:changed
```

Refresh the baseline only after reviewing an intentional render-performance
change:

```bash
npm run perf:render:baseline
```

Baseline runs should use a quiet machine and the same mode used by the team for
review. Keep generated `.perf/render/**` artifacts out of commits.
