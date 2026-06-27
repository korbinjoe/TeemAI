# Proposal: Analyze Desktop Rendering Performance

## Why

Desktop rendering performance is a core product quality issue for TeemAI because
mission switching, long message streams, IDE visibility, terminal mode, and live
agent updates are the highest-frequency surfaces in the app. This change records
a deep diagnostic pass over the Electron/Vite/React renderer without changing
runtime behavior.

## Scope

- Inspect renderer architecture, mission switching, message rendering, WebSocket
  update flow, git status subscriptions, terminal/xterm lifecycle, and bundle
  output.
- Run existing build, focused tests, mission-switch benchmark, and a headless
  browser runtime probe.
- Produce actionable findings with impact scope and recommended next steps.

## Non-Goals

- No product code changes.
- No schema/API contract changes.
- No shipped runtime behavior changes.

## Deliverables

- `report.md` with measured results, bottlenecks, and prioritized recommendations.
- `tasks.md` tracking audit execution.
- A minimal spec delta documenting the performance-analysis artifact requirement.
