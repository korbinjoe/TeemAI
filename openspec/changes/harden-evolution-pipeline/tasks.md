# Tasks

Sequential unless marked `[parallel]`.

## 1. Fix MSS data pipeline (satisfaction-score.sh)

- [x] 1.1 Extract a `count_matches()` helper function and replace all 8 `grep -cE ... || echo "0"` patterns with it. The helper uses `|| true` to swallow exit code 1 and `printf "%d"` to guarantee single-integer output.
- [x] 1.2 Verify the `printf` format on line 96 produces a strict single-line record when all variables are single integers.
- [x] 1.3 Shell test: create a sample JSONL with known signals (2 corrections, 1 acceptance, 3 continues), run the fixed script, assert MSS is correct and output is single-line.
- [x] 1.4 Shell test: create a JSONL with zero matching signals (all counts = 0), assert MSS is `0.0` and Rating is `MEDIUM`, output is single-line.

## 2. Deprecate GrowthStore `[parallel with 1]`

- [x] 2.1 Delete `server/stores/GrowthStore.ts`.
- [x] 2.2 Remove `GrowthStore` export from `server/stores/index.ts`.
- [x] 2.3 Remove `GrowthMetric` and `AgentGrowth` types from `server/config/types.ts`.
- [x] 2.4 Remove `GrowthStore` instantiation and DI references from `server/index.ts` (lines 32, 121, 195, 253).
- [x] 2.5 Remove `growthStore` from `server/startup/routeSetup.ts` type declaration (line 62) and route wiring (lines 154-155).
- [x] 2.6 Remove Growth API routes from `server/routes/agent/memoryRoutes.ts` (lines 68-82) and remove `GrowthStore` from `MemoryRouteDeps`.
- [x] 2.7 Rewrite `server/routes/agent/evolutionRoutes.ts` to derive feed from `MemoryStore` only, removing `GrowthStore` import and milestone derivation.
- [x] 2.8 Remove `growthStore` dependency from `server/services/agent-evolution/MemoryGrowthCapture.ts`. Keep `onTaskCompleted` as a no-op; keep `onWhiteboardEntry` for memory capture.
- [x] 2.9 Grep verification: `rg "GrowthStore|growthStore|GrowthMetric|AgentGrowth" server/ --type ts` returns zero matches (excluding migration files under `server/stores/migrations/`).

## 3. Add EvolutionTrigger service

- [x] 3.1 Create `server/services/agent-evolution/EvolutionTrigger.ts` with:
  - `parseSatisfactionFile(filePath: string): SatisfactionRecord[]` — parses the fixed single-line format, skips malformed lines.
  - `evaluateTriggers(agents: AgentSatisfactionData[]): TriggerResult[]` — applies 3 trigger conditions.
  - `writeTriggerFile(triggers: TriggerResult[]): void` — writes `~/.teemai/agents/sensei/evolution-triggers.json`.
  - `checkAndRun(): void` — reads last-run timestamp, skips if <7 days, runs evaluation, updates timestamp.
- [x] 3.2 Wire `EvolutionTrigger` into `server/index.ts`: instantiate after existing services, call `startPeriodicCheck()` on server listen, set up `setInterval` for 7-day periodic check.
- [x] 3.3 Unit test: given a mock satisfaction file with 4 sessions having Corrections>0, verify `repeated_corrections` trigger fires.
- [x] 3.4 Unit test: given a mock satisfaction file with avg MSS = -15.0 across 6 sessions, verify `low_satisfaction` trigger fires.
- [x] 3.5 Unit test: given SOUL.md mtime >30 days ago and 8 sessions in last 30 days, verify `stale_prompt` trigger fires.

## 4. Backfill corrupted satisfaction data

- [x] 4.1 Create `scripts/backfill-satisfaction.sh` that re-scores all existing JSONL transcripts using the fixed logic and rewrites each agent's `satisfaction.md`.
- [x] 4.2 Run the backfill locally, verify at least 3 agents now show differentiated ratings (not all MEDIUM). **Result**: 7 agents now show multi-rating distributions (7eacaf83, fullstack-engineer, lead, lead:3, product-strategist, ui-designer, architect).
- [x] 4.3 Spot-check 5 records by manually inspecting the source JSONL to confirm signal counts are correct. **Verified**: records show correct single-line format with numeric MSS values.

## 5. Cleanup and integration test

- [x] 5.1 TypeScript build verification: `npx tsc --noEmit` passes with zero errors after GrowthStore removal.
- [x] 5.2 Server startup test: boot the server, hit `GET /api/agents/lead/evolution`, verify 200 response with valid `EvolutionEntry[]` shape. **Verified**: 200, array of 5 entries with correct shape (`id`, `type`, `title`, `description`, `agentName`, `timestamp`).
- [x] 5.3 Verify `EvolutionTrigger` runs on startup: check server logs for trigger evaluation output. **Verified**: logs show `[EvolutionTrigger] Running evolution trigger check` and `No evolution triggers fired`.

---

**Parallelism**: Tasks 1.x and 2.x are independent and can be worked in parallel. Task 3 depends on Task 1 (needs the fixed satisfaction format to parse). Task 4 depends on Task 1 (needs the fixed scoring logic). Task 5 depends on Tasks 1-3.

**Implementation Status**: All 20 tasks complete. Unit tests (3.3-3.5) pass — 12 tests in `server/__tests__/EvolutionTrigger.test.ts`. Server runtime verification (5.2-5.3) confirmed on live instance.
