---
name: render-performance-verification
description: >
  Run TeemAI render performance self-verification after frontend, route,
  mission, terminal, IDE, settings, layout, CSS, or WebSocket-driven UI changes.
allowed-tools: Bash
hooks:
  Stop:
    - command: bash {HOOKS_DIR}/render-perf-auto.sh --hook
      timeout: 1200
---

# Render Performance Verification

Use this skill after UI-impacting work where render speed, mission switching,
terminal restoration, or route readiness could regress.

This skill also installs an automatic Stop hook. At the end of an agent turn,
the hook detects changed code files, fingerprints their current contents, and
runs `npm run build:ui` plus `npm run perf:render:changed` once for each new
fingerprint. Set `TEEMAI_RENDER_PERF_AUTO=0` to disable it locally.

## Trigger

Run this for changes under:

- `web/components/**`
- `web/hooks/useChat*`, `web/hooks/useAgent*`, `web/hooks/useWorkspace*`
- `web/layouts/**`, `web/pages/**`, `web/App.tsx`
- `web/**/*.css` or theme/layout files
- server/WebSocket/API behavior that changes UI rendering or live mission state

## Workflow

1. Run the normal build gate unless it already passed in the same task:

   ```bash
   npm run build:ui
   ```

2. Run changed-scope render verification:

   ```bash
   npm run perf:render:changed
   ```

3. If a scenario fails, rerun the failing scenario with trace artifacts:

   ```bash
   npm run perf:render -- --scenario <scenario-id> --trace --keep-artifacts
   ```

4. Read `.perf/render/<run-id>/report.md` and inspect the first failing
   scenario's `metrics.json`, screenshot, and trace path.

5. Fix the regression and rerun the relevant scenario or `perf:render:changed`.

## Harness Self-Check

If the failure evidence points to the harness itself, treat it as a harness
regression and fix it before trusting the result. Common signs:

- selector strict-mode errors or missing selectors after a UI label changed
- a metric that is known to include detached or garbage-collection-sensitive
  browser state
- a changed-file mapping that misses an obviously impacted surface
- a scenario that flakes while screenshots, console, network, and interaction
  metrics are otherwise healthy

Do not bypass the scenario or update baselines for these cases. Patch the
harness, add or update the focused test when practical, then rerun the failing
scenario and `npm run perf:render:changed`.

## Reporting

In the final answer include:

- impact scope
- scenarios run
- pass/fail
- key metrics versus baseline when available
- artifact path for any failure

Never update render baselines during ordinary verification. Only run
`npm run perf:render:baseline` after an intentional performance change has been
reviewed.
