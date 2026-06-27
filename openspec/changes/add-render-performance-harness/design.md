# Design: Render Performance Harness

## Context

TeemAI is a Vite/React desktop-oriented web renderer with Electron packaging and
a local Express server. Existing performance assets include:

- `scripts/benchmark-mission-switch.ts`, which uses Playwright and browser
  marks exposed by `web/lib/missionSwitchPerf.ts`.
- `scripts/perf-baselines/mission-switch.json`, a checked-in baseline.
- Existing Playwright dependency in `devDependencies`.
- UI verification skills that already require real-browser checks.

The new harness generalizes this pattern from one mission-switch benchmark into
a scenario-based browser render verification system.

## Architecture

```
package scripts
  ├─ npm run perf:render
  ├─ npm run perf:render:changed
  └─ npm run perf:render:baseline

scripts/render-perf/
  ├─ runner.ts              # CLI entry point and Playwright orchestration
  ├─ scenarios.ts           # Scenario registry and changed-file mapping
  ├─ fixture.ts             # Isolated TEEMAI_HOME + real API setup
  ├─ metrics.ts             # Browser metrics extraction
  ├─ budgets.ts             # Budget + baseline comparison
  ├─ report.ts              # JSON/Markdown report generation
  ├─ server.ts              # Start/reuse dev or preview server
  └─ types.ts

scripts/perf-baselines/render/
  ├─ budgets.json
  ├─ baseline.json
  └─ README.md

web/lib/renderPerf.ts
  ├─ mark()
  ├─ measure()
  ├─ routeStart()/routeReady()
  ├─ interactionStart()/interactionReady()
  └─ optional React Profiler callback

ai-assets/skills/render-performance-verification/SKILL.md
  └─ Agent protocol for when/how to run and report the harness
```

## Decisions

### D1: Engineering harness is the source of truth

The pass/fail decision lives in `scripts/render-perf`, budgets, and baselines.
The agent skill only decides when to run the harness, selects relevant
scenarios, reads reports, and summarizes evidence.

Rationale: render performance should be reproducible by humans and CI. A
prompt-only skill would make regressions subjective and hard to audit.

### D2: Use Playwright and Chrome DevTools Protocol directly

The runner uses the existing `playwright` dependency and opens Chromium in
headless mode by default. For each scenario it collects:

- user timing marks/measures
- navigation timing
- paint entries
- layout shift entries
- long task entries
- JS heap and DOM node counts through CDP
- console errors and page errors
- request failures
- screenshot
- Playwright trace
- optional Chrome trace for deep investigation

Rationale: this provides actionable local artifacts without adding Lighthouse or
an external service. Lighthouse may be added later as an optional reporter.

### D3: Keep frontend instrumentation tiny and gated

`web/lib/renderPerf.ts` exports no-op helpers unless
`import.meta.env.VITE_RENDER_PERF === 'true'` or dev mode explicitly enables
collection. Hot surfaces call the helpers around stable lifecycle points:

- app shell mounted
- workspace route entered
- mission route entered
- mission row click started
- chat instance interactive
- terminal view ready
- IDE/file tree ready
- settings modal ready

React Profiler wrapping is optional and only mounted when render perf mode is
enabled.

Rationale: user-timing marks are cheap, stable, and easy for a browser runner to
read. Profiler data is useful but must not become production overhead.

### D4: Scenarios are first-class data, not test code scattered across files

`scenarios.ts` declares each scenario with:

```ts
interface RenderPerfScenario {
  id: string
  label: string
  tags: string[]
  route: (fixture: RenderPerfFixture) => string
  changedFileGlobs: string[]
  run: (ctx: ScenarioContext) => Promise<void>
  ready: (ctx: ScenarioContext) => Promise<void>
  budgets: string[]
  repeats?: number
  traceByDefault?: boolean
}
```

Initial scenario set:

| Scenario | Purpose |
|----------|---------|
| `home.initial` | Home/dashboard initial route render. |
| `workspace.initial` | Workspace route boot with mission sidebar and main pane. |
| `mission.initial` | Direct mission URL cold render and chat pane readiness. |
| `mission.switch.warm` | Sidebar mission switching, reusing existing marks where possible. |
| `mission.multi-active.switch-loop` | Repeated switching across multiple active/running missions while WebSocket state updates continue. |
| `mission.mode-toggle.loop` | Repeated chat/terminal mode toggles inside one mission. |
| `mission.switch-with-terminal-active` | Switch between missions where one or more cached missions are in terminal mode. |
| `mission.message-stress` | Long mission render with seeded messages or replay-safe fixture. |
| `mission.filter-search` | Search/filter interaction to stable UI. |
| `terminal.open` | Message mode to terminal view and terminal container readiness. |
| `ide.open` | IDE panel/file tree/editor visibility and nonblank dimensions. |
| `settings.keys` | Settings modal/panel render path for credential provider UI. |

