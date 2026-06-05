# War Room Info Layer Upgrade — Technical Design

## 1. Entry Model Changes

### 1.1 Type Definition

File: `shared/whiteboard-types.ts`

```typescript
export interface WhiteboardEntry {
  // ... existing fields unchanged ...
  id: string
  chatId: string
  seq: number
  type: WhiteboardEntryType
  by: string
  summary: string
  refs?: WhiteboardEntryRefs
  tags?: string[]
  status: WhiteboardEntryStatus
  supersededBy?: string
  timestamp: string

  // --- New fields ---
  payload?: Record<string, unknown>
  taskId?: string
  resolves?: string
}
```

### 1.2 Validation Rules

File: `server/whiteboard/WhiteboardManager.ts` — `validateInput()`

| Field | Validation |
|-------|-----------|
| `payload` | Optional. If present, JSON-serialized size ≤ 4096 bytes. Must be a plain object (no arrays at root, no null). |
| `taskId` | Optional. If present, must be a non-empty string, max 64 chars. No format enforcement (workflow engine owns task ID semantics). |
| `resolves` | Optional. If present, must be a valid entry ID that exists in the same chat. The resolved entry must be of type `open_question` and status `active`. Does NOT auto-archive the resolved entry — that remains a manual/Lead action. |

### 1.3 JSONL Compatibility

New fields are optional, so existing entries.jsonl files parse without changes. `loadEntries()` already uses `JSON.parse` per line — new fields simply appear when present.

### 1.4 API Changes

File: `server/routes/chat/whiteboardRoutes.ts`

**POST /api/chats/:chatId/whiteboard/entries** — extend `parseEntryInput()`:

```typescript
// Add to parseEntryInput():
const payload = body.payload
if (payload !== undefined) {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new Error('payload must be a plain object')
  }
  const payloadSize = Buffer.byteLength(JSON.stringify(payload), 'utf-8')
  if (payloadSize > 4096) {
    throw new Error(`payload too large (${payloadSize} > 4096 bytes)`)
  }
}

const taskId = body.taskId
if (taskId !== undefined) {
  if (typeof taskId !== 'string' || !taskId.trim()) {
    throw new Error('taskId must be a non-empty string')
  }
  if (taskId.length > 64) {
    throw new Error('taskId too long (max 64)')
  }
}

const resolves = body.resolves
if (resolves !== undefined) {
  if (typeof resolves !== 'string' || !resolves.trim()) {
    throw new Error('resolves must be a non-empty string')
  }
}
```

**GET /api/chats/:chatId/whiteboard/entries** — extend query options:

```typescript
// Add to WhiteboardQueryOptions:
export interface WhiteboardQueryOptions {
  // ... existing fields ...
  taskId?: string  // filter entries by workflow task
}
```

### 1.5 Snapshot Extension

File: `shared/whiteboard-types.ts`

```typescript
export interface WhiteboardSnapshot {
  // ... existing fields unchanged ...
  chatId: string
  goal: WhiteboardEntry | null
  active: WhiteboardEntry[]
  archivedCount: number
  updatedAt: string

  // --- New field ---
  taskEntries?: Record<string, WhiteboardEntry[]>  // grouped by taskId
}
```

`WhiteboardManager.getSnapshot()` groups entries that have a `taskId` into this map. Entries without `taskId` remain in the `active` array as before.

### 1.6 ContextBriefing Adaptation

File: `server/whiteboard/ContextBriefing.ts`

`buildForAgent()` — when entries have `taskId`, group them in the briefing:

```
# Chat Shared Context Briefing

**target** 🎯 Build auth module with SSO support

**Task: design-auth** (completed)
- 📌 Chose OAuth2 PKCE flow over implicit grant  _by architect_
- 📦 Wrote auth-design.md  _by architect_

**Task: implement-auth** (running)
- ❓ Need clarification on token refresh interval  _by fullstack-engineer_

**Open Questions**
- ❓ Need clarification on token refresh interval  _by fullstack-engineer_
```

Budget allocation: task-grouped entries share the same 1800-char budget. Priority ranking within tasks follows existing logic.

