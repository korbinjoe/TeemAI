# Capability: Agent self-evolution loop

TeemAI SHALL convert captured agent performance signals into evidence-backed evolution proposals and apply them only through an auditable approval and rollback flow.

## ADDED Requirements

### Requirement: Agent identity is canonicalized across memory, satisfaction, and evolution

The system SHALL normalize runtime instance identifiers to canonical registered agent ids before writing or evaluating memory, satisfaction, and evolution signals.

#### Scenario: Instance suffix maps to canonical agent

- **Given** `TEEMAI_INSTANCE_ID` is `lead:2`
- **When** the satisfaction hook writes its record
- **Then** the record is written under `~/.teemai/agents/lead/memory/satisfaction.md`
- **And** no new `~/.teemai/agents/lead:2` directory is created

#### Scenario: Auto suffix maps to canonical agent

- **Given** a whiteboard entry has `by = "fullstack-engineer:auto"`
- **When** memory capture processes the entry
- **Then** the memory row uses `agent_id = "fullstack-engineer"`

### Requirement: Captured memory is injected into the same agent's future prompt

The system SHALL read cross-session memory using the canonical `agent.id`, not display name, when building agent prompts.

#### Scenario: Whiteboard decision becomes prompt memory

- **Given** `MemoryGrowthCapture` stores a decision with `agentId = "fullstack-engineer"`
- **When** `fullstack-engineer` starts a later mission
- **Then** the generated prompt contains the decision in `## Cross-Session Memory`

### Requirement: Evolution triggers enqueue review jobs

When an evolution trigger fires, the system SHALL enqueue an `EvolutionReviewJob` instead of only writing a passive JSON file.

#### Scenario: Low satisfaction creates review job

- **Given** `ui-designer` has average MSS below 0 across at least 5 recent sessions
- **When** `EvolutionTrigger` runs
- **Then** an `EvolutionReviewJob` is created for `ui-designer`
- **And** the job evidence includes the triggering session ids and MSS values

### Requirement: Review jobs are proposal-only by default

Background evolution review jobs SHALL NOT directly mutate agent prompts or skills unless the resulting proposal is explicitly approved.

#### Scenario: Sensei proposes but does not apply

- **Given** a review job identifies a stale prompt issue
- **When** the job completes
- **Then** it stores a proposal containing an exact diff
- **And** `SOUL.md` remains unchanged until the user approves the proposal

### Requirement: Approved changes are auditable and reversible

Every approved agent or skill evolution change SHALL create a rollback snapshot and an EvolutionLog entry.

#### Scenario: Approved prompt patch records rollback

- **Given** a user approves a Sensei proposal to patch `ai-assets/agents/code-reviewer/SOUL.md`
- **When** the system applies the patch
- **Then** it writes a rollback snapshot
- **And** it creates an EvolutionLog entry with evidence, changed file, and rollback reference

