# Review Report — Workflow Reliability

## Code Review

### Review Scope
- `server/orchestration/WorkflowScheduler.ts` (modified)
- `shared/workflow-types.ts` (modified)
- `server/orchestration/WorkflowEngine.ts` (existing, added `getTask()`)
- `server/__tests__/WorkflowScheduler.test.ts` (existing tests)

### Review Summary
> The three-layer fix (notification queue, watchdog, autoAdvance) is structurally sound and well-scoped. The main risks are: the drain loop fires all queued prompts synchronously without waiting for Lead to process each one, `wokenLeadTasks` grows unboundedly across the scheduler's lifetime, and the L1/L2/L3 test cases listed in tasks.md are **not present** in the actual test file.

---

### Issues Found

#### [P0] Must Fix (affects correctness or reliability)

1. **[L1 — drain fires all prompts without back-pressure]** `WorkflowScheduler.ts:442-446`
   The `drainPendingNotifications` loop sends every queued prompt to Lead via `acpClient.prompt()` in a tight synchronous loop. Each `prompt()` call is fire-and-forget (`.catch` only). After the first prompt, Lead transitions out of `waiting_input` — subsequent prompts in the same drain hit a Lead that is now `running`, meaning they are silently dropped by the ACP layer or cause undefined behavior.
   **Recommendation**: Drain only the first queued prompt per `waiting_input` transition. Keep the rest in the queue for the next idle cycle. Alternatively, merge all queued prompts into a single combined prompt.

2. **[L1 — wokenLeadTasks never cleared]** `WorkflowScheduler.ts:46`
   The `wokenLeadTasks: Set<string>` is append-only — entries are added at line 117 but never removed. For long-lived scheduler instances across many workflows, this is a slow memory leak. More critically, if a task is rejected and re-run (via `rejectTask`), its taskId is already in the set, so the second completion event at line 105 is silently ignored and Lead is never notified.
   **Recommendation**: Remove entries from `wokenLeadTasks` when a task is rejected (status returns to `pending`), and clear the set when a workflow completes/stops.

3. **[Tests — L1/L2/L3 tests are missing]** `server/__tests__/WorkflowScheduler.test.ts`
   The `tasks.md` marks 6 test items as checked off (queue drain, queue bounds, watchdog recovery, watchdog ignore, autoAdvance skip, autoAdvance default). None of these tests exist in `WorkflowScheduler.test.ts`. The test file only covers `waiting_input` inference, `TaskResult` enrichment, deduplication, and `onAgentExited`. The new queue, watchdog, and autoAdvance behaviors have **zero test coverage**.

#### [P1] Suggested Improvements (affects maintainability or robustness)

4. **[L2 — watchdog may duplicate work with normal flow]** `WorkflowScheduler.ts:460-488`
   The watchdog calls `advanceEngine` which starts tasks. If a notification to Lead is in-flight (queued or being processed) and the watchdog fires simultaneously (stale > 90s because Lead took a long time to review), the watchdog may start the same tasks that Lead is about to advance — producing duplicate agent starts. The `markTaskRunning` guard (line 495-498) only prevents starting an already-running task, but two calls to `advanceEngine` between the same ticks could both see the task as `pending`.
   **Recommendation**: Add a per-task locking flag or timestamp before `markTaskRunning` to prevent concurrent `startTask` calls for the same taskId.

5. **[L2 — 90s stale threshold may be too aggressive]** `WorkflowScheduler.ts:32`
   `WATCHDOG_STALE_THRESHOLD_MS = 90_000` (1.5 min). The `updatedAt` timestamp is set when task results are recorded. If Lead is reviewing a complex result (reading diffs, checking artifacts), 90 seconds of "no state change" is expected behavior, not a stall. The watchdog would then start downstream tasks, bypassing Lead review.
   **Recommendation**: Consider 180s or 300s, or track "last Lead notification sent" separately from "last workflow state update" to avoid false positives.

6. **[L3 — autoAdvance + Lead notification race]** `WorkflowScheduler.ts:189-244`
   When `autoAdvance` is true, `advanceEngine` is called at line 193, immediately starting downstream tasks. Then at line 196, the async `collectEnrichedContext` runs and eventually calls `wakeLeadAgent`. If Lead receives the notification and calls `advanceWorkflow`, those downstream tasks are already running — `getReadyTasks` returns empty. This is functionally correct (no harm), but Lead receives a prompt saying "Ready to start: (none)" which is confusing when tasks were just auto-started.
   **Recommendation**: Include a note in the Lead prompt when `autoAdvance` was triggered, e.g., "Tasks were auto-advanced per workflow configuration."

7. **[L1 — queue bound drops oldest without notification]** `WorkflowScheduler.ts:421-422`
   When the queue is full, the oldest entry is silently dropped via `queue.shift()`. The dropped notification represents a task completion or failure event. Lead will never learn about that task's outcome. In a 20-task workflow with a very slow Lead, this could cause Lead to make decisions based on incomplete state.
   **Recommendation**: Log the dropped prompt's task info (not just queue size). Consider merging old entries into a summary rather than dropping.

8. **[Type — autoAdvance backward compatibility]** `shared/workflow-types.ts:22`
   The `autoAdvance?: boolean` field is optional, which is correct for backward compatibility. Existing DAGs without the field default to `undefined`, and the check `taskDef?.autoAdvance` (line 191) is falsy for `undefined`. No issue here — this is confirmed safe.

#### [P2] Nice to Have (polish)

9. **[Watchdog timer not configurable via runtime]** `WorkflowScheduler.ts:456`
   The watchdog interval is set once at construction. In production, ops may want to adjust the interval without restarting. Not urgent, but a `setWatchdogInterval()` method would help.

10. **[clearQueueForChat is public]** `WorkflowScheduler.ts:449`
    `clearQueueForChat` is `public` but only called internally at line 180. If external callers clear the queue, pending task notifications are lost silently. Consider making it `private` or documenting the contract.

11. **[Watchdog logs but doesn't notify Lead]** `WorkflowScheduler.ts:487`
    When the watchdog recovers a stuck workflow by calling `advanceEngine`, it logs but doesn't wake Lead to inform about the recovery. Lead may not realize downstream tasks were started by the watchdog vs. normal flow.

---

### Highlights
- Queue bounding at 20 per chat (line 30) is a sensible default that prevents runaway memory growth
- The `destroy()` method (line 55-60) correctly cleans up the watchdog interval, preventing timer leaks
- The `autoAdvance` check (line 191) is clean — defaults to existing behavior, only fires on explicit `true` + successful completion
- The enriched context fallback (line 219-244) gracefully degrades when context collection fails
- Separation of `wakeLeadAgent` (workflow progress) vs `notifyLead` (direct prompts) keeps responsibilities clear
