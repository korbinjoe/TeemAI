# Design: Harden the evolution pipeline

## 1. MSS Bug — Root Cause and Fix

### 1.1 The bug

`satisfaction-score.sh` lines 48-54 use this pattern for signal counting:

```bash
ESCALATIONS=$(echo "$USER_TEXTS" | grep -cE 'pattern' 2>/dev/null || echo "0")
```

`grep -c` returns exit code 1 when match count is 0 (per POSIX spec). The `|| echo "0"` fallback fires on exit code 1, producing stdout `"0\n0"` — the grep output `"0"` followed by the echo `"0"`. This multi-line value corrupts the `printf` on line 96, splitting fields across lines.

The same pattern affects 7 variables: `ESCALATIONS`, `CORRECTIONS`, `AESTHETIC_REJ`, `ITERATIONS`, `CONTINUES`, `ACCEPTANCES`, `COMMITS`.

`TOTAL_TURNS` (line 44) has the same bug but is less visible because `grep -c '.'` on non-empty input rarely returns 0.

### 1.2 The fix

Replace all 8 occurrences with:

```bash
count_matches() {
  local count
  count=$(echo "$1" | grep -cE "$2" 2>/dev/null) || true
  printf "%d" "${count:-0}"
}

ESCALATIONS=$(count_matches "$USER_TEXTS" '为啥还|怎么还|一通.*后|恶心|反复修.*修不好')
CORRECTIONS=$(count_matches "$USER_TEXTS" '不对|错了|重新|没有实现|还是没|没得到解决|你这也没')
# ... etc
```

The `|| true` swallows the exit code; `printf "%d"` ensures the value is always a single integer on one line.

### 1.3 Output format fix

Current `printf` (line 96) writes a two-line record with embedded newlines that break machine parsing. Change to a strict single-line format:

```
## <chatId> — <date>
MSS: <value> | Turns: <n> | Corrections: <n> | Escalations: <n> | Iterations: <n> | Acceptances: <n> | Commits: <n> | Rating: <RATING>
```

This is exactly what the current format *intends* to produce, just not what it actually produces due to the multi-line variable bug.

---

## 2. GrowthStore Deprecation — Dependency Graph

### 2.1 Current references

```
server/stores/GrowthStore.ts              ← Store implementation (DELETE)
server/stores/index.ts                    ← re-exports GrowthStore (REMOVE export)
server/config/types.ts                    ← GrowthMetric, AgentGrowth types (DELETE)
server/index.ts:32                        ← imports GrowthStore (REMOVE)
server/index.ts:121                       ← instantiates growthStore (REMOVE)
server/index.ts:195                       ← passes to MemoryGrowthCapture (REMOVE param)
server/index.ts:253                       ← passes to routeSetup deps (REMOVE)
server/startup/routeSetup.ts:62           ← type declaration (REMOVE)
server/startup/routeSetup.ts:155          ← passes to createMemoryRoutes (REMOVE)
server/startup/routeSetup.ts:155          ← passes to createEvolutionRoutes (REMOVE)
server/routes/agent/memoryRoutes.ts:9     ← imports GrowthStore type (REMOVE)
server/routes/agent/memoryRoutes.ts:12-15 ← GrowthStore in MemoryRouteDeps (REMOVE)
server/routes/agent/memoryRoutes.ts:70-82 ← Growth API routes (DELETE)
server/routes/agent/evolutionRoutes.ts    ← imports+uses GrowthStore (REWRITE)
server/services/agent-evolution/MemoryGrowthCapture.ts ← uses growthStore (REMOVE)
```

### 2.2 Migration table policy

The `agent_growth` table (created in `server/stores/migrations/v3.ts`) is **NOT dropped**. Migration files are append-only; deleting a migration breaks schema versioning. The table simply has no readers or writers after this change.

### 2.3 Evolution feed after deprecation

`GET /api/agents/:id/evolution` currently derives entries from:
- `MemoryStore` → `memory_updated` events ✅ (keep)
- `GrowthStore` → `milestone` events ❌ (remove)

After deprecation, the feed sources from `MemoryStore` only. The `milestone` type is reserved in the `EvolutionType` union for future use but produces no entries.

---

## 3. EvolutionTrigger Service

### 3.1 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Express server (server/index.ts)                            │
│                                                             │
│  ┌──────────────────────┐    ┌───────────────────────────┐  │
│  │ EvolutionTrigger      │    │ ~/.teemai/agents/         │  │
│  │                       │───▶│   */memory/satisfaction.md │  │
│  │ - checkInterval: 7d   │    │                           │  │
│  │ - parseAllSatisfaction │    │   sensei/                 │  │
│  │ - evaluateTriggers    │───▶│     evolution-triggers.json│  │
│  │ - writeTriggerFile    │    └───────────────────────────┘  │
│  └──────────────────────┘                                   │
│           │                                                 │
│           ▼                                                 │
│  ┌──────────────────────┐                                   │
│  │ ~/.teemai/            │                                  │
│  │  .evolution-last-run  │ (timestamp of last trigger check)│
│  └──────────────────────┘                                   │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Trigger conditions

Simplified from Sensei SOUL.md's 6 triggers to 3 that can be evaluated from available data:

