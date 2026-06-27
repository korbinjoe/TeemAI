# Proposal: Add Render Performance Harness

## Why

TeemAI agents frequently modify React renderer code, workspace navigation,
mission surfaces, terminal/IDE panels, and WebSocket-driven UI state. Today an
agent can run unit tests and some targeted benchmarks, but it does not have a
standard post-change gate that answers whether the changed page still renders
quickly, remains visually nonblank, and avoided obvious browser-side rendering
regressions.

The existing `perf:mission-switch` script is useful, but it is narrow: it
measures one mission-switch path against one checked-in baseline and relies on a
running dev server with user data. We need a broader, repeatable render
performance harness that can be run by humans, CI, and agents after frontend
changes.

## What Changes

- Add a repository-owned render performance harness under `scripts/render-perf/`.
- Add a small, gated frontend instrumentation layer under `web/lib/renderPerf.ts`
  and component-level marks around the hottest render surfaces.
- Add scenario definitions for initial render, route/mission navigation,
  interaction render, and stress cases.
- Add performance budgets and baseline comparison files under
  `scripts/perf-baselines/render/`.
- Add package scripts:
  - `perf:render`
  - `perf:render:changed`
  - `perf:render:baseline`
- Add an agent-facing skill/protocol asset that tells agents when to run the
  harness, how to select scenarios, and how to summarize failures.
- Add an automatic verification hook that runs the changed-scope harness after
  code-writing agent turns and a matching pre-commit gate for local commits.

## Goals

1. Make render performance verification self-service for agents after UI code
   changes.
2. Keep pass/fail logic inside deterministic engineering code, not prompt-only
   judgment.
3. Produce actionable artifacts: metrics JSON, Markdown summary, screenshots,
   Playwright trace, Chrome trace, console errors, and network/error evidence.
4. Support both quick local verification and stricter baseline refresh flows.
5. Reuse current project dependencies (`playwright`, `tsx`, Vite, existing
   mission-switch scoring patterns) without adding a new dependency.

## Non-Goals

- No external monitoring service.
- No Lighthouse-only scoring gate. Lighthouse can be optional evidence, but not
  the source of truth for app-specific render regressions.
- No production runtime overhead when `VITE_RENDER_PERF` is not enabled.
- No replacement of existing unit tests, `perf:mission-switch`, or UI visual
  verification skills.
- No dependence on the user's live `~/.teemai` data for baseline scenarios.

## Impact Scope

- `package.json`: add render perf scripts.
- `scripts/render-perf/**`: new runner, scenarios, metrics collectors,
  comparison, reports, and fixture setup.
- `scripts/perf-baselines/render/**`: baseline and budget JSON.
- `web/lib/renderPerf.ts`: gated user-timing helpers and optional React
  Profiler collector.
- Hot UI surfaces: small instrumentation-only edits in workspace, chat,
  terminal, IDE, settings, and home/dashboard components.
- `ai-assets/skills/render-performance-verification/SKILL.md`: agent execution
  protocol.
- `ai-assets/hooks/render-perf-auto.sh`: automatic Stop/pre-commit verification
  wrapper with changed-code fingerprint deduplication.
- `teemai.json`: attach render performance verification to code-writing agents.
- `.githooks/pre-commit`: run the same automatic render performance gate before
  commits.
- `openspec/changes/add-render-performance-harness/**`: proposal, design,
  tasks, and spec delta.

## Risks

| Risk | Mitigation |
|------|------------|
| Browser perf numbers are noisy | Use medians/p95 over repeat runs, warm-up passes, relative baseline tolerances, and hard failure checks for white screens/errors. |
| Harness becomes expensive and agents skip it | Provide `perf:render:changed` for scoped scenarios and reserve full matrix for CI or explicit verification. |
| Automatic hook repeats the same expensive run | Fingerprint changed code contents and skip when the current fingerprint already passed. |
| Fixtures diverge from real app behavior | Seed real TeemAI workspaces/missions through existing server APIs inside an isolated `TEEMAI_HOME`; avoid mocks in browser paths. |
| Instrumentation adds runtime cost | Gate all collection and React Profiler hooks behind `VITE_RENDER_PERF=true`; production default is no-op. |
| Failure reports are too vague for agents to fix | Always persist scenario artifacts and include the top failing budget, changed metric, screenshot path, trace path, and console/network errors. |

## Success Criteria

- `npm run perf:render:changed` can be run by an agent after frontend changes
  and returns a deterministic pass/fail result.
- `npm run perf:render -- --scenario workspace.initial --trace` writes a
  complete artifact directory with trace, screenshot, metrics JSON, and Markdown
  report.
- Baseline comparison catches a representative regression in route ready time,
  long tasks, or interaction-to-stable time.
- The harness can run with an isolated temporary `TEEMAI_HOME`, create its own
  workspace/missions, and avoid modifying the user's real data.
- Documentation tells agents exactly when to run the quick harness, when to run
  the full harness, and how to report failures.
- Code-writing agents automatically run changed-scope render verification after
  changed code fingerprints and local commits block on an unverified or failing
  render performance gate.
