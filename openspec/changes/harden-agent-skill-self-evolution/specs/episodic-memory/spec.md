# Capability: Episodic memory retrieval

TeemAI SHALL index prior mission trajectories and inject relevant prior episodes into future agent execution so agents can reuse successful approaches and avoid repeated failures.

## ADDED Requirements

### Requirement: Completed missions are indexed as episodes

The system SHALL create an episode record for completed missions and workflow tasks using JSONL/session metadata, task summaries, and whiteboard durable entries.

#### Scenario: Completed mission creates episode

- **Given** `fullstack-engineer` completes a mission with a result summary
- **When** the mission is finalized
- **Then** an episode is indexed with agent id, mission id, title, summary, outcome, files, and timestamp

### Requirement: Episode search ranks by relevance, outcome, agent match, and recency

The system SHALL retrieve prior episodes using lightweight full-text search and deterministic ranking.

#### Scenario: Same-agent success ranks above unrelated result

- **Given** two matching episodes exist, one successful episode by `fullstack-engineer` and one unrelated episode by `growth-marketer`
- **When** `fullstack-engineer` receives a similar task
- **Then** the same-agent successful episode ranks higher

### Requirement: Prior episodes are injected with strict limits

The system SHALL inject at most three relevant prior episodes into the agent prompt and cap the injected text size.

#### Scenario: Relevant episodes are injected before execution

- **Given** three high-confidence prior episodes match a new task
- **When** the target agent starts
- **Then** the prompt contains a `## Prior Similar Episodes` section
- **And** the section includes outcome and source references
- **And** the section stays within the configured character limit

### Requirement: Low-confidence episodes are not injected

The system SHALL avoid injecting prior episodes when relevance is below threshold.

#### Scenario: No relevant episode found

- **Given** episode search returns only low-confidence matches
- **When** the agent starts a task
- **Then** no `Prior Similar Episodes` section is injected

