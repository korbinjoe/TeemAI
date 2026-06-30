# Design: Closed-Loop Self-Evolution Upgrade

## Current State

The existing implementation has the right primitives:

- `EvolutionTrigger` evaluates satisfaction records and enqueues review jobs.
- `EvolutionReviewJobStore` persists job lifecycle and proposal JSON.
- `EvolutionReviewService` can run a job, but currently falls back to a generic placeholder proposal.
- `SkillEvolutionService` can create, patch, write, archive, restore, pin, snapshot, and emit evolution events, but it is not wired into review-job apply.
- `ConfigCompiler` injects cross-session memory and prior similar episodes.
- `EpisodeStore` provides FTS search and deterministic ranking.

The missing product behavior is an executable, governed bridge from "we detected a recurring problem" to "the next mission behaves better."

## Target Architecture

```text
Signals
  satisfaction.md / whiteboard / mission outcome / user correction
        |
        v
EvolutionTrigger / periodic nudge
        |
        v
EvolutionReviewJobStore
        |
        v
Sensei Review Runner
  readonly evidence + episode_search + proposal-only tools
        |
        v
Structured EvolutionProposal
  evidence + root cause + actions + risk + validation + rollback
        |
        v
User Approval
        |
        v
EvolutionApplyService
  AgentEvolutionService / SkillEvolutionService / memory_evolve
        |
        v
Snapshots + EvolutionLog + Runtime Injection
```

## Decision 1: Proposals Contain Structured Actions

Free-form diffs are useful for review but not sufficient for safe apply. The stored proposal will keep human-readable markdown fields and add machine-readable actions.

```ts
interface EvolutionProposal {
  evidence: unknown
  rootCause: string
  diff: string
  expectedImpact: string
  risk: string
  validationPlan: string
  rollbackPath: string
  actions: EvolutionAction[]
}

type EvolutionAction =
  | AgentPromptPatchAction
  | SkillPatchAction
  | SkillCreateAction
  | SkillWriteFileAction
  | SkillArchiveAction
  | SkillRestoreAction
  | SkillPinAction
  | MemoryUpsertAction
```

Action validation happens before a job enters `proposal_ready`. The system rejects proposals that contain no actions, unsupported target files, path traversal, non-unique patch matches, or action/target mismatches.

## Decision 2: Add `AgentEvolutionService`

Skill mutation already has a service; agent prompt mutation needs the same treatment.

Responsibilities:

- Resolve target agent by canonical id.
- Allow only `IDENTITY.md`, `AGENTS.md`, and `SOUL.md` under that agent workspace.
- Reject absolute paths and path traversal.
- Apply exact find/replace patches only when the match is unique.
- Validate required identity frontmatter when patching `IDENTITY.md`.
- Create rollback snapshots before mutation.
- Emit `strategy_evolved` events with `sourceRef`, `changedFile`, and `rollbackRef`.

Bundled agent prompts require approved proposals. Background review jobs never write these files directly.

## Decision 3: `apply` Executes Actions, Not Status Changes

`EvolutionReviewService.apply(jobId)` should delegate to a new `EvolutionApplyService`.

Apply rules:

1. Job must be `approved`.
2. Proposal must contain validated actions.
3. Each action runs through its domain service.
4. Results are stored on the job as applied action metadata.
5. Any failed action marks the job `failed` and preserves previous snapshots.
6. Successful completion marks the job `applied`.

For this phase, actions are applied sequentially. Proposals should normally contain one concern and one to three actions.

## Decision 4: Sensei Review Runner Uses Restricted Evidence

The runner is responsible for producing a proposal, not applying it.

Inputs:

- target type/id
- trigger type
- trigger evidence
- current agent prompt or skill content
- relevant memories
- top prior episodes
- recent satisfaction records

Allowed capabilities:

- `episode_search`
- readonly file/session inspection
- proposal drafting

The runner must not receive unrestricted shell or file-write tools. If the runtime cannot provide a restricted agent session yet, the first implementation can use a deterministic server-side prompt call adapter and store the generated proposal.

## Decision 5: Episode Extraction Must Produce Lessons

Generic episodes such as "Mission completed by fullstack-engineer" do not help future agents. Episode extraction should prioritize:

- user goal
- final outcome
- concrete lesson
- user corrections or acceptances
- changed files/artifacts
- failure mode when outcome is failed/blocked

The prompt injection layer should continue to cap episodes at three and 1200 characters, but failed episodes should require an explicit lesson before injection.

## Decision 6: Optimization Lab Is Proposal-Only

Hermes Agent Self-Evolution shows a useful offline loop: target selection, eval dataset, candidate mutation, holdout evaluation, constraints, and PR/proposal output. TeemAI should introduce this as a sidecar producer rather than a direct mutation system.

Minimum viable optimization lab:

- Target: skill `SKILL.md` body or agent prompt section.
- Data sources: synthetic eval cases, hand-curated golden sets, and mined episodes.
- Candidate generation: model-generated variants first; GEPA can be added behind the same interface later.
- Scoring: rubric judge plus deterministic constraints.
- Gates: holdout improvement, size growth limit, semantic preservation, no prohibited instruction changes.
- Output: `EvolutionReviewJob` with proposal actions and metrics.

No optimization lab run may directly write `~/.teemai/skills` or agent prompt files.

## Data Model Changes

### `evolution_review_jobs`

Add optional columns:

- `actions_json`
- `applied_actions_json`
- `metrics_json`

Alternatively, store these fields inside `proposal_json` initially and migrate to columns only if query needs appear.

### Evolution Events

Continue using `agent_evolution_events`, but require `sourceRef`, `changedFile`, and `rollbackRef` for applied `strategy_evolved` and `skill_acquired` events.

## UX

Pending proposal cards should support:

- open details
- inspect evidence
- inspect exact diff/actions
- approve
- apply approved
- reject
- view rollback reference after apply

The UI must distinguish:

- `proposal_ready`: proposed, not approved
- `approved`: approved, not applied
- `applied`: file changes completed
- `failed`: apply attempted and failed

## Migration

Existing jobs without actions remain readable. They cannot be applied until rerun or upgraded into a structured proposal.

Existing skill snapshots remain valid. Agent prompt snapshots will use a new sibling snapshot directory under `~/.teemai/agents/.teemai-snapshots`.

## Open Questions

1. Should approved proposals auto-apply immediately, or should approval and apply stay two separate user actions?
2. Should low-risk memory-only proposals allow auto-apply after explicit user opt-in?
3. Should optimization-lab metrics live in `EvolutionReviewJob` only, or also in a long-term benchmark history table?
