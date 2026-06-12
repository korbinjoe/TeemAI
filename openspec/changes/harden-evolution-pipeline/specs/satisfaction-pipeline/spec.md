# Capability: MSS satisfaction scoring pipeline

The system SHALL correctly compute a Mission Satisfaction Score (MSS) for each agent session via the `satisfaction-score.sh` stop hook, producing machine-parseable single-line records that accurately reflect user satisfaction signals.

## MODIFIED Requirements

### Requirement: Signal counting produces integer values regardless of match count

The stop hook SHALL count regex signal matches using a method that always yields a single integer value, including when the match count is zero. The current `grep -cE '...' || echo "0"` pattern is replaced with a helper that handles `grep`'s exit code 1 on zero matches.

#### Scenario: Zero matches produce count 0

- **Given** a JSONL transcript where no user message matches the escalation pattern
- **When** the satisfaction hook runs
- **Then** the `ESCALATIONS` variable contains exactly the string `"0"` (no trailing newline, no extra characters)
- **And** the MSS computation uses 0 as the escalation count

#### Scenario: Multiple matches produce the correct count

- **Given** a JSONL transcript where 3 user messages contain correction signals ("不对", "重新", "还是没")
- **When** the satisfaction hook runs
- **Then** the `CORRECTIONS` variable contains exactly the string `"3"`
- **And** the MSS formula uses 3 as the correction count

### Requirement: Satisfaction record is written as a single-line entry

The stop hook SHALL write each satisfaction record as exactly two lines to `~/.teemai/agents/<agent>/memory/satisfaction.md`: a header line (`## <chatId> — <date>`) and a data line with all fields pipe-separated on one line.

#### Scenario: Record with mixed signals produces single-line output

- **Given** a session with 10 turns, 2 corrections, 1 acceptance, 0 escalations
- **When** the satisfaction hook writes to `satisfaction.md`
- **Then** the data line reads: `MSS: -20.0 | Turns: 10 | Corrections: 2 | Escalations: 0 | Iterations: 0 | Acceptances: 1 | Commits: 0 | Rating: LOW`
- **And** the entire record (header + data + blank line) is exactly 3 lines

#### Scenario: All-zero signals produce MSS 0.0

- **Given** a session with 5 turns and no matching signals
- **When** the satisfaction hook writes to `satisfaction.md`
- **Then** the data line reads: `MSS: 0.0 | Turns: 5 | Corrections: 0 | Escalations: 0 | Iterations: 0 | Acceptances: 0 | Commits: 0 | Rating: MEDIUM`

## ADDED Requirements

### Requirement: Backfill script re-scores existing transcripts

A standalone `scripts/backfill-satisfaction.sh` SHALL re-process existing JSONL transcripts with the fixed scoring logic and rewrite each agent's `satisfaction.md` with correctly formatted records.

#### Scenario: Backfill produces differentiated ratings

- **Given** existing JSONL transcripts for `fullstack-engineer` with varying signal distributions
- **When** the backfill script runs
- **Then** the rewritten `satisfaction.md` contains records with at least 2 different `Rating` values (not all MEDIUM)
- **And** all records follow the single-line format