---

## 2. Auto-extraction Noise Reduction

### 2.1 wb-auto-extract.sh Changes

File: `ai-assets/hooks/wb-auto-extract.sh`

**Keep:**
- Rule 1 (goal fallback): first turn + no active goal → extract from first user message
- Rule 2 (handoff detection): Task/Agent tool call → write handoff entry

**Remove:**
- Rule 5 (decision extraction via grep)
- Rule 6 (open_question extraction via grep)
- Rule 7 (constraint extraction via grep)

The removed rules are the highest noise generators. Agents have explicit prompt instructions to write these entry types; manual writes are higher quality.

### 2.2 wb-post-tool-write.sh Changes

File: `ai-assets/hooks/wb-post-tool-write.sh`

**Current behavior:** Every `Edit` or `Write` tool call writes one artifact entry ("edited X.ts").

**New behavior:** Accumulate file paths during a turn, write a single aggregated artifact entry.

Implementation approach — since PostToolUse hooks are stateless (each invocation is independent), use a temporary accumulator file:

```bash
# Per-turn accumulator: ~/.teemai/whiteboard/{chatId}/.artifact-acc-{instanceId}.txt
ACC_FILE="${FP_DIR}/.artifact-acc-${INSTANCE_ID}.txt"

case "$TOOL_NAME" in
  Write|write_to_file|Edit)
    FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty')
    if is_valid_path "$FILE_PATH"; then
      BASENAME=$(printf "%s" "$FILE_PATH" | awk -F/ '{print $NF}')
      echo "$BASENAME" >> "$ACC_FILE"
    fi
    ;;
esac
```

Then in `wb-auto-extract.sh` (Stop hook, runs at turn end), flush the accumulator:

```bash
ACC_FILE="${FP_DIR}/.artifact-acc-${INSTANCE_ID}.txt"
if [ -f "$ACC_FILE" ]; then
  COUNT=$(wc -l < "$ACC_FILE" | tr -d ' ')
  FILES=$(sort -u "$ACC_FILE" | head -5 | tr '\n' ', ' | sed 's/,$//')
  EXTRA=""
  [ "$COUNT" -gt 5 ] && EXTRA=" +$((COUNT - 5)) more"
  write_wb "artifact" "modified ${COUNT} files: ${FILES}${EXTRA}"
  rm -f "$ACC_FILE"
fi
```

### 2.3 Skill Script Updates

File: `ai-assets/skills/whiteboard/scripts/wb-write.sh`

Add optional flags for new fields:

```bash
# New optional arguments:
#   --payload='{"key":"value"}'
#   --task=<taskId>
#   --resolves=<entryId>
```

Parse these from arguments and include in the POST payload when present.

---

## 3. Visualization Unification

### 3.1 Workflow State API

File: `server/routes/chat/whiteboardRoutes.ts` (or new route)

New endpoint to expose workflow task states alongside whiteboard data:

```
GET /api/chats/:chatId/whiteboard/snapshot?includeWorkflow=true
```

Response extends existing snapshot:

```typescript
interface WhiteboardSnapshotWithWorkflow extends WhiteboardSnapshot {
  workflow?: {
    workflowId: string
    status: WorkflowStatus
    tasks: Array<{
      taskId: string
      agentId: string
      status: TaskStatus
      description: string
      dependsOn: string[]
      entryCount: number        // count of entries with this taskId
      entrySummary: {           // aggregated by type
        decisions: number
        artifacts: number
        open_questions: number
        constraints: number
        progress: number
        handoffs: number
      }
    }>
  }
}
```

Implementation: the route handler queries `WorkflowRegistry.findByChatId()` and joins with entry data from `WhiteboardManager.query({ taskId })`.

### 3.2 Frontend Rendering Modes

File: `web/lib/whiteboardLayout.ts`

Add a new exported function for workflow-based layout:

```typescript
export const layoutWorkflowDag = (
  workflowTasks: WorkflowTaskNode[],
  entries: WhiteboardEntry[],
  floatingEntries: WhiteboardEntry[],  // entries without taskId
  goal: WhiteboardEntry | null,
): DagLayout => {
  // Task nodes positioned by dependency layers (topological sort)
  // Entries grouped inside task nodes (not individual nodes)
  // Floating entries (goal, chat-level constraints) above the DAG
}
```

