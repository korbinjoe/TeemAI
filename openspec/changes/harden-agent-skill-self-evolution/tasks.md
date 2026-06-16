# Tasks

Sequential unless marked `[parallel]`.

## 1. Repair Existing Self-Evolution Signals

- [x] 1.1 Add `canonicalAgentId(raw, registry?)` helper with tests for `:auto`, `:<number>`, unknown ids, and registered ids.
- [x] 1.2 Update `MemoryGrowthCapture` to use the shared canonicalization helper.
- [x] 1.3 Update `ConfigCompiler.buildPromptContent()` / `buildMemoryPrompt()` to retrieve by `agent.id`, with temporary fallback to `agent.name`.
- [x] 1.4 Update `satisfaction-score.sh` to write canonical agent directories.
- [x] 1.5 Update `EvolutionTrigger` to scan only canonical registered agents and merge suffix directories in memory before evaluating.
- [x] 1.6 Add backfill script to merge `~/.teemai/agents/<id>:*/memory/satisfaction.md` into canonical `~/.teemai/agents/<id>/memory/satisfaction.md`.
- [x] 1.7 Make Codex hook writing idempotent: marker-owned block or command-level dedup, with cleanup that restores only TeemAI-owned entries.
- [x] 1.8 Add regression test showing three Codex compile cycles produce one `wb-auto-extract.sh` and one `satisfaction-score.sh` entry.

## 2. Add Runtime Asset Provenance

- [x] 2.1 Add `SkillEvolutionStore` schema and migrations for skill source/provenance/usage/lifecycle fields.
- [x] 2.2 Add `AgentEvolutionStore` or extend existing evolution feed source to record applied prompt/skill changes with rollback refs.
- [x] 2.3 Add `~/.teemai/skills/.teemai-manifest.json` generation during seeding.
- [x] 2.4 Classify existing runtime skills as `bundled` if hash/path matches repo assets, otherwise `user`.
- [x] 2.5 Update `SkillManager.loadBuiltinSkills()` naming to distinguish bundled runtime skills from custom/user skills.
- [x] 2.6 Add a read-only `/api/skills/evolution-state` endpoint for diagnostics.

## 3. Track Skill Usage Before Mutating Skills

- [x] 3.1 Bump `use_count` when a skill is injected into an agent prompt.
- [x] 3.2 Bump `view_count` when `/api/skills/:name/content` is called.
- [x] 3.3 Bump `use_count` for slash-resolved user skills in `SlashCommandResolver`.
- [x] 3.4 Bump `patch_count` only through the new controlled mutation path.
- [x] 3.5 Add tests for bundled/user/agent skill telemetry.

## 4. Add Controlled Skill Evolution API

- [x] 4.1 Implement `SkillEvolutionService.createSkill()`.
- [x] 4.2 Implement `patchSkill()` with unique match or structured patch validation.
- [x] 4.3 Implement `writeSkillFile()` and `removeSkillFile()` with path traversal protection.
- [x] 4.4 Implement `archiveSkill()`, `restoreSkill()`, and `pinSkill()`.
- [x] 4.5 Add rollback snapshot creation before every mutation.
- [x] 4.6 Add approval gate: bundled and user skills are proposal-only unless explicitly approved.
- [x] 4.7 Add tests for invalid frontmatter, path traversal, file-size limits, rollback snapshot, and bundled mutation rejection.

## 5. Add Background Evolution Review Jobs

- [x] 5.1 Add `EvolutionReviewJobStore` with statuses `queued`, `running`, `proposal_ready`, `approved`, `rejected`, `applied`, `failed`.
- [x] 5.2 Add `EvolutionReviewService.enqueueFromTrigger()`.
- [x] 5.3 Add periodic nudge logic based on turns/missions since last review.
- [x] 5.4 Run review jobs in isolated agent sessions with restricted tool surface.
- [x] 5.5 Produce proposal documents containing evidence, root cause, diff, risk, validation, rollback.
- [x] 5.6 Add API endpoints to list proposals and approve/reject/apply.
- [x] 5.7 Add tests proving review jobs cannot directly mutate agent/skill files without approval.

## 6. Add Episodic Memory Index

- [x] 6.1 Add `EpisodeStore` and FTS5 index.
- [x] 6.2 Index completed missions from JSONL/session metadata.
- [x] 6.3 Index workflow task result summaries and whiteboard durable entries.
- [x] 6.4 Add `episode_search(agentId, query, limit)` service API.
- [x] 6.5 Inject top relevant prior episodes before agent task execution.
- [x] 6.6 Add tests for ranking by agent match, recency, outcome, and query relevance.

## 7. Make Sensei Operational

- [x] 7.1 Update Sensei SOUL.md to reference the new review job and approval flow.
- [x] 7.2 Add prompt template for Hermes-style memory/skill review, with explicit non-capture rules for transient environment failures.
- [x] 7.3 Add proposal parser/validator for Sensei output.
- [x] 7.4 Add UI entry point showing pending evolution proposals per agent/skill.
- [x] 7.5 Add EvolutionLog entries for approved prompt patches, skill patches, skill creation, curator archive/restore.

## 8. Verification

- [x] 8.1 Run `npm run typecheck` or `npx tsc --noEmit`.
- [x] 8.2 Run unit tests for canonicalization, memory lookup, hook idempotency, skill mutation guards, review job restrictions.
- [ ] 8.3 Start dev server and verify one captured whiteboard decision appears in the next prompt's `Cross-Session Memory`.
- [ ] 8.4 Run a synthetic low satisfaction trigger and verify a Sensei proposal appears without mutating files.
- [ ] 8.5 Approve a low-risk skill patch and verify snapshot, file diff, telemetry, and EvolutionLog entry.
