# Parallel Agent Instances — Technical Design

## Architecture Overview

```
handleStart(agentId="fullstack-engineer", forceNewInstance=true)
  │
  ├── store.get(key) → existing & alive?
  │     YES + forceNewInstance=true
  │     │
  │     ├── Generate instanceId: "fullstack-engineer#h-1"
  │     ├── Recompute key with instanceId
  │     └── Fall through to spawn path
  │
  │     YES + forceNewInstance=false (default)
  │     └── Original behavior: acpClient.prompt()
  │
  └── Spawn new CLI process with instanceId
        ├── agentRegistry.get(baseAgentId) for agent definition
        ├── configCompiler.compile(agent, { instanceId })
        └── store.set(newKey, newEntry)
```

## File Changes

### 1. ExpertLifecycle.ts

**Change**: Add `forceNewInstance` to payload; auto-generate instanceId when agent is already running.

```typescript
// Payload type addition
payload: {
  // ... existing fields ...
  forceNewInstance?: boolean
}

// At top of handleStart, extract base agent ID
const baseAgentId = agentId.includes('#') ? agentId.split('#')[0] : agentId

// At L145 (existing check), add branch:
if (existing && existing.acpClient.isAlive()) {
  if (payload.forceNewInstance) {
    // Count existing instances to generate suffix
    const instanceNum = countInstances(store, chatId, baseAgentId) + 1
    agentId = `${baseAgentId}#${instanceNum}`
    key = compositeKey(connectionId, chatId, agentId)
    
    // Notify frontend (reuse existing event type)
    ws.send(JSON.stringify({
      type: 'expert:already-running',
      payload: {
        agentId: baseAgentId, chatId, model: existing.model,
        sessionId: existing.sessionId, agentName: existing.agentName,
        agentIcon: existing.agentIcon, status: 'running',
        newInstanceId: agentId,  // new field
      },
    }))
    // Fall through to spawn
  } else {
    // Original prompt-to-existing behavior
    ...
  }
}

// At L205, use baseAgentId for registry lookup
const agentDef = agentRegistry.get(baseAgentId)
const storedAgent = !agentDef ? agentStore.get(baseAgentId) : undefined

// At configCompiler.compile, pass agentId (with suffix) as instanceId
const compiled = await configCompiler.compile(agent, {
  ...
  instanceId: agentId,  // "fullstack-engineer#h-1"
}, provider, llmEnv)
```

**Helper function**:
```typescript
function countInstances(store: ExpertSessionStore, chatId: string, baseAgentId: string): number {
  let count = 0
  for (const [, entry] of store.runningEntries()) {
    if (entry.chatId !== chatId) continue
    const entryBase = entry.agentName // not reliable, use key parsing
    // Actually, iterate keys and parse
  }
  return count
}
```

Better: Add a method to ExpertSessionStore.

### 2. ExpertSessionStore.ts

**Add**: `countRunningByBaseAgent` method and `parseBaseAgentId` utility.

```typescript
export function parseBaseAgentId(key: string): string {
  const agentId = parseAgentId(key)
  const hashIdx = agentId.indexOf('#')
  return hashIdx >= 0 ? agentId.substring(0, hashIdx) : agentId
}

// In ExpertSessionStore class:
countRunningByBaseAgent(chatId: string, baseAgentId: string): number {
  let count = 0
  for (const [key, entry] of this.running) {
    if (entry.chatId !== chatId) continue
    if (parseBaseAgentId(key) === baseAgentId) count++
  }
  return count
}