The three loop scenarios are required because they exercise a different failure
mode than initial render:

- mounted but hidden mission instances retaining subscriptions, timers, terminal
  state, or layout observers
- xterm/terminal container resize and WebGL/canvas readiness after a mission is
  backgrounded and restored
- route and view-mode state churn when an agent repeatedly alternates mission
  focus and chat/terminal presentation
- DOM/heap growth across loops rather than a single navigation

Minimum loop shape:

```text
seed 4 missions
mark 2 missions as active/running through fixture state or controlled WS events
warm all missions once
repeat 5 rounds:
  mission A: chat mode → terminal mode → chat mode
  mission B: terminal mode → switch away while terminal mounted
  mission C: chat mode with message stream/update event
  mission D: archived/idle or low-activity comparison path
  switch A → B → C → D → A
collect per-step interactionToStable, long tasks, DOM nodes, heap delta, errors
```

Pass/fail checks for these loop scenarios include absolute per-step
interaction-to-stable time, p95 across the loop, total long-task time, heap delta
from first to last round, DOM node delta, terminal nonblank geometry after
restore, and zero console/page errors.

### D5: Use isolated fixture state by default

The runner creates a temporary home directory:

```
.perf/render/<run-id>/home
```

It starts the app with `TEEMAI_HOME` pointed at that directory, lets normal
startup seed assets, then creates a workspace using existing APIs:

- `POST /api/workspaces/quick-start` with the current repo as `repoPath`
- `POST /api/workspaces/:id/chats` to create multiple missions
- optional fixture seeding for long mission data through a test-only helper
  script, not by touching user data

Rationale: baselines should not depend on the user's current mission count or
live activity. The browser still exercises real app routes and real server
state.

### D6: Changed-file selection is conservative

`perf:render:changed` maps changed files to scenarios. Examples:

- `web/components/chat/**`, `web/hooks/useAgent*`, `web/hooks/useChat*`:
  mission scenarios, including multi-active switching and mode-toggle loops.
- `web/components/workspace/**`, `web/pages/Workspace*`, `web/App.tsx`:
  workspace and mission switch scenarios.
- `web/components/terminal/**`: terminal scenario plus
  `mission.mode-toggle.loop` and `mission.switch-with-terminal-active`.
- `web/components/ide/**`: IDE scenario.
- `web/components/settings/**`: settings scenarios.
- shared UI, routing, CSS, theme, or unknown frontend changes: run the core
  smoke set (`home.initial`, `workspace.initial`, `mission.initial`,
  `mission.switch.warm`).

If the mapping is ambiguous, the harness runs more scenarios rather than fewer.

### D7: Budgets combine absolute thresholds and relative regression checks

`budgets.json` contains hard thresholds:

```json
{
  "workspace.initial": {
    "appRouteReadyMs": { "max": 1800, "maxRegressionPct": 15 },
    "longTaskCount": { "max": 3 },
    "longTaskTotalMs": { "max": 220, "maxRegressionPct": 25 },
    "documentElementCount": { "max": 8000, "maxRegressionPct": 20 },
    "jsHeapUsedMb": { "max": 180, "maxRegressionPct": 20 },
    "consoleErrors": { "max": 0 },
    "pageErrors": { "max": 0 }
  }
}
```

Comparison policy:

- hard failures: page error, console error, request failure for app assets, blank
  screenshot, missing ready selector, missing performance mark
- budget failures: metric exceeds hard max
- regression failures: metric regresses beyond allowed percentage from baseline
- flaky samples: scenario repeats and uses median plus p95 where relevant

### D8: Artifacts are built for agent diagnosis

Each run writes:

```
.perf/render/<run-id>/
  summary.json
  report.md
  scenarios/<scenario-id>/
    metrics.json
    screenshot.png
    playwright-trace.zip
    chrome-trace.json   # only when requested or scenario failed
    console.json
    requests.json
```

The Markdown report begins with pass/fail, top failures, and next action. It
does not require an agent to inspect raw trace files for the common path.

