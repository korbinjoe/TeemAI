# Parallel Agent Instances

## Summary

When a handoff or workflow dispatch targets an agent that is already running, spawn a **new CLI process instance** instead of appending the task to the existing agent's context via `acpClient.prompt()`.

## Motivation

Current behavior (ExpertLifecycle.ts L145-176): if `store.get(key)` finds an alive entry for the same `connectionId::chatId::agentId`, the new task is injected into the running agent via `acpClient.prompt()`. This causes:

1. **Task loss** — the running agent may be mid-tool-call and never process the injected prompt
2. **Context pollution** — mixing two unrelated tasks in one conversation degrades agent quality
3. **No isolation** — one task's failure corrupts the other's session

## Goals

- Handoff and workflow dispatch spawn a new process when the target agent is already running
- Each instance gets its own CLI session, ACP client, and composite key
- Existing user-to-agent interaction (typing into a running agent) remains unchanged
- Workflow task completion routing correctly maps back to the originating instance

## Non-Goals

- UI changes (frontend already handles multiple `expert:started` events per agentId)
- Limiting max concurrent instances per agent (out of scope, can be added later)
- Changing the `instanceSuffix` HTTP API (already works for explicit callers)

## Approach

### Instance ID Scheme

Reuse the existing `agentId#suffix` convention from `expertRoutes.ts`:

| Source | Suffix Format | Example |
|--------|--------------|---------|
| Handoff | `#h-{counter}` | `fullstack-engineer#h-1` |
| Workflow | `#w-{taskId}` | `fullstack-engineer#w-task-3` |
| HTTP API | `#{instanceSuffix}` | `fullstack-engineer#custom` (existing) |

### Key Insight

The composite key `connectionId::chatId::agentId` naturally becomes unique when `agentId` includes the suffix. All store operations (get/set/cleanup) work without modification because they're keyed by the full composite key.

## Risks

- **agentRegistry lookup**: `agentRegistry.get("fullstack-engineer#h-1")` returns undefined. Must strip suffix before registry lookup.
- **Workflow exit routing**: `WorkflowEngine.findTaskByCurrentAgent(agentId)` must match the suffixed instanceId. Since `markTaskRunning(taskId, instanceId)` stores the instanceId, lookups work if we pass the full instanceId consistently.
- **persistExpertSession**: Stores `expertSessions[agentId]` — suffixed keys could accumulate stale entries. Acceptable for now; cleanup on chat close handles it.