findAllRunningByBaseAgent(chatId: string, baseAgentId: string): Array<{ key: string; entry: ExpertEntry }> {
  const result: Array<{ key: string; entry: ExpertEntry }> = []
  for (const [key, entry] of this.running) {
    if (entry.chatId !== chatId) continue
    if (parseBaseAgentId(key) === baseAgentId) result.push({ key, entry })
  }
  return result
}
```

### 3. SessionRegistry.ts — register()

**Change**: The dedup logic at L107-123 kills duplicate sessions with the same `chatId + agentId`. With suffixed instance IDs, `existing.agentId !== session.agentId` is naturally false (e.g., `"fullstack-engineer" !== "fullstack-engineer#h-1"`), so **no change needed** — the dedup already works correctly for different instances.

**Verify**: `findByChat(chatId, agentId)` uses exact match → won't accidentally match a different instance. Correct.

### 4. expertRoutes.ts — Handoff endpoint (L351)

**Change**: Pass `forceNewInstance: true` to handleStart.

```typescript
const startResult = await expertHandler.handleStart(ws, {
  agentId: to,
  task: handoffTask,
  chatId,
  cwd: sourceEntry.cwd,
  previousContext,
  forceNewInstance: true,  // NEW
}, connectionId)
```

**Also**: After start, use the returned sessionId to find the actual instanceId for setting meta:

```typescript
if (startResult.started && startResult.sessionId) {
  const targetEntry = store.findBySessionId(startResult.sessionId)
  if (targetEntry) {
    const actualAgentId = parseAgentId(targetEntry.key)
    store.setMeta(targetEntry.key, 'dispatchChain', [...dispatchChain, actualAgentId])
    store.setMeta(targetEntry.key, 'handoffFrom', from)
  }
}
```

### 5. WorkflowScheduler.ts — startTask()

**Change**: Pass `forceNewInstance: true` and use task-based instance suffix.

```typescript
await this.deps.expertHandler.handleStart(ws, {
  agentId,
  task: prompt,
  chatId,
  cwd,
  forceNewInstance: true,  // NEW
}, connectionId)
```

The workflow exit routing (`findByAgent` → `findTaskByCurrentAgent`) works because:
- `engine.markTaskRunning(taskId, agentId)` is called before handleStart
- handleStart may change `agentId` to `agentId#N` internally
- The exit handler calls `onAgentExited(chatId, agentId, ...)` with the actual instanceId
- `findTaskByCurrentAgent(instanceId)` matches the stored `t.agentId`

**Fix needed**: `markTaskRunning` is called before handleStart generates the suffix. We need to update the task's agentId after handleStart returns.

```typescript
engine.markTaskRunning(taskId, agentId)
// ... handleStart ...
// After successful start, update task's agentId if instance was created
if (startResult.started && startResult.instanceId) {
  engine.updateTaskAgent(taskId, startResult.instanceId)
}
```

### 6. ExpertHandler.ts — getRunning / findRunning

For existing callers that look up by base agentId (like `handleInput`, `handlePermissionResponse`), the current `findRunning` does a linear scan and returns the first match. This is acceptable — these are user-facing interactions that target the "primary" instance.

For callers that need a specific instance (workflow exit routing), they already have the full instanceId.

**No change needed** in ExpertHandler public API.

## Return Value Enhancement

handleStart should return the actual instanceId used:

```typescript
return {
  started: true,
  sessionId,
  method: 'spawned',
  instanceId: agentId,  // NEW: may differ from payload.agentId
}
```

## Decisions

1. **Counter-based suffix over timestamp**: `#h-1`, `#h-2` is more readable and debuggable than `#h-1717600000`. Counter resets per chat session (not persistent).

2. **forceNewInstance flag over auto-detection**: Explicit flag is safer than inferring intent. User typing into a running agent should prompt (existing behavior), while handoff/workflow should always spawn new.

3. **No changes to frontend WS events**: The `expert:started` event already carries `agentId` which will include the suffix. Frontend treats each suffixed agent as a distinct row. The `expert:already-running` event gets a new `newInstanceId` field for informational purposes.

## Impact Scope

| File | Change Type | Risk |
|------|------------|------|
| `server/ws/ExpertLifecycle.ts` | Logic branch + baseAgentId extraction | Medium — core spawn path |
| `server/ws/ExpertSessionStore.ts` | Add 2 new methods + 1 utility fn | Low — additive |
| `server/routes/agent/expertRoutes.ts` | Pass `forceNewInstance: true` in handoff | Low — flag addition |
| `server/orchestration/WorkflowScheduler.ts` | Pass `forceNewInstance: true` + update task agentId | Medium — routing correctness |
| `server/orchestration/WorkflowEngine.ts` | Add `updateTaskAgent` method | Low — additive |
| `server/ws/ExpertExitHandler.ts` | No change | None |
| `server/terminal/SessionRegistry.ts` | No change | None |
