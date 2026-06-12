# Proposal: Harden the agent self-evolution pipeline

## Summary

The self-evolution mechanism was designed as a 4-layer closed loop (Data Collection → Analysis → Action → Display), but a field audit reveals the pipeline is broken at multiple points: the MSS data collector has a shell bug that corrupts 100% of records, the Sensei evolution engine has never been triggered, and GrowthStore is in a contradictory state (deprecated per audit but still wired). This change fixes the data pipeline, deprecates GrowthStore cleanly, and adds a periodic Sensei trigger so the evolution loop can actually close.

## Motivation

### What the audit found

An audit of all historical missions (200+ satisfaction records across 13 agents, spanning 14 days from 2026-05-30 to 2026-06-12) reveals:

1. **MSS scoring is 100% corrupted** — `satisfaction-score.sh` has a `grep -c || echo "0"` bug that produces `"0\n0"` instead of `"0"` when match count is zero. Every single satisfaction record has broken formatting and useless MSS values. All ratings default to MEDIUM.

2. **Sensei has never executed an evolution cycle** — The Active Evolution Protocol (SOUL.md) defines 6 trigger conditions and a detailed analysis workflow, but no mechanism exists to invoke Sensei periodically. It was called exactly once (May 31) with no evolution proposals generated.

3. **GrowthStore is in limbo** — The `audit-agent-performance` change explicitly deprecated it ("no wiring, satisfaction evaluation handled by hook"), but `MemoryGrowthCapture` still calls `growthStore.increment()` and `evolutionRoutes.ts` still reads from it. Code and design intent are misaligned.

4. **Evolution feed has no useful data** — The `/api/agents/:id/evolution` endpoint and `EvolutionLog` UI work, but with GrowthStore stale and MemoryStore sparsely populated, the timeline shows almost nothing.

### Why this matters

The promise of TeemAI is "come back, find your team smarter than you left it." Without a functioning feedback loop, agent quality only improves through manual human audits — which have been effective (18+ SOUL.md revisions via git) but don't scale. Fixing the pipeline transforms these manual interventions into a sustainable process.

## Goals

1. **Fix the MSS data pipeline** so satisfaction scores are correctly computed and stored, providing a reliable baseline for future analysis.
2. **Deprecate GrowthStore cleanly** — remove all runtime references, keep the DB table for historical data, and migrate the evolution feed to derive data from satisfaction scores and MemoryStore only.
3. **Add a periodic Sensei trigger** so the Active Evolution Protocol actually fires when trigger conditions are met, instead of waiting for a manual invocation that never comes.
4. **Backfill corrupted satisfaction data** by re-running the fixed scoring script against existing JSONL transcripts.

## Non-Goals

- Building new UI surfaces for evolution (the existing EvolutionLog and AgentEditorPage are sufficient).
- Adding new signal types beyond what `satisfaction-score.sh` already classifies (7 signal types are adequate for Phase 1).
- Implementing the full Sensei eval infrastructure (before/after prompt comparison spawning). That remains a future phase.
- Adding vector/semantic retrieval to MemoryStore.
- Cross-agent memory sharing.

## Approach

### Part 1: Fix MSS data pipeline (satisfaction-score.sh)

The bug is on lines 44-54: `grep -cE '...' 2>/dev/null || echo "0"`. When `grep -c` finds 0 matches, it outputs "0" AND returns exit code 1. The `|| echo "0"` then fires, appending a second "0". The variable becomes `"0\n0"`.

**Fix**: Replace `|| echo "0"` with a proper pattern that captures the count correctly regardless of exit code:

```bash
# Before (broken)
ESCALATIONS=$(echo "$USER_TEXTS" | grep -cE '...' 2>/dev/null || echo "0")

# After (fixed)
ESCALATIONS=$(echo "$USER_TEXTS" | grep -cE '...' 2>/dev/null || true)
ESCALATIONS="${ESCALATIONS:-0}"
```

Additionally, fix the `printf` format to use a single-line output and add a structured format (pipe-separated on one line) for machine readability.

### Part 2: Deprecate GrowthStore

Remove GrowthStore from the runtime dependency graph:

