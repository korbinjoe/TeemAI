# Fix Idle Mission Queue

## Root Cause

Mission `_zl_Lka3` is persisted as `status=idle` and `task_status=waiting_input`, but the web send path decides whether to enqueue only from `expertActivities`. If a Codex turn-end activity is missed or stale after mission switching, that local activity can remain `thinking`/`tool_running` while the authoritative mission status is already idle. The input may render as sendable, but `handleSend` still enqueues.

The backend direct-input path is not the blocker: logs show messages to `_zl_Lka3` were sent via ACP when invoked. The mismatch is front-end gating.

A second stale-state path remains: `/api/missions/:id` can return a persisted `status=running` even when the enriched `members[]` rollup has no running agent. The sidebar uses `members[]`, so the mission appears idle/done, while `ChatInstance` seeds `chatStatus` from the stale persisted status and `useChatActions` still queues.

## Goals

- Treat non-running mission status as authoritative for send/queue gating.
- Preserve per-agent queue behavior when the mission is genuinely running.
- Cover the status override with a focused test.

## Non-Goals

- Do not change Codex app-server process lifetime.
- Do not refactor mission activity aggregation.
- Do not alter queue UI styling or persistence.

## Approach

- Pass `chatStatus` into `useChatActions`.
- Add a small pure helper that returns `false` for "should queue" whenever `chatStatus` is known and not `running`.
- Use the helper for both send gating and exported tests.
- Normalize the initial chat status from the enriched `members[]` snapshot so a stale persisted `running` value cannot override an idle/done member rollup.

## Risks

- If `chatStatus` is stale idle while an agent is actually running, a message may be sent immediately instead of queued. This is acceptable because `chatStatus` is already the workspace-wide authoritative run-state signal used elsewhere in the chat UI.
