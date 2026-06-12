# Spec: File Manifest Validation

## ADDED Requirements

### Requirement: Task file manifest prompt injection

When a `WorkflowTask` includes a `fileManifest` field, the scheduler SHALL
append a structured "File Requirements" block to the agent's prompt listing
required files to create, allowed files to modify, and forbidden patterns.

#### Scenario: Task with fileManifest.create gets prompt injection

- **Given** a workflow task has `fileManifest: { create: ["bridge/src/types.ts", "bridge/src/server.ts"] }`
- **When** the scheduler starts the task agent
- **Then** the agent prompt includes a "File Requirements" section listing both files under "Files you MUST create"
- **And** the prompt instructs the agent to use the Write tool for each file

#### Scenario: Task with fileManifest.forbid gets prompt injection

- **Given** a workflow task has `fileManifest: { create: ["src/index.ts"], forbid: ["*.md", "skills/**"] }`
- **When** the scheduler starts the task agent
- **Then** the agent prompt includes a "Files you MUST NOT touch" section listing both forbidden patterns

#### Scenario: Task without fileManifest has no prompt injection

- **Given** a workflow task has no `fileManifest` field
- **When** the scheduler starts the task agent
- **Then** the agent prompt does not contain a "File Requirements" section

### Requirement: File manifest validation on task completion

When a completed task has a `fileManifest`, the scheduler SHALL validate that
all `create` files exist and are non-empty, and that no files matching `forbid`
patterns were modified.

#### Scenario: All required files created and non-empty

- **Given** a task has `fileManifest: { create: ["src/a.ts", "src/b.ts"] }`
- **And** both files exist on disk with non-zero size after the agent completes
- **When** the scheduler collects enriched context
- **Then** the validation result reports `passed: true`
- **And** the enriched prompt to Lead includes "File Manifest Validation: PASSED"

#### Scenario: Required file missing

- **Given** a task has `fileManifest: { create: ["src/a.ts", "src/b.ts"] }`
- **And** only `src/a.ts` exists after the agent completes
- **When** the scheduler collects enriched context
- **Then** the validation result reports `passed: false` with `missingFiles: ["src/b.ts"]`
- **And** the enriched prompt to Lead includes "Missing files" listing `src/b.ts`

#### Scenario: Required file exists but is empty

- **Given** a task has `fileManifest: { create: ["src/a.ts"] }`
- **And** `src/a.ts` exists but has size 0
- **When** the scheduler collects enriched context
- **Then** the validation result reports `passed: false` with `emptyFiles: ["src/a.ts"]`

#### Scenario: Forbidden pattern violated

- **Given** a task has `fileManifest: { create: ["src/index.ts"], forbid: ["*.md"] }`
- **And** the agent modified `README.md` during its execution
- **When** the scheduler collects enriched context
- **Then** the validation result reports `passed: false` with `forbiddenChanges: ["README.md"]`

#### Scenario: File in create list excluded from forbid check

- **Given** a task has `fileManifest: { create: ["docs/API.md"], forbid: ["*.md"] }`
- **And** the agent created `docs/API.md` (matches both `create` and `forbid`)
- **When** the scheduler collects enriched context
- **Then** the validation result reports `passed: true`
- **And** `docs/API.md` is NOT listed in `forbiddenChanges`

### Requirement: Missing manifest detection for new-file tasks

The scheduler SHALL detect when a task description contains file-creation keywords but has no `fileManifest`, and include a warning in the Lead prompt.

#### Scenario: Task with creation keywords but no manifest triggers warning

- **Given** a workflow task has description containing "implement bridge server" but no `fileManifest`
- **When** the scheduler builds the task prompt
- **Then** a warning is included: "this task appears to create new files but has no fileManifest"

#### Scenario: Task with manifest does not trigger warning

- **Given** a workflow task has both a description with "implement" and a `fileManifest`
- **When** the scheduler builds the task prompt
- **Then** no missing-manifest warning is included