### D9: Baseline updates are explicit and reviewable

`npm run perf:render:baseline` refreshes
`scripts/perf-baselines/render/baseline.json` after a reviewed intentional
change. Normal verification never updates baselines.

Rationale: agents should not silently normalize regressions.

### D10: Automatic execution runs at agent turn end and pre-commit

`ai-assets/hooks/render-perf-auto.sh` is the shared automatic wrapper for both
agent Stop hooks and Git pre-commit. It detects changed code files from the
current repository, fingerprints the current file contents, and runs:

```bash
npm run build:ui
npm run perf:render:changed
```

The fingerprint is stored under `~/.teemai/perf-auto/` and only updated after a
successful run. If the same changed-code fingerprint is seen again, the hook
skips immediately. This prevents repeated expensive verification during
multi-turn work while still rerunning after any further code edit.

Agent Stop-hook mode is non-blocking for hook infrastructure: it records logs
under `.perf/auto/`, writes a war-room progress/open-question entry when the
whiteboard helper is available, and exits `0` even on harness failure. The
pre-commit mode is blocking and exits nonzero on build or render performance
failure.

The hook is attached through the `render-performance-verification` skill so the
same source-of-truth hook configuration is used by Claude-style settings and
Codex `.codex/hooks.json` generation. `ConfigCompiler` treats
`render-perf-auto.sh` as a TeemAI-owned hook command for deduplication and
cleanup, matching existing whiteboard Stop-hook behavior.

### D10: Budget live document elements, keep CDP DOM counters as diagnostics

The harness budgets `documentElementCount`, measured from the current page
document, for DOM-size regressions. It still records CDP
`Memory.getDOMCounters()` values such as `domNodes` and
`domJsEventListeners`, but treats them as diagnostic evidence rather than the
default budget oracle.

Rationale: CDP DOM counters can include detached nodes waiting for garbage
collection, which is useful leak evidence but too noisy as the primary
render-size budget in a multi-scenario browser run.

### D11: Self-evolution is proposed, not silently applied

When harness runs expose a likely harness issue, such as a scenario selector
bug, noisy metric, missing changed-file mapping, or bad budget oracle, the
harness should emit evidence that can be turned into a reviewed code change.
It must not silently update baselines or loosen budgets during ordinary
verification.

Rationale: autonomous agents need a closed loop, but performance gates must
remain auditable. Self-improvement should produce concrete patches and
regression tests, not hidden state changes.

## Agent Skill Protocol

Add `ai-assets/skills/render-performance-verification/SKILL.md` with:

- trigger rules:
  - changed React components/hooks/routes/layout/CSS
  - changed WebSocket/API behavior that affects UI rendering
  - changed terminal, IDE, mission, workspace, settings, or navigation surfaces
- workflow:
  1. Run `npm run build:ui` unless already done in the same task.
  2. Run `npm run perf:render:changed`.
  3. If failed, rerun the failing scenario with `--trace`.
  4. Read `.perf/render/<run-id>/report.md`.
  5. Fix regressions or report the evidence and limitation.
- final-answer format:
  - impact scope
  - scenarios run
  - pass/fail
  - top metrics vs baseline
  - artifact path if failed

## Implementation Notes

- Prefer production preview mode for baseline runs. Quick changed runs can reuse
  a dev server if one is already running, but should label the mode in reports.
- Use `wait-on` or direct health polling for server readiness, matching existing
  scripts.
- Inject `PerformanceObserver` with `page.addInitScript()` before navigation so
  long tasks and layout shifts are captured from the start.
- Use `page.tracing.start({ screenshots: true, snapshots: true, sources: true })`
  for Playwright trace.
- Use CDP `Performance.getMetrics` and `Memory.getDOMCounters` where available.
- Treat `requestfailed`, `pageerror`, and unexpected `console.error` as
  first-class failure evidence.
- Do not add a global visual diff dependency in the first version. Use screenshot
  blankness and selector/geometry assertions for smoke failures.

## Verification Plan

- Unit tests for budget comparison, changed-file scenario selection, summary
  aggregation, and report generation.
- A smoke run against isolated fixture state:
  `npm run perf:render -- --scenario home.initial --scenario workspace.initial`.
- A failure-mode test by temporarily setting an impossible budget and confirming
  process exit code `1` plus a useful report.
- Baseline update dry run:
  `npm run perf:render:baseline -- --dry-run`.
- OpenSpec validation.
