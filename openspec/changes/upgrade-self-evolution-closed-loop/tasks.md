# Tasks

Sequential unless marked `[parallel]`.

## 1. Proposal Schema and Validation

- [x] 1.1 Extend `EvolutionProposal` with structured `actions` and optional `metrics`.
- [x] 1.2 Add TypeScript action types for agent prompt patch, skill create/patch/write/archive/restore/pin, and memory upsert.
- [x] 1.3 Update `EvolutionProposalParser` to parse action blocks from Sensei markdown or JSON.
- [x] 1.4 Add `validateEvolutionActions()` with target/type matching, required fields, path constraints, and max action count.
- [x] 1.5 Add regression tests for missing actions, unsupported target files, path traversal, non-unique patch intent, and malformed metrics.

## 2. Controlled Agent Prompt Mutation

- [x] 2.1 Implement `AgentEvolutionService` with canonical agent resolution and workspace path confinement.
- [x] 2.2 Implement exact `patchAgentFile()` for `IDENTITY.md`, `AGENTS.md`, and `SOUL.md`.
- [x] 2.3 Create rollback snapshots under `~/.teemai/agents/.teemai-snapshots/<agentId>/`.
- [x] 2.4 Validate `IDENTITY.md` frontmatter after patches.
- [x] 2.5 Emit `strategy_evolved` events with source evidence, changed file, and rollback ref.
- [x] 2.6 Add tests for path traversal rejection, invalid identity frontmatter rejection, unique-match enforcement, snapshot creation, and event creation.

## 3. Apply Executor

- [x] 3.1 Implement `EvolutionApplyService` to execute approved proposal actions sequentially.
- [x] 3.2 Wire skill actions to `SkillEvolutionService` with `approved: true` and actor/source metadata.
- [x] 3.3 Wire agent prompt actions to `AgentEvolutionService`.
- [x] 3.4 Persist applied action results and rollback refs on the review job.
- [x] 3.5 Change `/api/evolution/review-jobs/:id/apply` to call the apply executor instead of only updating status.
- [x] 3.6 Add integration test: approved skill patch changes file, creates snapshot, increments patch count, and writes EvolutionLog.
- [x] 3.7 Add integration test: unapproved apply is rejected and files remain unchanged.

## 4. Real Sensei Review Runner

- [x] 4.1 Define `EvolutionReviewContextBuilder` to gather trigger evidence, current prompt/skill content, memories, episodes, and satisfaction records.
- [x] 4.2 Implement a restricted Sensei review runner that can produce a structured proposal without write tools.
- [x] 4.3 Replace `buildDefaultProposal()` fallback with an explicit `review_unavailable` failure unless a deterministic dry-run mode is enabled.
- [x] 4.4 Add tests proving the runner receives only proposal-safe capabilities.
- [x] 4.5 Add integration test: synthetic low satisfaction trigger -> run-next -> proposal with actions and no file mutation.

## 5. Improve Episodic Memory Quality

- [x] 5.1 Add episode extraction from JSONL transcript tail: user goal, corrections, acceptance signals, final result, and touched files when available.
- [x] 5.2 Replace generic mission completion summaries with concrete lesson summaries.
- [x] 5.3 Add explicit `lesson` or `hasLesson` metadata for failed/blocked episodes.
- [x] 5.4 Prevent failed episodes from prompt injection unless a lesson is present.
- [x] 5.5 Add tests for extraction quality, failed-episode filtering, and 1200-character prompt cap.

## 6. Proposal UX

- [x] 6.1 Extend pending proposal UI with a detail view for evidence, diff, actions, metrics, validation plan, and rollback path.
- [x] 6.2 Show separate controls for approve, apply approved, reject, and view applied rollback metadata.
- [x] 6.3 Refresh proposal lists after status transitions and show failed apply errors.
- [x] 6.4 Add UI tests for `proposal_ready`, `approved`, `applied`, and `failed` states.

## 7. Optimization Lab Producer

- [x] 7.1 Add `EvolutionOptimizationLab` interfaces for target selection, dataset loading, candidate generation, scoring, and proposal output.
- [x] 7.2 Support skill-body and agent-prompt-section targets.
- [x] 7.3 Generate synthetic eval datasets and load optional golden JSONL datasets.
- [x] 7.4 Score baseline vs candidate on holdout with rubric metrics and size/semantic gates.
- [x] 7.5 Enqueue winning candidates as proposal-only `EvolutionReviewJob`s with metrics and structured actions.
- [x] 7.6 Add tests proving lab runs do not mutate active skill or agent files.

## 8. Verification

- [x] 8.1 Run `npx tsc --noEmit`.
- [x] 8.2 Run targeted tests for evolution proposal, apply service, agent evolution service, skill apply routing, episode extraction, and UI proposal states.
- [x] 8.3 Manual: seed low-satisfaction records, force trigger check, run next review job, confirm a proposal appears with actions and no file changes.
- [x] 8.4 Manual: approve and apply a low-risk agent prompt patch, verify changed file, snapshot, EvolutionLog, and rollback metadata.
- [x] 8.5 Manual: run optimization lab dry-run on one non-critical skill and verify it creates only a proposal job.

Manual verification command:

```bash
npx tsx scripts/verify-self-evolution-manual.ts
```
