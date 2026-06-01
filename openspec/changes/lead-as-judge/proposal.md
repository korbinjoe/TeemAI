# Proposal: Lead as Judge

## Summary

Upgrade Lead from a blind router to an informed judge in the DAG workflow loop.
When a task agent completes, Lead receives enriched context (modified files,
artifact snippets, git diff stats) and can either **advance** or **reject with
feedback**. No server-side hard rules — all judgment is LLM-driven.

## Motivation

Currently, when a workflow task completes, the WorkflowScheduler records the
result and wakes Lead with a text summary. Lead's only real option is to call
`advance-workflow.sh` — it has no ability to verify deliverables and no
mechanism to reject subpar work.

Problems this causes:

1. **No quality gate** — a task agent that outputs "done" with no actual code
   changes gets advanced just like one that did real work
2. **No feedback loop** — when a task agent produces incomplete output, the
   only path is full failure + retry with the same instructions
3. **Wasted downstream work** — bad output from task A flows into task B
   unchecked, compounding errors

The Lead agent already receives workflow progress notifications and makes
advance/retry decisions. It just lacks the **information** and **tools** to
make those decisions well.

## Goals

1. Lead receives enriched task completion context: modified files list,
   git diff stat, artifact file snippets, and test results (if available)
2. Lead can **reject** a completed task with structured feedback, causing
   the task to re-run with that feedback prepended to the agent's prompt
3. Lead's judgment is pure LLM — no server-side acceptance criteria schema
4. Reject count is capped per task to prevent infinite loops
5. No changes to the DAG JSON format submitted by Lead

## Non-Goals

- Server-side hard rules or acceptance criteria schema on WorkflowTask
- Automated test running triggered by the scheduler
- Changing how Lead dispatches DAGs (create-workflow.sh stays the same)
- Adding new UI surfaces for rejection history

## Approach

### 1. Enrich the Lead wake-up prompt

`WorkflowScheduler.buildLeadPrompt()` currently includes only task status and
a one-line summary. Enrich it with:

- `git diff --stat` for the task agent's working tree changes
- List of files in the `artifacts` array from `TaskResult`
- First 80 lines of key artifact files (e.g., `review.md`, `design.md`)
- Snippet of test output if tests were run

This gives Lead enough signal to judge without reading every file.

### 2. Add reject-task capability

New shell script `reject-task.sh` and corresponding API endpoint:

```
POST /api/workflow/:workflowId/tasks/:taskId/reject
Body: { feedback: string }
```

Server-side behavior:
- Reset task status from `completed` → `pending`
- Store feedback in `WorkflowTaskState.rejectionFeedback`
- Increment `WorkflowTaskState.rejectCount`
- When the task restarts, prepend feedback to the agent's prompt

### 3. Add rejection cap

`WorkflowTask` gets an optional `maxRejects` field (default: 2). After
reaching the cap, Lead must either advance (accept as-is) or escalate to the
user via `open_question` on the war-room. Prevents infinite reject loops.

### 4. Update Lead's SOUL.md

Replace the current "Quick review → advance" pattern with a structured
judgment protocol:

- Review enriched context (diff stats, artifact snippets)
- Three choices: **advance** / **reject with feedback** / **escalate to user**
- Judgment criteria guidance (not hard rules): did files change? does the
  summary match the deliverables clause? are there obvious gaps?

## Risks

| Risk | Mitigation |
|------|-----------|
| Lead misjudges — rejects valid work | maxRejects cap (default 2) prevents infinite loops; escalation path to user |
| Lead misjudges — approves bad work | Same as current behavior; downstream reviewer agents catch quality issues |
| Enriched prompt too large | Cap artifact snippets at 80 lines; use diff stat not full diff |
| Reject loop wastes compute | maxRejects cap + cost tracking in rejection history |
| Task agent ignores feedback | Feedback is prepended to prompt as a system-level instruction block |

## Impact

### Files Modified

- `server/orchestration/WorkflowScheduler.ts` — enrich `buildLeadPrompt()`, add `rejectTask()` method
- `server/orchestration/WorkflowEngine.ts` — add `rejectTask()` state transition
- `shared/workflow-types.ts` — add `rejectionFeedback`, `rejectCount`, `maxRejects` fields
- `ai-assets/agents/lead/SOUL.md` — update workflow progress handling protocol
- `ai-assets/skills/workflow/scripts/reject-task.sh` — new script

### Potentially Affected Features

- Workflow DAG execution flow (core change)
- Lead agent behavior on workflow notifications (core change)
- Task agent prompt construction (minor — feedback prepend)

### No Changes To

- DAG creation format (create-workflow.sh unchanged)
- WorkflowRegistry lifecycle
- Database schema
- Frontend/UI
