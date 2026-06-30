# Capability: Agent self-evolution loop

TeemAI SHALL close the self-evolution loop by converting captured performance evidence into structured, approved, reversible behavior changes.

## ADDED Requirements

### Requirement: Review proposals contain executable structured actions

The system SHALL store each actionable evolution proposal with machine-readable actions in addition to human-readable evidence, diff, risk, validation, and rollback sections.

#### Scenario: Sensei proposal includes actions

- **Given** a review job identifies a stale prompt issue for `code-reviewer`
- **When** the review job reaches `proposal_ready`
- **Then** the stored proposal contains at least one structured action
- **And** the action target matches `code-reviewer`
- **And** the proposal still contains evidence, root cause, diff, risk, validation plan, and rollback path

### Requirement: Invalid proposal actions are rejected before proposal_ready

The system SHALL validate structured proposal actions before marking a review job as ready for user approval.

#### Scenario: Path traversal action is rejected

- **Given** Sensei outputs an agent patch action with `filePath = "../server/index.ts"`
- **When** the proposal is validated
- **Then** the review job is marked `failed`
- **And** no proposal is shown as ready
- **And** no file is modified

### Requirement: Approved apply mutates files through controlled services

The system SHALL execute approved proposal actions through controlled mutation services rather than directly changing review job status.

#### Scenario: Approved agent prompt patch is applied

- **Given** a proposal for `ui-designer` is approved
- **And** the proposal contains a valid `SOUL.md` patch action
- **When** the user applies the proposal
- **Then** `AgentEvolutionService` applies the patch
- **And** a rollback snapshot is created
- **And** the review job status becomes `applied`
- **And** an EvolutionLog entry records changed file and rollback reference

#### Scenario: Unapproved proposal cannot be applied

- **Given** a proposal is still `proposal_ready`
- **When** a client calls apply
- **Then** the request is rejected
- **And** no agent or skill file is modified

### Requirement: Apply results are auditable

The system SHALL persist applied action results, changed files, and rollback references for every applied review job.

#### Scenario: User inspects applied proposal

- **Given** a skill patch proposal has been applied
- **When** the user opens the proposal detail view
- **Then** the UI shows the applied action status
- **And** it shows the changed file
- **And** it shows the rollback reference

### Requirement: Review jobs run with proposal-safe capabilities only

The system SHALL restrict Sensei review jobs to evidence gathering and proposal generation capabilities.

#### Scenario: Review runner receives restricted tool surface

- **Given** an evolution review job is running
- **When** the Sensei runner is invoked
- **Then** it can inspect readonly evidence and search episodes
- **And** it cannot directly write `SOUL.md`, `AGENTS.md`, `IDENTITY.md`, or `SKILL.md`

### Requirement: Placeholder proposals do not masquerade as actionable reviews

The system SHALL fail or explicitly mark review jobs as unavailable when a real review runner cannot produce an actionable proposal.

#### Scenario: Runner unavailable

- **Given** no Sensei review runner is configured
- **When** a review job is executed outside deterministic dry-run mode
- **Then** the job is marked `failed`
- **And** the error explains that the review runner is unavailable
- **And** no placeholder proposal is exposed for approval