| Trigger | Data Source | Threshold | Evidence Output |
|---------|------------|-----------|-----------------|
| Repeated corrections | `satisfaction.md` Corrections field | ≥3 sessions with Corrections>0 in 7 days | List of chatIds, correction counts |
| Low satisfaction | `satisfaction.md` MSS field | Avg MSS < 0 across ≥5 sessions in 14 days | Avg MSS, session count, worst sessions |
| Stale prompt | `SOUL.md` mtime vs satisfaction session count | ≥5 sessions in 30 days AND SOUL.md unchanged >30 days | Last modified date, session count |

Triggers that depend on unavailable data are deferred:
- Performance degradation (needs baseline history — Phase 2)
- Scope confusion / handoff loops (needs mailbox analysis — Phase 2)
- New capability gap (needs war-room constraint analysis — Phase 2)

### 3.3 Output format

`~/.teemai/agents/sensei/evolution-triggers.json`:

```json
{
  "generatedAt": "2026-06-12T14:00:00Z",
  "triggers": [
    {
      "agentId": "fullstack-engineer",
      "type": "repeated_corrections",
      "severity": "high",
      "evidence": {
        "sessionsWithCorrections": 4,
        "periodDays": 7,
        "examples": ["chatId1", "chatId2", "chatId3", "chatId4"]
      }
    },
    {
      "agentId": "ui-designer",
      "type": "stale_prompt",
      "severity": "medium",
      "evidence": {
        "lastModified": "2026-05-31T13:59:00Z",
        "sessionsSince": 8
      }
    }
  ]
}
```

### 3.4 Execution model

- **In-process setInterval**: Runs inside the Express server, not a separate process. Checks once per startup if >7 days since last run, then every 7 days thereafter.
- **Last-run persistence**: Stored as `~/.teemai/.evolution-last-run` (simple ISO timestamp file). Survives server restarts.
- **No auto-dispatch in Phase 1**: The trigger file is passive. Sensei must be manually invoked. The trigger file serves as a "to-do list" for Sensei when it runs.
- **Future opt-in auto-dispatch**: A later phase can add auto-dispatch by creating a Sensei chat with the trigger context when triggers fire.

### 3.5 Satisfaction file parser

The parser reads the fixed single-line format:

```
## <chatId> — <date>
MSS: <value> | Turns: <n> | Corrections: <n> | Escalations: <n> | Iterations: <n> | Acceptances: <n> | Commits: <n> | Rating: <RATING>
```

Regex: `^MSS:\s*([\d.-]+)\s*\|\s*Turns:\s*(\d+)\s*\|\s*Corrections:\s*(\d+)\s*\|\s*Escalations:\s*(\d+)\s*\|\s*Iterations:\s*(\d+)\s*\|\s*Acceptances:\s*(\d+)\s*\|\s*Commits:\s*(\d+)\s*\|\s*Rating:\s*(\S+)`

Lines that don't match this regex (corrupted old data) are skipped with a warning log.

---

## 4. Backfill Strategy

### 4.1 Script design

`scripts/backfill-satisfaction.sh`:

1. Find all JSONL transcript files from `~/.claude/projects/` that belong to TeemAI sessions.
2. For each transcript, identify the agent (from `TEEMAI_INSTANCE_ID` env context or by matching the JSONL's session to `chats.expert_sessions` in the DB).
3. Run the fixed scoring logic (extracted as a function from `satisfaction-score.sh`).
4. Rewrite each agent's `satisfaction.md` with correctly formatted records.

### 4.2 Limitations

- Transcripts that have been deleted/rotated are unrecoverable.
- Agent identification for very old sessions may be ambiguous.
- Backfill is best-effort; the primary value is going-forward correctness.

---

## 5. Decisions

### D1: Delete GrowthStore vs. keep as dead code

**Decision**: Delete `GrowthStore.ts` and all type references. Don't keep dead code.

Rationale: The file has no consumers after removal. Keeping it creates confusion about whether it's active. The DB table is preserved by the migration system so historical data is not lost. If a future change needs XP/leveling, it can be reimplemented with a cleaner design informed by real usage data.

### D2: Evolution feed without GrowthStore

**Decision**: Feed derives from `MemoryStore` only. The `milestone` EvolutionType is kept in the union but produces zero entries.

Rationale: The GrowthStore milestones were never populated with real data (only `tasks_completed` was wired, and even that was sparse). The MemoryStore-derived `memory_updated` entries are the more valuable signal. When satisfaction-derived milestones become valuable (e.g., "agent crossed from LOW to HIGH rating"), they can be added as a new producer without changing the API shape.

### D3: Sensei trigger — in-process vs. external cron

**Decision**: In-process `setInterval` in the Express server.

Rationale: No new process to manage. The check is lightweight (reads ~15 small files, pure computation). Server restart naturally re-evaluates. External cron adds ops complexity for no benefit at this scale.

### D4: Satisfaction format — structured file vs. SQLite

**Decision**: Keep the markdown file format. Do not move satisfaction data to SQLite.

Rationale: The markdown files are human-readable, debuggable, and agent-readable (agents can `cat` them). The data volume is small (~100 records per agent per month). SQLite would add a migration, a store class, and route for no benefit. The file format with a fixed single-line schema is easily machine-parseable.
