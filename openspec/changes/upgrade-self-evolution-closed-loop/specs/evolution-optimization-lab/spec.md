# Capability: Evolution optimization lab

TeemAI SHALL support offline, evaluation-gated optimization experiments for agent prompts and skills while routing all winning candidates through the governed proposal pipeline.

## ADDED Requirements

### Requirement: Optimization lab runs are proposal-only

The optimization lab SHALL NOT directly mutate active agent prompt files or runtime skill files.

#### Scenario: Skill optimization produces proposal only

- **Given** an optimization lab run targets the `whiteboard` skill
- **When** the run finds a higher-scoring candidate
- **Then** it enqueues an `EvolutionReviewJob` with proposal metrics and structured actions
- **And** `whiteboard/SKILL.md` remains unchanged

### Requirement: Candidate improvements are evaluated against holdout data

The optimization lab SHALL compare baseline and candidate behavior using a held-out evaluation split before producing a proposal.

#### Scenario: Candidate must improve holdout score

- **Given** a candidate skill variant improves training examples but performs worse on holdout
- **When** optimization results are evaluated
- **Then** no proposal is created for that candidate
- **And** the run records the holdout regression

### Requirement: Optimization proposals include metrics and gates

Optimization lab proposals SHALL include baseline score, candidate score, holdout score, dataset source, size change, and gate results.

#### Scenario: Proposal displays optimization metrics

- **Given** a prompt-section candidate passes all gates
- **When** the proposal is shown in the UI
- **Then** the user can inspect baseline score, candidate score, holdout score, dataset source, size change, and gate results

### Requirement: Size and semantic-preservation gates are enforced

The optimization lab SHALL reject candidates that exceed configured size growth or drift from the original target purpose.

#### Scenario: Candidate is too large

- **Given** a candidate `SKILL.md` body is 40% larger than baseline
- **When** gates are evaluated with a 20% growth limit
- **Then** the candidate is rejected
- **And** no proposal is created for it

#### Scenario: Candidate changes target purpose

- **Given** a `code-reviewer` prompt candidate changes the agent into a product strategist
- **When** semantic-preservation gates are evaluated
- **Then** the candidate is rejected
- **And** the rejection reason mentions semantic drift
