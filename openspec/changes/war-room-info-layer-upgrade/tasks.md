# War Room Info Layer Upgrade — Tasks

## Phase 1: Entry Model Enrichment

- [x] Add `payload`, `taskId`, `resolves` to `WhiteboardEntry` in `shared/whiteboard-types.ts`
- [x] Add `payload`, `taskId`, `resolves` to `WhiteboardEntryInput` type
- [x] Add `taskId` to `WhiteboardQueryOptions`
- [x] Update `WhiteboardManager.validateInput()` with payload size check (≤4KB), taskId length check (≤64), resolves existence check
- [x] Update `parseEntryInput()` in `whiteboardRoutes.ts` to parse new fields from request body
- [x] Update GET entries endpoint to support `taskId` query filter
- [x] Add `taskEntries` grouping to `WhiteboardManager.getSnapshot()`
- [x] Update `ContextBriefing.composeSections()` to group entries by taskId when available
- [x] Update `wb-write.sh` to accept `--payload`, `--task`, `--resolves` flags
- [x] Add tests for new field validation (payload size, taskId format, resolves target check)
- [x] Add tests for taskId query filtering

## Phase 2: Auto-extraction Noise Reduction

- [x] Remove Rules 5/6/7 (decision/open_question/constraint grep extraction) from `wb-auto-extract.sh`
- [x] Add artifact accumulator logic to `wb-post-tool-write.sh`: write file path to temp accumulator file instead of immediate entry
- [x] Add artifact flush logic to `wb-auto-extract.sh`: read accumulator file at turn end, write single aggregated artifact entry, delete accumulator
- [x] Update existing tests for `wb-auto-extract.sh` if any
- [x] Verify handoff tracking in `wb-post-tool-write.sh` still works unchanged

## Phase 3: Visualization Unification

- [x] Add `includeWorkflow` query param to GET snapshot endpoint; join workflow task states from `WorkflowRegistry`
- [x] Define `WorkflowTaskNode` type for frontend consumption in `shared/whiteboard-types.ts`
- [x] Implement `layoutWorkflowDag()` in `web/lib/whiteboardLayout.ts` — topological sort of task nodes, entry grouping by taskId, floating entries
- [x] Update `WhiteboardFlowView.tsx` to choose between `layoutWorkflowDag` and `layoutWhiteboardDag` based on workflow presence
- [x] Create task node component for workflow DAG view (shows aggregated entry counts, status, expand/collapse)
- [ ] ~~Update `WarRoomPanel.tsx` to show task-based grouping when workflow is present~~ — SKIPPED: Panel removed per design decision
- [x] Add tests for `layoutWorkflowDag()` layout logic