Existing `layoutWhiteboardDag()` remains unchanged as the fallback for no-workflow scenarios.

### 3.3 Frontend Component Changes

File: `web/components/chat/whiteboard/flow/WhiteboardFlowView.tsx`

Decision logic at render time:

```typescript
const layout = useMemo(() => {
  if (workflowSnapshot) {
    return layoutWorkflowDag(
      workflowSnapshot.tasks,
      entriesWithTaskId,
      entriesWithoutTaskId,
      goal,
    )
  }
  return layoutWhiteboardDag(entries, goal, Date.now())
}, [workflowSnapshot, entries, goal])
```

### 3.4 WarRoomPanel Changes

File: `web/components/workspace/WarRoomPanel.tsx`

When workflow is present, add a task-based grouping option:

```
SECTIONS (with workflow):
  1. Open Questions & Constraints (unchanged — blockers first)
  2. By Task:
     - [design-auth] completed — 2 decisions, 1 artifact
     - [implement-auth] running — 1 open question
     - [review-auth] pending
  3. Ungrouped Activity (entries without taskId)
```

When no workflow, keep current 3-section layout unchanged.

---

## 4. Data Flow Diagram

```
                    ┌──────────────────────────┐
                    │    Agent Turn Running     │
                    └──────────┬───────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
    ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐
    │ Agent calls  │  │ PostToolUse  │  │ Stop hook        │
    │ wb-write.sh  │  │ hook (Edit/  │  │ (wb-auto-extract)│
    │ (manual)     │  │ Write/Task)  │  │                  │
    └──────┬──────┘  └──────┬───────┘  └────────┬─────────┘
           │                │                    │
           │         accumulate files      flush accumulator
           │         to temp file          → 1 artifact entry
           │                │              + goal fallback
           ▼                ▼                    ▼
    ┌─────────────────────────────────────────────────┐
    │         WhiteboardManager.appendEntry()          │
    │  validates → persists JSONL → updates cache      │
    │  broadcasts WS event → rebuilds snapshot         │
    └──────────────────────┬──────────────────────────┘
                           │
              ┌────────────┼────────────────┐
              ▼            ▼                ▼
    ┌────────────┐  ┌─────────────┐  ┌──────────────┐
    │ Context    │  │ War Room    │  │ Whiteboard   │
    │ Briefing   │  │ Panel (UI)  │  │ Flow View    │
    │ (agent     │  │ (list view) │  │ (DAG view)   │
    │  prompt)   │  │             │  │              │
    └────────────┘  └─────────────┘  └──────────────┘
```

No arrows to WorkflowEngine/WorkflowScheduler — War Room is read-only with respect to orchestration.

---

## Decisions

### D1: payload size limit = 4KB

Rationale: Large enough for a code review summary or error trace, small enough to prevent JSONL bloat. Each entry line in entries.jsonl should stay under ~5KB total (summary + payload + metadata).

### D2: `resolves` does NOT auto-archive

Rationale: War Room is an information layer, not a decision layer. The `resolves` field creates a visual link in the UI ("this decision addressed that question") but doesn't trigger any state change. Lead or user archives the question when they're satisfied.

### D3: Keep existing 7 entry types unchanged

Rationale: Agent prompts are trained on these types. Adding/merging types requires retraining all agent prompts and risks confusion during transition. The new fields (payload, taskId, resolves) provide the expressiveness that was missing without changing the type vocabulary.

### D4: Artifact aggregation uses temp file accumulator, not in-memory state

Rationale: PostToolUse hooks are stateless bash scripts — no persistent process to hold state. A temp file per agent turn is the simplest reliable approach. The Stop hook flushes it.

### D5: Two layout functions, not a unified one

Rationale: `layoutWorkflowDag` and `layoutWhiteboardDag` serve different rendering modes with different inputs. Forcing them into one function would add conditional complexity. Clean separation is simpler.
