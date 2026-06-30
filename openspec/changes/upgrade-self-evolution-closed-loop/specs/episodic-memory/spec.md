# Capability: Episodic memory retrieval

TeemAI SHALL store prior mission experience as actionable lessons that can improve future agent execution.

## ADDED Requirements

### Requirement: Mission episodes include concrete lessons

The system SHALL extract mission episodes with a concrete lesson, outcome, user goal, corrections, acceptance signals, and touched files when those signals are available.

#### Scenario: Completed mission stores reusable lesson

- **Given** `fullstack-engineer` completes a mission where the user corrected a stale callback bug
- **When** the mission is finalized
- **Then** the indexed episode summary states the stale callback lesson
- **And** the episode includes outcome, mission id, agent id, and affected files
- **And** the summary is more specific than "Mission completed by fullstack-engineer"

### Requirement: Failed episodes require explicit lessons before injection

The system SHALL avoid injecting failed or blocked episodes into future prompts unless the episode contains an explicit lesson.

#### Scenario: Failed episode without lesson is filtered

- **Given** a failed episode matches the current query
- **And** the episode has no explicit lesson
- **When** prior episodes are selected for prompt injection
- **Then** the failed episode is excluded

#### Scenario: Failed episode with lesson can be injected

- **Given** a failed episode documents a concrete lesson about missing permissions
- **When** a similar future task starts
- **Then** the episode can be injected
- **And** the injected text labels the outcome as `failed`

### Requirement: Episode extraction uses transcript tail signals

The system SHALL use available JSONL transcript tail signals to improve episode summaries.

#### Scenario: Transcript corrections are captured

- **Given** the final transcript contains repeated user corrections and a final accepted result
- **When** the episode extractor indexes the mission
- **Then** the episode includes the correction pattern
- **And** the episode includes the final accepted approach
