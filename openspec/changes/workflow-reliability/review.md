# Review Report — Workflow Reliability (10 commits, HEAD~10..HEAD)

## Code Review

### Review Scope
- `server/orchestration/WorkflowEngine.ts` — DAG execution engine, state persistence, timers
- `server/orchestration/WorkflowScheduler.ts` — Task scheduling, Lead wake-up, notification queue, watchdog
- `server/__tests__/WorkflowScheduler.test.ts` — Vitest test suite for scheduler
- `server/routes/agent/expertRoutes.ts` — HTTP API for expert agents (start/stop/handoff/SSE)
- `server/routes/workflow/workflowRoutes.ts` — HTTP API for workflow CRUD
- `server/runtime/ConfigCompiler.ts` — Agent CLI config compilation (Claude + Codex)
- `server/ws/ExpertDirectInput.ts` — Direct user input routing
- `server/ws/ExpertHandler.ts` — Central WebSocket + HTTP handler
- `server/ws/ExpertLifecycle.ts` — Expert spawn, ACP init, stream wiring

### Review Summary
> The three-layer reliability fix (notification queue, watchdog, autoAdvance) is structurally sound and well-tested for the scheduler. However, there are 3 P0 issues (SSE resource leak, workflow ID collision, unhandled JSON.parse), multiple P1 race conditions (Codex global file TOCTOU, watchdog double-advance), and significant test coverage gaps outside the scheduler module. The notification queue drain was improved to merge prompts (fixing prior P0 #1), and `wokenLeadTasks` cleanup was added (fixing prior P0 #2).

---

### Issues Found

#### [P0] Must Fix (affects correctness, security, or stability)

1. **[SSE resource leak]** `expertRoutes.ts:244-273`
   The `/api/expert/events` SSE endpoint subscribes to `store.onActivityChange` (line 258) and starts a `setInterval` heartbeat (line 265), but if `res.writeHead` throws (e.g., headers already sent), the `req.on('close')` cleanup listener is never registered. Both the activity subscription and heartbeat interval leak permanently.
   **Fix**: Register the `req.on('close')` listener **before** `writeHead`, or wrap `writeHead` in try-catch with explicit cleanup.

2. **[Workflow ID collision]** `workflowRoutes.ts:14-18`
   ```ts
   const rand = Math.random().toString(36).slice(2, 6)
   ```
   Only ~1M combinations in 4 chars. Under concurrent workflow creation (Lead dispatching multiple workflows in the same ms), collisions will overwrite existing workflow state. Use `crypto.randomUUID()` or `crypto.randomBytes(4).toString('hex')`.

3. **[Unhandled JSON.parse in dispatch chain]** `ExpertLifecycle.ts:262-264`
   ```ts
   const parentChain: string[] = process.env.OPENTEAM_DISPATCH_CHAIN
     ? JSON.parse(process.env.OPENTEAM_DISPATCH_CHAIN)
     : []
   ```
   If `OPENTEAM_DISPATCH_CHAIN` contains malformed JSON, this throws. It's inside `handleStart`'s try-catch (line 88) so the error is caught, but the error message is cryptic and the expert start fails with no useful diagnostic. Wrap in its own try-catch to produce a meaningful error and fall back to `[agentId]`.

#### [P1] Suggested Improvements (affects maintainability, performance, or robustness)

4. **[Race condition: Codex global file TOCTOU]** `ConfigCompiler.ts:330-349`
   `compileForCodex` reads/writes `~/.codex/AGENTS.override.md` — a global file shared across all codex agents. Concurrent compiles create a TOCTOU race where the second agent overwrites the first agent's prompt injection. Same pattern for `.codex/hooks.json` (lines 371-389).
   **Fix**: Add a file-level mutex (e.g., `async-lock`) or use atomic compare-and-write with flock.

5. **[Watchdog can double-advance]** `WorkflowScheduler.ts:484-512`
   `watchdogScan` calls `advanceEngine` for stale workflows, but `advanceEngine` doesn't check `startingTasks` (unlike `startTask` which does at line 516). If the watchdog fires while a Lead-driven advance is in-flight, `handleStart` could be called twice for the same task.
   **Fix**: Add `if (this.startingTasks.has(task.taskId)) continue` guard inside `advanceEngine`.

6. **[help-signal false positives]** `WorkflowScheduler.ts:126-134`
   Signals include `'error:'` and `'failed to'`. A log line like `"Error handling completed"` or `"Agent failed to find any issues"` would be misclassified as a help request, marking the task as **failed** instead of **completed**.
   **Fix**: Require first-person markers ("I encountered", "I'm blocked") or use a more specific pattern. At minimum, exclude lines that don't contain first-person pronouns.

7. **[EventEmitter init in fromCheckpoint]** `WorkflowEngine.ts:55-63`
   ```ts
   const engine = Object.create(WorkflowEngine.prototype) as WorkflowEngine
   EventEmitter.call(engine)
   ```
   Calling `EventEmitter` as a plain function on a bare object relies on internal Node.js implementation details. Fragile across Node versions.
   **Fix**: Use `Object.assign(Object.create(WorkflowEngine.prototype), new EventEmitter())` or a private constructor pattern.

8. **[Empty EXPERT_CONNECTION_ID in env file]** `ConfigCompiler.ts:244, 553`
   When `context.connectionId` is undefined, `env.EXPERT_CONNECTION_ID = ''` is written to the env file as `export EXPERT_CONNECTION_ID=""`. Downstream scripts get an empty string rather than undefined.
   **Fix**: Omit the key from the env file when empty, or use a sentinel like `UNSET`.

9. **[DIAG log noise on every start]** `expertRoutes.ts:106-108`
   `log.warn('[DIAG] getConnectionWs returned undefined')` fires on every `/api/expert/start` call when using API connection. Should be `log.debug` or removed.

10. **[aggregateResults misclassifies suspended workflows]** `WorkflowEngine.ts:278-303`
    Suspended tasks (status 'suspended') are counted as neither completed, failed, nor skipped. Result defaults to 'completed' with 0 completed tasks — misleading.
    **Fix**: Exclude suspended tasks from aggregation or add a 'suspended' result status.

11. **[resolveField silently returns undefined for unknown fields]** `WorkflowEngine.ts:328-337`
    If a condition uses `t1.metadata` (not in `ALLOWED_CONDITION_FIELDS`), `resolveField` returns `undefined` silently. The condition then evaluates `undefined === value` with no warning.
    **Fix**: Log a warning for unknown fields.

12. **[clearQueueForChat is public]** `WorkflowScheduler.ts:462`
    Only called internally (line 181). If external callers clear the queue, pending notifications are lost silently. Consider making it `private`.

#### [P2] Nice to Have (polish)

13. **[Test coverage gaps]** `WorkflowScheduler.test.ts` covers scheduler well (15+ test cases). However:
    - `WorkflowEngine` has no dedicated tests (timeout, failure policies, condition evaluation, checkpoint persistence/recovery)
    - `expertRoutes.ts` handoff endpoint has no tests
    - `ConfigCompiler.ts` has no tests (especially Codex path with file I/O)

14. **[Magic numbers need comments]** `WorkflowScheduler.ts:30-32` — `MAX_QUEUE_PER_CHAT = 20`, `WATCHDOG_STALE_THRESHOLD_MS = 180_000`, `DEFAULT_WATCHDOG_INTERVAL_MS = 60_000`. Add comments explaining rationale.

15. **[Type safety]** `expertRoutes.ts:103` — `errors: any[]` should be typed as `Array<{ message?: string }>`.

16. **[Mock WS pattern repeated 4+ times]** `expertRoutes.ts:110-116`, `expertRoutes.ts:174-180`, `expertRoutes.ts:207`, `WorkflowScheduler.ts:396`, `WorkflowScheduler.ts:537`. Extract to a `createMockWs()` utility.

17. **[Watchdog doesn't notify Lead on recovery]** `WorkflowScheduler.ts:504-511` — When watchdog recovers a stuck workflow, it logs but doesn't wake Lead. Lead may not realize downstream tasks were started by watchdog vs. normal flow.

---

## Web/Frontend Review

### Review Scope
- `web/components/chat/indicators/TimelineView.tsx` — Agent turn timeline with tool/result rendering
- `web/components/chat/messages/AgentTurnCard.tsx` — Agent turn card with completion state, stats, elapsed time
- `web/components/chat/messages/WorkflowProgressCard.tsx` — Lead progress notification rendered as a card (214 lines)
- `web/components/chat/whiteboard/flow/WhiteboardFlowView.tsx` — ReactFlow DAG for whiteboard + workflow
- `web/components/chat/whiteboard/flow/WorkflowTaskNode.tsx` — ReactFlow node for workflow task status
- `web/components/workspace/ChatPane.tsx` — Route-level chat pane (minimal, delegates to ChatInstance)
- `web/hooks/useChatWebSocket.ts` — WebSocket lifecycle, per-agent message store, event handlers (437 lines)
- `web/hooks/useWhiteboard.ts` — Whiteboard snapshot loading + live WS updates (172 lines)
- `web/lib/whiteboardLayout.ts` — DAG layout algorithm (whiteboard + workflow), ~780 lines
- `web/mobile/components/BottomNav.tsx` — Mobile tab navigation
- `web/mobile/hooks/useMobileMissions.ts` — Mission list fetching + WS status updates
- `web/mobile/pages/MobileDashboard.tsx` — Mission list with agent badges, progress bars, status dots
- `web/mobile/pages/MobileMissionDetail.tsx` — Mission detail with streaming, permission requests (177 lines)
- `web/services/WebSocketEventMap.ts` — TypeScript type definitions for WS event payloads

### Review Summary
> The frontend changes are generally well-structured. New components (WorkflowProgressCard, WorkflowTaskNode, MobileMissionDetail) are correctly implemented. Mobile responsive design is sound with proper tab navigation. The main issues are: status indicator color mismatches against the project convention, memory leaks in useChatWebSocket handler registration, and streaming message deduplication issues. Two items need P0 attention: the `nowBucket` timer leak in WhiteboardFlowView, and a potential infinite re-render in useWhiteboard.

---

### Issues Found

#### [P0] Must Fix (affects correctness, security, or stability)

1. **[Timer leak: nowBucket interval never cleaned up]** `WhiteboardFlowView.tsx:91-95`
   ```ts
   useEffect(() => {
     const timer = window.setInterval(() => setNowBucket(...), 5_000)
     return () => window.clearInterval(timer)
   }, [])
   ```
   The dependency array is `[]` — the cleanup function runs on unmount only. This is correct for a singleton interval per mount. However, if the component re-renders with a new `nowBucket` state bucket (every 30s), the interval continues running. The `setNowBucket` call inside the interval references the current state, so React dev mode will warn about stale closures. The interval is fine on unmount, but the stale closure pattern could cause issues if `layoutWhiteboardDag` logic depends on accurate timestamps.
   **Fix**: Add `nowBucket` to the dep array, or use `useRef` for the bucket value instead of state.

2. **[Status dot color mismatch with project convention]** `WorkflowProgressCard.tsx:57-74`
   ```ts
   const statusDot = (icon) => {
     case 'running': return <...bg-accent-brand animate-ping-soft.../>
   ```
   The project convention (CLAUDE.md) specifies `bg-accent-running` for running status. Here `'running'` uses `bg-accent-brand`. The `running` icon maps to `bg-accent-brand` — this is inconsistent with `memberStatusDot()` in MissionSessionRows.tsx which uses `bg-accent-running`. Similarly, `pending` uses `bg-text-muted` (correct) and `failed` uses `bg-accent-red` (correct), but `done` uses `bg-accent-green/40` which is correct per convention (muted green for done).
   **Fix**: Change `bg-accent-brand` to `bg-accent-running` in `WorkflowProgressCard.tsx:66`.

3. **[Potential infinite re-render in useWhiteboard]** `useWhiteboard.ts:113-129`
   The `workflow:task-updated` handler updates `workflow.tasks` by mapping and replacing `status` and `agentId`:
   ```ts
   tasks: prev.workflow.tasks.map((t) =>
     t.taskId === payload.taskId
       ? { ...t, status: payload.status, agentId: payload.agentId }
       : t,
   ),
   ```
   This creates a new array and new objects for **every task** on every update, even if the status hasn't changed. For workflows with many tasks, this could cause unnecessary re-renders. More critically, if the server sends duplicate `workflow:task-updated` events for the same task+status, the state will be updated repeatedly with identical values.
   **Fix**: Shallow-compare `status` and `agentId` before creating new objects — only update if values actually changed.

#### [P1] Suggested Improvements (affects maintainability, performance, or robustness)

4. **[WebSocket handler leak on re-render]** `useChatWebSocket.ts:248-358`
   The `useEffect` at line 248 re-registers ~17 WebSocket event handlers every time any of its dependencies change. The cleanup at line 331 removes the old handlers, but this creates a churn pattern: if the component re-renders frequently (e.g., `connected` state changes, `chatId` changes), handlers are constantly re-registered.
   The deps array is `[wsClient]` — since `wsClient` is a singleton from `getWebSocketClient()`, this only re-runs if `wsClient` reference changes, which is rare. So this is mostly fine. However, the `expertHandlersRef` pattern (lines 113-122) creates the handlers once but then the outer useEffect re-runs on every `wsClient` change — if `wsClient` were ever recreated, handlers would leak. Since it's a singleton, this is low risk.
   **Fix**: Verify `getWebSocketClient()` always returns the same reference. If not, add a stable ref pattern.

5. **[MobileMissionDetail streaming deduplication logic is fragile]** `MobileMissionDetail.tsx:81-119`
   The `handleStructuredMessage` handler deduplicates messages by checking `existing.has(m.id)` (line 116). However, if the server sends the same message twice (e.g., on reconnect replay), it will be deduplicated — good. But the `handlePartialText` handler's approach (line 83-88) assumes the last message in the array is the streaming message for the same agent. If messages arrive out of order, this could append duplicates.
   Also, `handleStructuredMessage` filters out `streaming` messages and then replaces them with non-streaming versions. This is correct for completion, but if a reconnect replays messages, the `streaming: true` flag on the live message could be lost and replaced with a non-streaming version from the replay.
   **Fix**: Use a more robust streaming message key (e.g., `sessionId + blockIndex`) rather than position in array. Ensure streaming messages from replay are identified by a session-scoped sequence number.

6. **[useChatWebSocket handler ref mutation]** `useChatWebSocket.ts:155-177`
   The code creates `wsHandlersRef.current` at line 126, then immediately overrides `handleError` and `sendChatContext` at lines 155 and 161 — overwriting the values set in the initial object. This is confusing and fragile. If `expertHandlers.handleError` or `expertHandlers.sendChatContext` were ever populated in the initial object, they are silently replaced.
   **Fix**: Consolidate into a single object creation block. The initial object at line 126 has `handleError` from `expertHandlers` — line 155 overwrites it with a slightly different version (has `setLoading(false)` vs the expert version). This seems intentional (the local handler is for chat-level errors, expert handler is for expert errors), but the overwrite pattern makes it look like a bug.

7. **[whiteboardLayout.ts topoSort silently drops nodes]** `whiteboardLayout.ts:730-763`
   If there is a cycle in the task graph, `topoSort` will skip nodes that are part of the cycle (they never reach `inDegree === 0`). No error is raised, and those tasks silently disappear from the layout. A cyclic DAG (from a malformed workflow definition) would render without the affected tasks.
   **Fix**: Detect cycles and log a warning, or throw an error if cycles are found. At minimum, track dropped nodes and surface them.

8. **[WorkflowTaskNode missing rejected status]** `WorkflowTaskNode.tsx:16-22`
   `STATUS_DOT` includes `completed`, `running`, `failed`, `pending`, `skipped`, but not `rejected`. When a task is rejected (status='pending' after rejection, but `rejectCount > 0`), there's no visual indicator distinguishing it from a normal pending task. The WorkflowProgressCard handles this with a badge (line 175-188), but WorkflowTaskNode only shows the status badge which would say "pending".
   **Fix**: Add a `rejected` entry to `STATUS_BADGE` with a red/brown tint, and update the badge text to show `rejected x{rejectCount}` when `rejectCount > 0`.

9. **[AgentTurnCard stale activity detection edge case]** `AgentTurnCard.tsx:137-145`
   ```ts
   const isStaleActivity = useActivity &&
     !['completed', 'waiting_input', 'waiting_confirmation', 'error'].includes(activity!.phase) &&
     !!statsMessage && !group.isStreaming && !hasUnresolvedToolUse
   ```
   If an agent sends a stats message and then gets stuck (e.g., waiting for network), `isStaleActivity` becomes true and the phase is overridden to `waiting_input`. This means the card shows as "completed" even though the agent is still alive and waiting. The agent may later resume. The `isStaleActivity` detection is a heuristic — it's a UX tradeoff that may confuse users.
   **Fix**: Add a visual indicator when a turn is marked stale (e.g., a subtle "may be stale" chip). Or increase the threshold (require no activity for > 5 minutes before marking stale).

10. **[whiteboardLayout.ts DAG layout O(n²) scan]** `whiteboardLayout.ts:320-389`
    The `sorted` array is sorted by timestamp, then for each pair of nodes, multiple conditions are checked. With 100+ whiteboard entries, this becomes O(n²) complexity. The nested loop checks `DIRECTION_TYPES.has(src.type) && EXEC_TYPES.has(tgt.type)` for every pair — most pairs are skipped early by the `connectedPairSet.has()` check, but the initial scan over all pairs is unavoidable.
    **Fix**: Not urgent for typical use (< 50 entries), but consider a spatial index or pre-filtering by type before the O(n²) scan.

11. **[MobileMissionDetail ws connect without cleanup]** `MobileMissionDetail.tsx:79`
    `ws.connect().catch(() => {})` is called in a useEffect with `missionId` as dep. If `missionId` changes, a new WebSocket connection is attempted while the old one may still be active. The `WebSocketClient` is a singleton so `connect()` is idempotent, but there's no explicit cleanup of the old connection.
    **Fix**: Verify `WebSocketClient.connect()` is idempotent and handles concurrent calls gracefully. If not, add a guard.

12. **[AgentTurnCard arePropsEqual missing agentName check]** `AgentTurnCard.tsx:614-634`
    The `arePropsEqual` function compares `activity.phase`, `activity.toolCount`, etc., but does NOT compare `agentName`. If `agentName` changes (e.g., from "Agent" to "Reviewer" after personality resolution), the component won't re-render because the other props are the same.
    **Fix**: Add `if (prev.agentName !== next.agentName) return false`.

#### [P2] Nice to Have (polish)

13. **[WorkflowProgressCard uses CSS var for bg-text-muted]** `WorkflowProgressCard.tsx:72` — `bg-text-muted` is a Tailwind class that maps to a CSS variable. This is correct. No issue.

14. **[Duplicate `getAgentColor` in Mobile files]** `MobileDashboard.tsx:21-26` and `MobileMissionDetail.tsx:31-36` — Both files have identical `getAgentColor` implementation with the same `AGENT_COLORS` map and `FALLBACK_COLORS` array. Consider extracting to a shared utility `web/lib/agentColors.ts`.

15. **[TimelineView toolSummaryCache is module-level]** `TimelineView.tsx:50-104` — The `toolSummaryCache` is a module-level `Map` (not per-instance). For SSR or multiple chat tabs, this cache is shared across all instances. The size is capped at 1000 entries (line 96-101) which mitigates memory growth, but the cache doesn't respect per-chat context. Low risk for this app's use case (single chat), but worth noting.

16. **[AgentTurnCard Phase badge localization]** `AgentTurnCard.tsx:200-212` — The `statusText` switch uses `t()` for some values but leaves some keys with trailing commas that are syntax errors (line 205: `t('message.waitingConfirmation', )` and line 209: `t('message.initializing', )`). These trailing commas in the function call are valid JS syntax but the empty second argument is unnecessary. Minor style issue.

17. **[WebSocketEventMap types are comprehensive but unvalidated]** `WebSocketEventMap.ts` defines all WS event types as TypeScript interfaces, but there's no runtime validation ensuring server payloads match these types. If the server sends a malformed payload, TypeScript types provide no protection at runtime.
    **Fix**: Consider adding a lightweight runtime validator (e.g., `zod`) for critical event types like `workflow:task-updated` if payload shape is important for correctness.

---

### Highlights
- **WorkflowProgressCard** (`WorkflowProgressCard.tsx`): Clean regex-based parser for Lead's workflow progress text, well-structured card with progress bar, task list, and workflow status footer. Good use of `useMemo` for parsed data.
- **WorkflowTaskNode** (`WorkflowTaskNode.tsx`): Properly memoized with `memo()`, clean ReactFlow node integration with status dots, badges, and entry summary chips. Correct use of `@xyflow/react` Handle components.
- **Mobile responsive design**: Consistent spacing (`px-5`, `py-3`), proper touch targets (44px minimum), active states (`active:scale-[0.98]`), permission banner with proper warning styling.
- **AgentTurnCard performance**: Uses `memo` with custom `arePropsEqual` comparison — avoids unnecessary re-renders when agent messages haven't changed. The stale activity detection is a useful UX pattern for long-running agents.
- **whiteboardLayout DAG algorithms**: Well-structured topological sort, time-bucket layering, critical path computation. The `layoutWorkflowDag` integrates cleanly with `layoutWhiteboardDag` via a shared `DagLayout` type.
- **useChatWebSocket state management**: Clean separation between WebSocket lifecycle (`connected`, `currentSessionId`) and per-agent state (`agentMessages`, `expertActivities`). The `agentMessagesRef` pattern allows imperative access without causing re-renders.
- **useWhiteboard reactive updates**: Proper use of `setSnapshot` with functional updates that filter by `chatId` to avoid cross-chat contamination. The `reqSeqRef` prevents stale responses from overwriting newer state.
- **MobileMissionDetail streaming**: Proper streaming message deduplication and replacement. Markdown rendering with well-configured components (code blocks, lists, blockquotes).
- **BottomNav active state**: Simple and correct — uses `location.pathname.startsWith` with a special case for `/mobile` to prevent it from matching `/mobile/dispatch`.

---

## Shared Types & Config Review

### Review Scope
- `shared/workflow-types.ts` — Type definitions for workflow DAG, tasks, states, and results
- `package.json` — Dependency versions and project metadata
- `CHANGELOG.md` — Changelog entries for v0.1.0-beta.2
- `README.md` — Project documentation (171-line rewrite)
- `openspec/changes/workflow-reliability/tasks.md` — Task checklist completeness

### Review Summary
> The shared types are well-designed with backward-compatible additions. The changelog accurately reflects all 10 commits. However, the README contains factual inaccuracies (React version, agent file names) that should be corrected before publication. The `WorkflowTaskNode` in whiteboard-types is intentionally separate from `WorkflowTask` in workflow-types — no issue. Multiple duplicate type definitions exist across codebase that create DRY violations but no functional bugs.

---

### Issues Found

#### [P0] Must Fix (affects correctness, security, or stability)

1. **[README.md: React version mismatch]** `README.md:220`
   ```md
   | Frontend | React 18 + TypeScript + Vite + TailwindCSS |
   ```
   `package.json` specifies `"react": "^19.2.0"` (line 173). The README claims React 18. This is a factual error that could mislead contributors or users following the docs.
   **Fix**: Update README to `React 19` or add a note that the version is subject to change.

#### [P1] Suggested Improvements (affects maintainability, or robustness)

2. **[Duplicate WorkflowStatus/TaskStatus definitions]** `web/hooks/useDevPanel.ts:163-164`, `server/config/types.ts:136`
   Three separate definitions of `WorkflowStatus` and `TaskStatus` exist:
   - `shared/workflow-types.ts:32-34` (source of truth)
   - `web/hooks/useDevPanel.ts:163-164` (duplicated)
   - `server/config/types.ts:136` (part of a different `TaskStatus` for `agentSubAgentTaskStatus`)
   
   The `web/hooks/useDevPanel.ts` definitions are identical to `shared/workflow-types.ts`. If `suspended` is added to `TaskStatus` in the shared types, the copy in `useDevPanel.ts` won't update automatically.
   **Fix**: Import from `shared/workflow-types.ts` in `useDevPanel.ts`. The `server/config/types.ts` definition is for a different context (`agentSubAgentTaskStatus`) so may be intentional — verify if it's the same union.

3. **[README.md: agent file names don't match actual structure]** `README.md:73-78`
   ```md
   ai-assets/agents/code-reviewer/
   ├── IDENTITY.md    ← name, provider, tools
   ├── AGENTS.md      ← system prompt, expertise, workflows
   └── SOUL.md        ← personality, tone, collaboration style
   ```
   Actual agent directories use `IDENTITY.md`, `SOUL.md`, `BOOT.md`, `GUARDRAILS.md`, `HEARTBEAT.md` — no `AGENTS.md`. The README's file names don't exist.
   **Fix**: Update the example to match actual file names, or reference the correct file structure.

4. **[WorkflowTaskNode is separate from WorkflowTask — intentional but undocumented]** `shared/whiteboard-types.ts:97` vs `shared/workflow-types.ts:11`
   `WorkflowTask` (workflow-types) is the server-side definition with fields like `dependsOn`, `onFailure`, `maxRetries`. `WorkflowTaskNode` (whiteboard-types) is a frontend-optimized view with `entryCount`, `entrySummary`, and `status`. The separation is intentional (different consumers), but there's no comment explaining why they diverge or which is the "master" type.
   **Fix**: Add a comment in whiteboard-types.ts explaining the relationship. Alternatively, make `WorkflowTaskNode` extend or reference `WorkflowTask`.

#### [P2] Nice to Have (polish)

5. **[CHANGELOG.md completeness check]** — All 10 commits from HEAD~10 are represented in the changelog:
   - `6ff4dd8` (Mission creation lag) → Bug fixes section
   - `bc3b41e` (workflow reliability fixes) → Bug fixes section
   - `e4a9ac7` (README rewrite) → Improvements section
   - `3665cbd` (notification queue, watchdog, autoAdvance) → Features section
   - `a5e738e` (War Room DAG real-time) → Bug fixes section
   - `df9c350` (second handoff) → Bug fixes section
   - `1a75796` (AskUserQuestion) → Bug fixes section
   - `acf6613` (running status color) → Bug fixes section
   - `527d9a2` (mobile dashboard) → Features section (mobile remote control)
   - `a503aec` (mobile streaming) → Features section (mobile remote control)
   
   All entries match actual commits. No missing or inaccurate entries.

6. **[package.json dependency health]** — All key dependencies are at stable versions:
   - `react: ^19.2.0`, `react-dom: ^19.2.0` — latest stable
   - `better-sqlite3: ^12.8.0`, `ws: ^8.18.0`, `express: ^4.21.2` — stable
   - `@anthropic-ai/sdk: ^0.98.0` — recent
   - `electron: ^41.7.1` — current LTS
   - No obvious security vulnerabilities in pinned versions

7. **[tasks.md completeness]** — All 18 tasks are marked complete with [x]. Test coverage matches implementation:
   - L1: 5 items (queue drain, single drain, bounds, clear on completion, merged prompt fix)
   - L2: 6 items (interval, scan, stale recovery, destroy, logging, P1 fixes)
   - L3: 4 items (autoAdvance trigger, lead notification, default false, autoAdvance note)
   - wokenLeadTasks: 3 items (rejection clear, completion clear, queue overflow log)

8. **[README.md claims git worktrees for agent isolation]** `README.md:34`
   The README states agents "work in isolated git worktrees" but this implementation is not uniformly applied across all agents. The workflow engine doesn't automatically create worktrees — it relies on workspace/repository paths. If this is aspirational rather than actual behavior, it should be marked as such or the docs should be updated to reflect reality.
   **Fix**: Verify if git worktree isolation is actually implemented. If not, update the language to "isolated workspace directories" or add a note that worktree support is planned.

9. **[README.md mentions DevPanel 5-tab but has 3]** `README.md:148` vs `web/components/dev/DevPanel.tsx:17-19`
   README claims "DevPanel — 5-tab dashboard" but DevPanel.tsx has only 3 tabs: `workflow`, `agents`, `protocol`.
   ```ts
   { id: 'workflow', label: 'Workflow' },
   { id: 'agents', label: 'Agents' },
   { id: 'protocol', label: 'Protocol' },
   ```
   The README is inaccurate by 2 tabs. This could cause user confusion when they open the DevPanel.
   **Fix**: Update README to say "3-tab dashboard" or verify if there are more tabs in other contexts.

---

### Highlights
- **Type backward compatibility**: `autoAdvance?: boolean` and `suspended` are optional additions — no breaking changes to existing consumers.
- **Task type separation**: `WorkflowTask` (server) vs `WorkflowTaskNode` (frontend) is a sensible design choice allowing frontend-specific fields without polluting the server contract.
- **WorkflowResult aggregation**: Correctly tracks `completedCount`, `failedCount`, `skippedCount` with a `partial` status for mixed outcomes.
- **TaskCondition DSL**: Clean union type for operators (`eq`, `neq`, `in`, `has_items`, `is_empty`, `and`, `or`) — extensible and type-safe.
- **CHANGELOG accuracy**: All 10 commits have matching entries. No ghost entries or missing commits.
- **tasks.md completeness**: 18/18 tasks checked off, tests match implementation, P0/P1 fixes are documented.
