# Tasks: Add Render Performance Harness

## 0. Scaffolding

- [x] 0.1 Create `scripts/render-perf/` with typed modules:
      `runner.ts`, `scenarios.ts`, `fixture.ts`, `metrics.ts`, `budgets.ts`,
      `report.ts`, `server.ts`, and `types.ts`.
- [x] 0.2 Add `scripts/perf-baselines/render/budgets.json`,
      `scripts/perf-baselines/render/baseline.json`, and README explaining when
      baselines may be updated.
- [x] 0.3 Add package scripts:
      `perf:render`, `perf:render:changed`, `perf:render:baseline`.
- [x] 0.4 Ensure generated artifacts under `.perf/` are ignored by git if not
      already covered.

## 1. Frontend instrumentation

- [x] 1.1 Add `web/lib/renderPerf.ts` with no-op-by-default helpers gated by
      `VITE_RENDER_PERF`.
- [x] 1.2 Add app/route marks for shell mounted, workspace route entered,
      workspace route ready, mission route entered, mission interactive, terminal
      ready, IDE ready, and settings ready.
- [x] 1.3 Add optional React Profiler collection for hot surfaces only when
      render perf mode is enabled.
- [x] 1.4 Expose a small browser debug surface, e.g. `window.__renderPerf`, for
      the runner to read marks and profiler samples.

## 2. Fixture and server lifecycle

- [x] 2.1 Implement isolated run home under `.perf/render/<run-id>/home` and set
      `TEEMAI_HOME` for the launched app server.
- [x] 2.2 Implement server start/reuse logic for dev and preview modes, with
      health polling against `/api/health` and `/api/agents`.
- [x] 2.3 Seed fixture state through existing APIs:
      quick-start workspace from current repo, at least four missions, and a
      stable route target set.
- [x] 2.4 Add an optional long-mission fixture path for stress scenarios without
      depending on user data.
- [x] 2.5 Clean up spawned server processes and temporary state unless
      `--keep-artifacts` is passed.

## 3. Metrics collection

- [x] 3.1 Inject `PerformanceObserver` for long tasks, layout shifts, resource
      timing, and user timing before each scenario starts.
- [x] 3.2 Collect navigation, paint, user-timing, React profiler samples, DOM
      node count, heap metrics, console errors, page errors, and failed requests.
- [x] 3.3 Save screenshots and Playwright traces for every scenario.
- [x] 3.4 Save Chrome trace only for failures by default, with `--trace` forcing
      it for all selected scenarios.
- [x] 3.5 Add blank-page and critical-selector assertions so visual smoke
      failures are hard failures.

## 4. Scenario registry

- [x] 4.1 Implement core scenarios:
      `home.initial`, `workspace.initial`, `mission.initial`,
      `mission.switch.warm`.
- [x] 4.2 Implement targeted scenarios:
      `mission.message-stress`, `mission.filter-search`, `terminal.open`,
      `ide.open`, `settings.keys`.
- [x] 4.3 Implement multi-mission loop scenarios:
      `mission.multi-active.switch-loop`, `mission.mode-toggle.loop`, and
      `mission.switch-with-terminal-active`, covering at least four seeded
      missions, repeated mission focus changes, chat/terminal mode toggles,
      terminal restore readiness, heap/DOM deltas, and p95 interaction latency.
- [x] 4.4 Implement `--scenario`, `--tag`, `--changed`, `--repeat`,
      `--mode dev|preview`, `--trace`, `--update-baseline`, and
      `--keep-artifacts` CLI flags.
- [x] 4.5 Implement changed-file mapping from `git diff --name-only` to
      scenarios, with conservative fallback to the core smoke set.

## 5. Budgets and baselines

- [x] 5.1 Define initial budgets for all core scenarios using the existing
      desktop performance report as guidance.
- [x] 5.2 Implement absolute threshold checks, relative baseline regression
      checks, and hard failure checks.
- [x] 5.3 Implement baseline refresh for reviewed intentional changes only:
      `npm run perf:render:baseline`.
- [x] 5.4 Ensure normal verification fails rather than silently updating
      baselines.

## 6. Reporting

- [x] 6.1 Write `summary.json` with run metadata, selected scenarios, mode,
      metrics, budgets, baselines, and artifact paths.
- [x] 6.2 Write `report.md` optimized for agent consumption: conclusion first,
      top failures, top regressions, metrics table, and next diagnostic command.
- [x] 6.3 Ensure nonzero exit codes are reserved for real render/budget failures
      and infrastructure failures are clearly labeled.

## 7. Agent protocol

- [x] 7.1 Add `ai-assets/skills/render-performance-verification/SKILL.md`.
- [x] 7.2 Document trigger rules and the default command sequence for agents.
- [x] 7.3 Update relevant fullstack/UI guardrails to reference the new skill for
      frontend render-impacting changes.
- [x] 7.4 Ensure the final-answer template includes impact scope, scenarios run,
      pass/fail, key metrics, and artifact path on failure.

## 8. Tests and validation

- [x] 8.1 Add unit tests for budget comparison and baseline diff logic.
- [x] 8.2 Add unit tests for changed-file scenario selection.
- [x] 8.3 Run `npm run build:ui`.
- [x] 8.4 Run focused tests for new render-perf modules.
- [x] 8.5 Run smoke harness:
      `npm run perf:render -- --scenario home.initial --scenario workspace.initial`.
- [x] 8.6 Run failure-mode verification by forcing an impossible budget and
      confirming the report and exit code.
- [x] 8.7 Run `openspec validate add-render-performance-harness --strict`.

## 9. Automatic execution

- [x] 9.1 Add an automatic render performance hook script that detects changed
      code files, fingerprints current file contents, and runs
      `npm run build:ui` plus `npm run perf:render:changed` once per new
      fingerprint.
- [x] 9.2 Wire the hook into the `render-performance-verification` skill as a
      Stop hook.
- [x] 9.3 Attach `render-performance-verification` to code-writing agents in
      `teemai.json`.
- [x] 9.4 Reuse the same hook from `.githooks/pre-commit` as a blocking local
      commit gate.
- [x] 9.5 Update Codex hook deduplication and focused tests for the new TeemAI
      hook command.
- [x] 9.6 Validate the automatic hook in disabled/parse mode, run focused tests,
      and rerun OpenSpec validation.
