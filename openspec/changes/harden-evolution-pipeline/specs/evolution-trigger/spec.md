# Capability: Periodic evolution trigger for Sensei

The system SHALL periodically evaluate agent satisfaction data against trigger conditions and produce a structured trigger file that serves as input for the Sensei evolution engine, so that the Active Evolution Protocol can fire without manual invocation.

## ADDED Requirements

### Requirement: EvolutionTrigger service evaluates triggers on a weekly schedule

The server SHALL run an `EvolutionTrigger` check on startup (if >7 days since last run) and every 7 days thereafter, parsing each agent's `satisfaction.md` and evaluating 3 trigger conditions.

#### Scenario: First startup triggers evaluation

- **Given** no `~/.teemai/.evolution-last-run` file exists
- **When** the server starts
- **Then** the EvolutionTrigger runs immediately
- **And** writes the current timestamp to `~/.teemai/.evolution-last-run`

#### Scenario: Recent run skips evaluation

- **Given** `~/.teemai/.evolution-last-run` contains a timestamp from 3 days ago
- **When** the server starts
- **Then** the EvolutionTrigger does not run
- **And** the last-run timestamp is unchanged

### Requirement: Repeated corrections trigger fires on threshold

The system SHALL fire a `repeated_corrections` trigger when an agent has ≥3 sessions with `Corrections > 0` within the last 7 days.

#### Scenario: Agent with 3 corrected sessions triggers

- **Given** `fullstack-engineer` has 3 sessions in the last 7 days with Corrections counts of 2, 1, 1
- **When** the trigger evaluator runs
- **Then** a `repeated_corrections` trigger is generated for `fullstack-engineer`
- **And** the evidence includes the 3 session chatIds and their correction counts

#### Scenario: Agent with 2 corrected sessions does not trigger

- **Given** `architect` has 2 sessions in the last 7 days with Corrections counts of 1, 3
- **When** the trigger evaluator runs
- **Then** no `repeated_corrections` trigger is generated for `architect`

### Requirement: Low satisfaction trigger fires on sustained negative MSS

The system SHALL fire a `low_satisfaction` trigger when an agent's average MSS is below 0 across ≥5 sessions in the last 14 days.

#### Scenario: Sustained negative MSS triggers

- **Given** `ui-designer` has 6 sessions in the last 14 days with MSS values [-10, -5, -20, 5, -15, -8]
- **And** the average MSS is -8.8
- **When** the trigger evaluator runs
- **Then** a `low_satisfaction` trigger is generated for `ui-designer`

#### Scenario: Positive average MSS does not trigger

- **Given** `lead` has 10 sessions in the last 14 days with an average MSS of 15.0
- **When** the trigger evaluator runs
- **Then** no `low_satisfaction` trigger is generated for `lead`

### Requirement: Stale prompt trigger fires when agent is active but un-evolved

The system SHALL fire a `stale_prompt` trigger when an agent has ≥5 sessions in the last 30 days AND its `SOUL.md` file has not been modified in >30 days.

#### Scenario: Active agent with stale prompt triggers

- **Given** `code-reviewer` has 8 sessions in the last 30 days
- **And** `code-reviewer`'s `SOUL.md` was last modified 45 days ago
- **When** the trigger evaluator runs
- **Then** a `stale_prompt` trigger is generated for `code-reviewer`

#### Scenario: Active agent with recently updated prompt does not trigger

- **Given** `fullstack-engineer` has 20 sessions in the last 30 days
- **And** `fullstack-engineer`'s `SOUL.md` was last modified 5 days ago
- **When** the trigger evaluator runs
- **Then** no `stale_prompt` trigger is generated for `fullstack-engineer`

### Requirement: Trigger file is written to Sensei workspace

When any triggers fire, the system SHALL write a structured JSON file to `~/.teemai/agents/sensei/evolution-triggers.json` containing the timestamp, triggered agents, trigger types, severity, and evidence.

#### Scenario: Multiple triggers produce a combined file

- **Given** `fullstack-engineer` has a `repeated_corrections` trigger
- **And** `ui-designer` has a `low_satisfaction` trigger
- **When** the trigger file is written
- **Then** `~/.teemai/agents/sensei/evolution-triggers.json` contains exactly 2 entries
- **And** each entry includes `agentId`, `type`, `severity`, and `evidence` fields

#### Scenario: No triggers produce no file write

- **Given** no agent meets any trigger condition
- **When** the trigger evaluator completes
- **Then** no trigger file is written (existing file, if any, is unchanged)
