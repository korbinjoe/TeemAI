# Proposal: Upgrade Self-Evolution Closed Loop

## Why

TeemAI now has most of the infrastructure needed for Hermes-style self-evolution: canonical agent ids, satisfaction scoring, `EvolutionTrigger`, `EvolutionReviewJobStore`, `SkillEvolutionService`, `EpisodeStore`, prompt memory injection, and a basic pending-proposal UI.

The remaining gap is not another growth timeline. The gap is that the loop still stops before behavior actually changes:

- `EvolutionReviewService` falls back to a placeholder proposal instead of running a real Sensei review session with evidence.
- `/api/evolution/review-jobs/:id/apply` only changes job status to `applied`; it does not apply agent or skill patches.
- `SkillEvolutionService` is implemented but not reachable as a controlled review-job mutation path.
- Episode records exist, but mission-level summaries are too generic to be useful as future lessons.
- Hermes Agent Self-Evolution adds a separate lesson: offline optimization should generate evaluated candidates and proposals, not silently rewrite production prompts or skills.

The product promise should be: users repeat fewer corrections because TeemAI can turn repeated evidence into a reviewed, reversible behavior change.

## Summary

Close the runtime self-evolution loop end to end. A trigger should produce an evidence-backed Sensei proposal, a user should approve it, and the server should apply the exact patch through controlled services that create snapshots, events, and rollback references.

This change also introduces a proposal-only offline optimization lab inspired by Hermes Agent Self-Evolution. It can generate and evaluate candidate skill/prompt improvements, but it feeds the same approval pipeline instead of bypassing governance.

## What Changes

- Replace placeholder review proposals with a real Sensei review runner that receives structured evidence and restricted capabilities.
- Introduce structured evolution proposal actions so `apply` can mutate skills and agent prompt files deterministically.
- Add an `AgentEvolutionService` for controlled `SOUL.md`, `AGENTS.md`, and `IDENTITY.md` patches with snapshots and EvolutionLog entries.
- Wire `SkillEvolutionService` into the approved apply path for skill create/patch/write/archive/restore/pin actions.
- Improve episodic memory extraction so completed missions store concrete lessons, user corrections, affected files, and outcome.
- Extend pending-evolution UX from approve/reject-only to inspect diff, approve, apply, reject, and view rollback metadata.
- Add a proposal-only optimization lab for skills and agent prompt sections with eval datasets, holdout scoring, size/semantic gates, and no direct production writes.

## Goals

1. A low-satisfaction or repeated-correction trigger creates a real proposal with evidence, root cause, exact actions, risk, validation, and rollback.
2. Applying an approved proposal changes the intended file through a controlled service, never by direct background-agent write.
3. Every applied evolution action records `changedFile`, `rollbackRef`, `sourceRef`, and a visible EvolutionLog entry.
4. Prior episodes injected into future agent prompts contain actionable lessons, not only generic completion records.
5. Offline optimization experiments produce proposal artifacts and metrics, but cannot mutate active agents or skills without approval.

## Non-Goals

- No model fine-tuning, reinforcement learning, or weight updates.
- No automatic merge or silent apply for bundled skills or built-in agent prompts.
- No vector database dependency in this phase.
- No rewrite of mission runtime, whiteboard, or skill loading architecture.
- No direct port of Hermes Python internals; only the mechanism boundaries are adopted.

## Scope

### In Scope

- Server-side review runner orchestration.
- Proposal schema, parser, validator, and apply executor.
- Controlled agent prompt patching.
- Controlled skill mutation apply path.
- Episode extraction quality improvements.
- UX for inspecting and applying proposals.
- Evaluation-gated optimization lab as proposal producer.

### Out of Scope

- Full GEPA integration for every target type.
- Code evolution through Darwinian Evolver.
- Cross-agent shared memory beyond existing team fallback semantics.
- Automatic prompt/skill deployment without user approval.

## Risks

| Risk | Mitigation |
|------|------------|
| Bad proposal overfits one failure | Require repeated evidence or explicit user signal; proposal includes non-capture checks and validation plan |
| Prompt drift | One concern per proposal, size limits, semantic-preservation check, cooldown after apply |
| Unsafe file mutation | Server-owned services restrict paths, create rollback snapshots, and reject invalid frontmatter or non-unique patches |
| UX implies change happened before apply | Separate `proposal_ready`, `approved`, and `applied` states visibly |
| Optimization lab produces plausible but worse prompts | Holdout score, regression gates, and human review are required before apply |

## Validation

- Unit tests for proposal parsing, action validation, agent patch path guards, skill apply routing, and rollback creation.
- Integration tests for trigger -> real proposal -> approve -> apply -> changed file -> EvolutionLog.
- Episode extraction tests proving summaries include concrete lesson text and correction evidence.
- UI tests for proposal inspect/approve/apply/reject states.
- Manual run: seed synthetic low satisfaction, run next review job, inspect proposal, apply a low-risk skill patch, verify snapshot and next prompt injection.
