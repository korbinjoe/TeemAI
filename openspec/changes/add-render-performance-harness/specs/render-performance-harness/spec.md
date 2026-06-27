# Capability: Render Performance Harness

The render performance harness provides deterministic browser-based
verification for frontend rendering regressions after code changes. It is an
engineering asset that agents, humans, and CI can run without relying on prompt
judgment.

## ADDED Requirements

### Requirement: Repository-owned render performance verification

The project SHALL provide a render performance harness runnable from package
scripts. The harness SHALL produce a deterministic pass/fail result using
checked-in budgets and baselines.

#### Scenario: Agent runs changed-scope verification

Given a frontend-impacting change has modified tracked files
When an agent runs `npm run perf:render:changed`
Then the harness selects relevant scenarios from the changed-file mapping
And it exits `0` only when all selected scenarios pass hard checks, budgets, and
baseline comparisons
And it writes a machine-readable summary and human-readable report.

#### Scenario: Full render verification

Given a developer wants broad verification
When they run `npm run perf:render`
Then the harness runs the default scenario set
And writes metrics, screenshots, traces, console evidence, and a Markdown
summary under `.perf/render/<run-id>/`.

### Requirement: Isolated fixture state

The harness SHALL create or use isolated fixture state by default and SHALL NOT
depend on or mutate the user's live TeemAI data.

#### Scenario: Isolated local run

Given the harness starts the app server itself
When fixture setup runs
Then `TEEMAI_HOME` points to a run-scoped directory under `.perf/render/<run-id>/home`
And the harness seeds workspaces and missions through real server APIs
And the user's normal `~/.teemai` state is not modified.

### Requirement: Browser metrics and evidence collection

The harness SHALL collect browser-side metrics and artifacts sufficient to
diagnose render regressions.

#### Scenario: Successful scenario run

Given a selected scenario renders successfully
When metric collection completes
Then the scenario artifact directory contains `metrics.json`, `screenshot.png`,
`console.json`, `requests.json`, and a Playwright trace
And the run summary includes user timing, navigation/paint metrics, long tasks,
layout shifts, DOM node count, JS heap metrics, console errors, page errors, and
failed requests.

#### Scenario: Scenario fails

Given a selected scenario exceeds a budget or hits a hard failure
When the harness writes the report
Then the report identifies the failing scenario, metric, observed value, budget
or baseline value, and artifact paths
And a Chrome trace is written for deeper diagnosis unless disabled explicitly.

### Requirement: Multi-mission switching and mode-loop verification

The harness SHALL include scenarios that repeatedly switch across multiple
missions and repeatedly toggle chat/terminal modes so agents can detect
regressions caused by mounted hidden mission instances, terminal restoration,
and accumulated DOM or heap growth.

#### Scenario: Repeated switching across active missions

Given at least four fixture missions exist
And at least two missions are active or receive controlled activity updates
When `mission.multi-active.switch-loop` runs
Then the harness repeatedly switches mission focus across all fixture missions
And records per-switch interaction-to-stable time, p95 latency, long tasks,
DOM node delta, heap delta, console errors, page errors, and failed requests
And the scenario fails if hidden mission instances cause budget or baseline
regressions.

#### Scenario: Chat and terminal mode toggle loop

Given a fixture mission can show both chat and terminal modes
When `mission.mode-toggle.loop` runs
Then the harness repeatedly toggles chat mode to terminal mode and back
And verifies the terminal container is visible, nonblank, and has usable
geometry after each terminal activation
And verifies returning to chat mode reaches the expected ready state.

#### Scenario: Switching away from a terminal-active mission

Given one fixture mission is in terminal mode
And another fixture mission is in chat mode
When `mission.switch-with-terminal-active` runs
Then the harness switches away from and back to the terminal-active mission
And verifies terminal readiness is restored without blank canvas/container,
extra console errors, or excessive interaction-to-stable latency.

### Requirement: Gated frontend instrumentation

Frontend instrumentation SHALL be disabled by default and SHALL add no
production runtime overhead outside render performance mode.

#### Scenario: Normal production build

Given `VITE_RENDER_PERF` is not enabled
When the app renders normally
Then render performance helpers are no-ops
And React Profiler wrappers used only for performance collection are not mounted.

#### Scenario: Render performance mode

Given the harness starts the app with `VITE_RENDER_PERF=true`
When a route or interaction scenario runs
Then route, interaction, and surface-ready marks are recorded
And the harness can read them through browser performance entries or
`window.__renderPerf`.

### Requirement: Scenario selection by changed files

The harness SHALL map changed files to relevant render scenarios and SHALL fall
back conservatively when the impact is ambiguous.

#### Scenario: Terminal-only change

Given only files under `web/components/terminal/**` changed
When `npm run perf:render:changed` runs
Then the terminal scenario, terminal mode-loop scenarios, and core smoke
scenarios run
And unrelated settings-only scenarios are not selected.

#### Scenario: Shared UI or unknown frontend change

Given shared UI, routing, style, or unclassified frontend files changed
When changed-scope verification runs
Then the harness runs the core smoke set at minimum:
`home.initial`, `workspace.initial`, `mission.initial`, and
`mission.switch.warm`.

### Requirement: Explicit baseline updates

Baseline updates SHALL be explicit and reviewable. Normal verification SHALL
NOT modify checked-in baselines.

#### Scenario: Intentional performance change

Given a reviewed change intentionally alters render performance characteristics
When a developer runs `npm run perf:render:baseline`
Then the baseline file is refreshed with the current measured metrics
And the report identifies that a baseline update occurred.

#### Scenario: Ordinary verification

Given an agent runs `npm run perf:render` or `npm run perf:render:changed`
When a metric regresses beyond the allowed threshold
Then the command fails
And the baseline remains unchanged.

### Requirement: Agent execution protocol

The project SHALL include an agent-facing protocol that instructs agents when to
run render performance verification and how to report results.

#### Scenario: Agent completes a UI-impacting task

Given an agent modified frontend rendering, layout, routing, terminal, IDE,
workspace, mission, settings, or WebSocket-driven UI behavior
When the agent verifies the task
Then it follows the render performance verification skill/protocol
And reports impact scope, scenarios run, pass/fail status, key metrics, and
artifact paths for any failure.

### Requirement: Automatic changed-code verification

The project SHALL automatically trigger changed-scope render performance
verification after code-writing agent turns and before local commits, while
deduplicating repeated runs for the same changed-code contents.

#### Scenario: Agent completes a code-writing turn

Given a code-writing agent has the render performance verification skill
And the repository has changed code files
When the agent Stop hook runs
Then the hook computes a fingerprint of the changed code contents
And runs `npm run build:ui` and `npm run perf:render:changed` if that
fingerprint has not already passed
And writes logs under `.perf/auto/`.

#### Scenario: Repeated turn with no new code edits

Given the current changed-code fingerprint already passed automatic render
performance verification
When the agent Stop hook runs again
Then the hook skips without rerunning the expensive harness.

#### Scenario: Local commit gate

Given a developer commits code changes
When the pre-commit hook runs
Then it invokes the same automatic render performance verification wrapper
And blocks the commit if `npm run build:ui` or `npm run perf:render:changed`
fails
And allows the commit immediately if the current changed-code fingerprint has
already passed.

#### Scenario: Non-code change

Given only documentation, OpenSpec text, or other non-code files changed
When the automatic verification hook runs
Then it exits without running the render performance harness.
