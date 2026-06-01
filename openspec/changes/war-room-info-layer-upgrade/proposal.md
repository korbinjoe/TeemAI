# War Room Info Layer Upgrade

## Summary

Upgrade the War Room (Whiteboard) from a noisy, isolated log board to a clean information layer that connects to Workflow Engine state and provides unified visualization. No decision logic, no reactive triggers — pure display and context sharing.

Three changes:
1. **Entry model enrichment** — Add `payload`, `taskId`, `resolves` fields so entries carry structured content and link to workflow tasks
2. **Auto-extraction noise reduction** — Remove fragile grep-based extraction, keep only goal fallback, switch artifact tracking from per-file to per-turn granularity
3. **Visualization unification** — When a workflow exists, render its DAG as the skeleton with war room entries filling each task node; fall back to current timeline inference when no workflow exists

## Motivation

The War Room currently has three problems that compound into low signal-to-noise ratio and a disconnected user experience:

1. **Entry model is too thin** — 120-char summary loses context. A code review finding, a design decision with alternatives, or an error trace cannot fit in 120 characters. The `refs` field exists but is underutilized because there's no structured payload.

2. **Auto-extraction creates noise** — `wb-auto-extract.sh` uses grep patterns (`/decided|chosen|finalized/`) to extract decisions from transcripts. High false positive rate. `wb-post-tool-write.sh` writes one artifact entry per file edit — an agent touching 10 files generates 10 entries that say "edited X.ts" with no aggregated meaning.

3. **Two disconnected DAGs** — The frontend (`whiteboardLayout.ts`, 560 lines) infers a DAG from entry timestamps and refs. The Workflow Engine has an explicit task DAG. These two graphs coexist in the same chat but don't connect, so the user sees an "activity flow" that doesn't correspond to the actual execution plan.

## Goals

- War Room entries can carry structured data beyond a summary string
- War Room entries can be associated with specific workflow tasks
- Auto-extracted entries are reduced to only high-confidence, useful signals
- When a workflow exists, the visualization shows the real execution DAG instead of an inferred one
- Zero changes to orchestration logic (WorkflowEngine, WorkflowScheduler, handoff, Lead behavior)

## Non-Goals

- War Room does NOT make decisions or trigger actions (no reactive engine, no auto-advance)
- War Room does NOT replace or modify the Workflow Engine
- No new entry types — keep the existing 7 types stable
- No changes to agent prompt instructions for war room writing conventions (entry type definitions stay the same)

## Approach

### Phase 1: Entry Model Enrichment

Add three optional fields to `WhiteboardEntry`:

| Field | Type | Purpose |
|-------|------|---------|
| `payload` | `Record<string, unknown>` | Structured content (review findings, design alternatives, error info) |
| `taskId` | `string` | Links entry to a workflow task for grouping |
| `resolves` | `string` | Marks that this entry (typically a decision) addresses a specific open_question |

These are all optional and backward-compatible. Existing entries without these fields continue to work unchanged.

### Phase 2: Auto-extraction Noise Reduction

**`wb-auto-extract.sh` (Stop hook)**:
- Keep: goal extraction on first turn (useful fallback when agent doesn't write one)
- Remove: decision extraction (grep for "decided|chosen|finalized")
- Remove: open_question extraction (grep for "blocked|pending")
- Remove: constraint extraction (grep for "constraint|limitation")
- Rationale: agents already have prompt instructions to write these manually; agent-written entries are higher quality than grep-extracted ones

**`wb-post-tool-write.sh` (PostToolUse hook)**:
- Change artifact tracking from per-file to per-turn: instead of one entry per Edit/Write call, aggregate into a single "modified N files" entry at turn end
- Keep handoff tracking (still useful for real-time visibility)

### Phase 3: Visualization Unification

**With workflow present** (has active workflow in chat):
- Read task nodes and dependency edges from `WorkflowEngine.getState()`
- Each task node shows aggregated entry counts (e.g., "2 decisions · 1 blocker")
- Entries linked via `taskId` are grouped under their task node
- Entries without `taskId` (goal, chat-level constraints) render as floating context nodes above the DAG
- Click to expand a task node → see its entries

**Without workflow** (single handoff or no orchestration):
- Keep current `whiteboardLayout.ts` timeline inference logic as fallback
- No behavior change from today

## Risks

| Risk | Mitigation |
|------|------------|
| `payload` field could be abused for large data dumps | Enforce max payload size (e.g., 4KB) in WhiteboardManager validation |
| Removing auto-extraction may reduce entry volume if agents forget to write | Monitor entry rates; goal fallback ensures minimum context; can restore selective extraction later |
| Workflow DAG visualization requires frontend to read workflow state | Add a simple API endpoint or extend existing snapshot to include workflow task states |
| `taskId` linkage depends on agents knowing their task ID | Task ID is already passed in the task prompt (`[Workflow task: ${taskId}]`); skill scripts can parse and auto-inject |
