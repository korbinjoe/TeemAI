# Workflow Reliability — Implementation Tasks

## L1: Notification Queue

- [x] Add `autoAdvance?: boolean` field to `WorkflowTask` in `shared/workflow-types.ts`
- [x] Add `getTask(taskId)` helper to `WorkflowEngine`
- [x] Add `pendingNotifications: Map<string, string[]>` to `WorkflowScheduler`
- [x] In `wakeLeadAgent`: when Lead is busy, push prompt to queue (bounded at 20 per chatId)
- [x] In `onActivityChanged`: when Lead transitions to `waiting_input`, drain the queue for that chatId
- [x] Clear queue entries when workflow completes
- [x] **P0 fix**: Merge all queued prompts into single batched message before sending (prevents back-pressure drop)

## L2: Watchdog Timer

- [x] Add `watchdogInterval` field and configurable interval (default 60s)
- [x] On construction: start `setInterval` that scans all running workflows
- [x] For each running workflow: if ready tasks exist AND no task running AND last update >180s ago, trigger recovery
- [x] Add `destroy()` method to clear watchdog interval
- [x] Log all watchdog recoveries
- [x] **P1 fix**: `startingTasks` Set guard prevents concurrent startTask calls for same taskId
- [x] **P1 fix**: Stale threshold increased from 90s to 180s (Lead review takes time)

## L3: autoAdvance Option

- [x] In `recordAndNotifyLead`: after recording result, if task has `autoAdvance=true`, call `advanceEngine` immediately
- [x] Still send notification to Lead (informational, non-blocking)
- [x] Default is `false` — existing behavior preserved for tasks without the flag
- [x] **P1 fix**: Lead prompt includes "auto-advanced" note when autoAdvance triggered

## wokenLeadTasks Lifecycle

- [x] **P0 fix**: `onTaskRejected(taskId)` removes entry so re-notification works after rejection
- [x] **P0 fix**: `clearWokenTasksForWorkflow(engine)` clears all entries when workflow completes/stops
- [x] **P1 fix**: Queue overflow log includes dropped prompt content (first 200 chars)
- [x] **P2 fix**: `clearQueueForChat` made private

## Tests

- [x] Test L1: queue drains as single merged prompt when Lead becomes idle
- [x] Test L1: single queued prompt drains without batching wrapper
- [x] Test L1: queue bounded at 20 entries (oldest dropped)
- [x] Test L1: queue cleared on workflow completion
- [x] Test L2: watchdog recovers stuck workflow (>180s stale)
- [x] Test L2: watchdog ignores recently-updated workflows
- [x] Test L2: watchdog ignores workflows with running tasks
- [x] Test L3: autoAdvance skips Lead review and starts downstream tasks
- [x] Test L3: tasks without autoAdvance still require Lead review
- [x] Test L3: autoAdvance does not trigger on task failure
- [x] Test wokenLeadTasks: cleared on rejection, re-notification works
- [x] Test wokenLeadTasks: cleared when workflow completes
