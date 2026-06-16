# Capability: Skill evolution lifecycle

TeemAI SHALL treat skills as governed procedural memory with provenance, usage telemetry, controlled mutation, archival, pinning, and rollback.

## ADDED Requirements

### Requirement: Skill provenance is tracked separately from SKILL.md content

The system SHALL store skill source and lifecycle metadata in a sidecar store or manifest rather than embedding operational telemetry into `SKILL.md`.

#### Scenario: Bundled skill is classified

- **Given** `whiteboard` exists in repo `ai-assets/skills` and runtime `~/.teemai/skills`
- **When** the seeder/audit runs
- **Then** the skill record has `source = "bundled"`
- **And** the record stores its runtime path and source hash

#### Scenario: Unknown runtime skill is preserved as user skill

- **Given** `~/.teemai/skills/slides/SKILL.md` exists but no matching repo asset exists
- **When** the seeder/audit runs
- **Then** the skill is classified as `source = "user"`
- **And** it is not deleted or archived automatically

### Requirement: Skill usage telemetry is captured

The system SHALL track skill use, view, and patch activity.

#### Scenario: Prompt-injected skill increments use count

- **Given** `architect` has the `architecture-review` skill configured
- **When** `architect` starts a mission and the skill is injected into its prompt
- **Then** `architecture-review.use_count` is incremented
- **And** `last_used_at` is updated

### Requirement: Skill mutation is controlled by `SkillEvolutionService`

The system SHALL mutate skills only through a service that validates paths, frontmatter, file size, provenance, and rollback snapshot creation.

#### Scenario: Path traversal is rejected

- **Given** a review job calls `skill_evolve.write_file` with `filePath = "../SOUL.md"`
- **When** the service validates the request
- **Then** the write is rejected
- **And** no file outside the skill directory is modified

#### Scenario: Invalid SKILL.md frontmatter is rejected

- **Given** a patch would remove the `name` field from `SKILL.md`
- **When** the service validates the patch
- **Then** the patch is rejected
- **And** the original file remains unchanged

### Requirement: Bundled skills are proposal-only by default

The system SHALL prevent background review jobs from directly mutating bundled skills.

#### Scenario: Bundled skill patch requires approval

- **Given** Sensei proposes a patch to bundled `whiteboard`
- **When** the review job completes
- **Then** the patch is stored as a proposal
- **And** `whiteboard/SKILL.md` remains unchanged until approved

### Requirement: Skills can be pinned, archived, and restored

The system SHALL support lifecycle actions for agent-created skills and preserve user control.

#### Scenario: Pinned skill is not archived

- **Given** an agent-created skill is pinned
- **When** the curator evaluates stale skills
- **Then** the pinned skill is not archived

#### Scenario: Archived skill can be restored

- **Given** an agent-created skill was archived by the curator
- **When** the user restores it
- **Then** the skill directory is restored
- **And** its lifecycle state becomes active

