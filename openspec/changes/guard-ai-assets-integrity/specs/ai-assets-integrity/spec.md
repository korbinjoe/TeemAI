# Capability: ai-assets integrity guard

The system SHALL guarantee that every built-in skill and agent declared in the team configuration (`teemai.json` and `ai-assets/agents/*/`) is present and structurally well-formed in `ai-assets/`, blocking such regressions in CI and alarming on them at runtime, so that a silent deletion of orchestration assets cannot reach or persist in production undetected.

## ADDED Requirements

### Requirement: Declared-vs-shipped integrity validator

The system SHALL provide a read-only validator that derives the set of required skills and agents from the existing declarations (`teemai.json` `agents[].skills` and `ai-assets/agents/*/` configs) and compares it against the assets actually present under `ai-assets/`, returning a structured report of missing skills, missing agents, and malformed skills (a skill directory whose `SKILL.md` is absent or empty). The validator MUST NOT introduce a separate manifest file as the source of truth, and MUST NOT mutate any files.

#### Scenario: All declared assets present

- **Given** every skill listed in any agent's `skills` array in `teemai.json` has a non-empty `ai-assets/skills/<name>/SKILL.md`
- **And** every declared agent has its required config files present
- **When** the validator runs
- **Then** it returns a report with empty `missingSkills`, `missingAgents`, and `malformedSkills`

#### Scenario: Declared skill deleted from filesystem

- **Given** `teemai.json` declares `"skills": ["handoff", "workflow", "whiteboard"]` for an agent
- **And** the directory `ai-assets/skills/handoff/` does not exist
- **When** the validator runs
- **Then** the report's `missingSkills` includes `handoff`
- **And** the entry records the agent id(s) that declared it in `declaredBy`

#### Scenario: Skill directory present but SKILL.md missing

- **Given** the directory `ai-assets/skills/whiteboard/` exists but contains no `SKILL.md`
- **When** the validator runs
- **Then** the report's `malformedSkills` includes `whiteboard` with a reason indicating the missing `SKILL.md`

### Requirement: CI gate blocks merges that break declared assets

The continuous integration pipeline SHALL run the integrity validator on every pull request and push to the protected branch, and SHALL fail the build (non-zero exit) when the report contains any missing skill, missing agent, or malformed skill, printing a precise per-asset failure message.

#### Scenario: PR deletes a declared skill

- **Given** a pull request whose diff removes `ai-assets/skills/handoff/` while `teemai.json` still declares `handoff`
- **When** CI runs the `check:ai-assets` step
- **Then** the step exits non-zero
- **And** the pull request check is reported as failing
- **And** the output names `handoff` and the agent(s) that declared it

#### Scenario: PR retires a skill and its declaration together

- **Given** a pull request that removes `ai-assets/skills/doc-writer/` and also removes `doc-writer` from every agent's `skills` array in `teemai.json`
- **When** CI runs the `check:ai-assets` step
- **Then** the step exits zero
- **And** the pull request check passes

### Requirement: Startup integrity alarm without crashing

On server startup, after built-in skills are loaded, the system SHALL run the same integrity validation and, when any declared asset is missing or malformed, SHALL emit a structured error log and set an `ai-assets` health signal to `degraded` listing the missing assets. The server MUST continue to boot rather than crash, so that the degraded state can be surfaced to the user.

#### Scenario: Missing declared skill detected at startup

- **Given** a declared skill `workflow` is absent from the loaded built-in skills at startup
- **When** the startup integrity validation runs
- **Then** a structured `error`-level log is emitted naming `workflow`
- **And** the `ai-assets` health signal is set to `degraded` with `workflow` in its missing list
- **And** the server completes startup successfully

#### Scenario: All declared skills present at startup

- **Given** every declared skill is present and well-formed at startup
- **When** the startup integrity validation runs
- **Then** no integrity error is logged
- **And** the `ai-assets` health signal is `ok`

### Requirement: Guard self-regression test

The system SHALL include an automated test that exercises the validator against fixtures representing a valid asset set, a declared-but-missing skill, and a malformed skill, asserting the validator reports each case correctly, so that a regression in the guard itself is caught.

#### Scenario: Validator unit test catches a synthetic missing skill

- **Given** a fixture asset tree that declares a skill with no corresponding `SKILL.md`
- **When** the guard's unit test runs the validator against that fixture
- **Then** the test asserts the missing skill appears in `missingSkills`
- **And** the test fails if the validator reports the fixture as healthy
