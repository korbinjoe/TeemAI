# Tasks: Lead as Judge

## Phase 1: Type & Engine Foundation

- [x] Add `rejectionFeedback`, `rejectCount` fields to `WorkflowTaskState` in `shared/workflow-types.ts`
- [x] Add `maxRejects` field to `WorkflowTask` in `shared/workflow-types.ts`
- [x] Implement `WorkflowEngine.rejectTask()` — reset completed task to pending, store feedback, increment rejectCount, emit `task-rejected` event
- [x] Initialize `rejectCount: 0` in WorkflowEngine constructor alongside existing task state init

## Phase 2: Enriched Context Collection

- [x] Add `collectEnrichedContext()` to `WorkflowScheduler` — collect git diff stat, artifact snippets (80 lines), modified files from TaskResult
- [x] Call `collectEnrichedContext()` in `recordAndNotifyLead()` before building Lead prompt
- [x] Update `buildLeadPrompt()` — include git diff stat, modified files list, artifact previews, and judgment instructions with three-choice action block

## Phase 3: Reject API & Script

- [x] Add `POST /api/workflow/:workflowId/tasks/:taskId/reject` endpoint — calls `engine.rejectTask()`, returns rejectCount/maxRejects or error if cap reached
- [x] Create `ai-assets/skills/workflow/scripts/reject-task.sh` — shell wrapper for reject API
- [x] Update `WorkflowScheduler.startTask()` — prepend `rejectionFeedback` to agent prompt when launching a previously rejected task
- [x] Wire `task-rejected` event in scheduler — auto-start the rejected task after reset (via advanceWorkflow call in route handler)

## Phase 4: Lead Prompt Update

- [x] Update `ai-assets/agents/lead/SOUL.md` — replace "Quick review → advance" with structured judgment protocol (review context → judge → advance/reject/escalate)
- [x] Add `reject-task.sh` to Lead's Core Skills section

## Phase 5: Verification

- [x] Test: rejectTask() resets completed task to pending with feedback
- [x] Test: rejectTask() emits task-rejected event
- [x] Test: reaching maxRejects cap returns cap_reached and preserves completed status
- [x] Test: default maxRejects of 2 allows two rejections then caps
- [x] Test: rejected task becomes ready again in DAG, downstream tasks become unready
- [x] Test: rejecting non-completed task returns cap_reached