1. **`server/index.ts`**: Remove `GrowthStore` instantiation and DI injection.
2. **`server/startup/routeSetup.ts`**: Remove `growthStore` from route deps.
3. **`server/routes/agent/memoryRoutes.ts`**: Remove Growth API routes (`GET /api/agents/:id/growth`, `POST /api/agents/:id/growth/:metric`).
4. **`server/routes/agent/evolutionRoutes.ts`**: Rewrite to derive the feed from `MemoryStore` + satisfaction data only, dropping the GrowthStore milestone dependency.
5. **`server/services/agent-evolution/MemoryGrowthCapture.ts`**: Remove `growthStore` dependency, keep only the `memoryStore` capture from whiteboard entries.
6. **`server/stores/GrowthStore.ts`**: Delete the file.
7. **`server/stores/index.ts`**: Remove the GrowthStore export.
8. **`server/config/types.ts`**: Remove `GrowthMetric` and `AgentGrowth` types.
9. **DB migration**: Do NOT drop the `agent_growth` table — keep it for historical reference. Just stop reading/writing.

### Part 3: Add periodic Sensei trigger

Add a lightweight server-side scheduled job that periodically analyzes accumulated satisfaction data and invokes Sensei when trigger conditions are met.

**Mechanism**: A new `server/services/agent-evolution/EvolutionTrigger.ts` service that:

1. Runs on a configurable interval (default: weekly, on server startup if >7 days since last run).
2. Reads all agents' `satisfaction.md` files from `~/.teemai/agents/*/memory/`.
3. Evaluates trigger conditions (simplified from Sensei SOUL.md's 6 triggers to 3 actionable ones):
   - **Repeated corrections**: Agent has ≥3 sessions with `Corrections > 0` in the last 7 days.
   - **Persistent low satisfaction**: Agent's average MSS is below 0 across ≥5 sessions in the last 14 days.
   - **Stale prompt**: Agent has active usage (≥5 sessions in 30 days) but SOUL.md not modified in >30 days.
4. When triggers fire, writes a structured `evolution-triggers.json` to `~/.teemai/agents/sensei/` with the triggered agents and evidence. This file serves as input for the next Sensei invocation.
5. Optionally auto-dispatches a Sensei chat with the trigger context (configurable, defaults to manual — just writes the trigger file and logs a notification).

**Not a cron job** — runs in-process on the Express server, using a simple `setInterval` with persistence of last-run timestamp in the DB or a dotfile.

### Part 4: Backfill satisfaction data

After fixing the script, provide a one-time backfill command:

```bash
# scripts/backfill-satisfaction.sh
# Iterates all JSONL transcripts, re-runs the fixed scoring logic, rewrites satisfaction.md
```

This is a standalone script, not part of the runtime. Run once after deploying the fix.

## Compatibility

- **No schema migration required** — GrowthStore removal is code-only; the `agent_growth` table stays.
- **No breaking API changes for the web layer** — the frontend does not currently call Growth APIs (confirmed: `rg "growthStore|GrowthStore|agent_growth|useAgentGrowth" web/` returns no matches).
- **Evolution feed API shape unchanged** — `GET /api/agents/:id/evolution` returns the same `EvolutionEntry[]` type, just sourced differently.
- **Satisfaction hook output format changes** — existing corrupt data will be replaced by backfill.

## Risks

| Risk | Mitigation |
|------|------------|
| Backfill may miss some JSONL transcripts (deleted/rotated) | Acceptable — backfill is best-effort; going forward all new data will be correct |
| Sensei auto-dispatch could generate noise | Default to trigger-file-only (no auto-dispatch); user must manually invoke Sensei. Auto-dispatch is opt-in via config. |
| Removing GrowthStore breaks unknown consumers | Grep confirms zero web-layer references; server references are fully enumerated in this proposal |
| MSS regex patterns may need tuning for new interaction patterns | The signal taxonomy is unchanged; refinement is a separate concern from fixing the data pipeline |

## Validation

- Shell test: run fixed `satisfaction-score.sh` against a sample JSONL with known signal distribution, verify single-line output with correct MSS value.
- Integration test: verify `EvolutionTrigger` correctly identifies agents with repeated corrections from sample satisfaction data.
- Manual: after backfill, open an agent's satisfaction.md and verify records are single-line, MSS values are numeric, ratings are differentiated (not all MEDIUM).
- Grep verification: after GrowthStore removal, `rg "GrowthStore|growthStore|agent_growth" server/` returns zero matches (excluding migration files).

See `tasks.md` for the ordered work breakdown.
