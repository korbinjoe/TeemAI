# Proposal: Guard ai-assets integrity against silent deletion

## Summary

A feature commit silently deleted 16 core built-in skills from `ai-assets/skills`, breaking all multi-agent orchestration features (handoff, whiteboard, workflow) in the app for 5 days before a human noticed. Nothing in the dev pipeline cross-checks the skills/agents that `teemai.json` declares against the files that actually ship. This change adds a single integrity validator — reused by CI (the blocking gate) and by server startup (the runtime alarm) — that fails fast when a declared asset is missing, so this class of catastrophic regression cannot reach production silently again.

## Motivation

### What actually happened

- **2026-06-10, commit `c14a509`** ("feat: add Twitter/X platform skills and migrate browser agent to skill-cli") trimmed `ai-assets/skills` down to the social-automation set. It removed 16 skills still referenced by built-in agents: `handoff`, `whiteboard`, `workflow`, `product-design`, `architecture-review`, `ui-designer`, `ui-reviewer`, `playwright-cli`, `dev-server`, `frontend-expert`, `api-integrator`, `doc-writer`, `image-generator`, `code-reviewer-{nodejs,react,typescript}`.
- The deletion was buried inside a large feature diff. Typecheck passed (skills are runtime assets, not TypeScript), tests passed, the build succeeded.
- The app degraded silently: agents that declare `"skills": ["handoff", "workflow", "whiteboard"]` in `teemai.json` could no longer hand off, write to the war-room, or run DAGs — the core value proposition of the product.
- **2026-06-15, commit `86a58dd`** manually restored the 16 skills. **Detection-to-fix latency: 5 days**, entirely dependent on a human stumbling onto the breakage.

### Why the existing pipeline missed it

The dependency contract already exists and is machine-readable: `teemai.json` declares, per agent, exactly which skills it needs (e.g. `"skills": ["handoff", "workflow", "whiteboard"]`). `SkillManager.loadBuiltinSkills()` loads whatever directories exist under `ai-assets/skills/` — but **nothing verifies the declared set is a subset of the shipped set**. A skill can vanish from the filesystem while still being declared, and every automated check stays green.

### Why this matters

"Come back to find your team working" is the promise. A silent removal of orchestration skills turns a multi-agent OS into a set of disconnected single agents, with no error surfaced to the user. The blast radius is the entire product, the detection mechanism is luck, and the recurrence cost is near-zero (any future `ai-assets` refactor can do it again). This is the highest-severity, lowest-detection failure mode we have, and it is cheaply preventable.

## Goals

1. **Block the merge.** A PR that deletes or renames a skill/agent still declared in `teemai.json` (or an agent's config) MUST fail CI before it can reach `main`.
2. **Alarm at runtime.** If a declared asset is nonetheless missing at server startup, the server MUST log a loud, structured error and expose the missing set via a health signal, instead of degrading silently.
3. **Single source of truth.** One validator, two call sites — no drift between what CI checks and what the runtime checks.
4. **Fast and local-friendly.** The check runs in seconds with no build step, so it can also be wired into a pre-commit hook by developers who want it.

## Non-Goals

- Restoring or authoring any skill content (the 16 skills are already restored in `86a58dd`).
- Validating the *internal correctness* of a skill (that its scripts work) — this change only guarantees declared assets **exist** and are structurally well-formed (`SKILL.md` present).
- Adding a new UI surface for asset health beyond the existing startup-log + a single health flag the app can read.
- Introducing a separate manifest file. `teemai.json` + agent configs are already the source of truth; we derive the required set from them rather than maintaining a parallel list that can itself rot.
- Versioning, signing, or checksumming bundled assets (out of scope for this failure mode).

## Approach

### One validator, derived from the existing contract

Add `scripts/check-ai-assets-integrity.mjs` (peer to the existing `check-file-size.sh` / `check-session-isolation.mjs` guard scripts). It:

1. Reads `teemai.json` and every `ai-assets/agents/*/` config to collect the **declared set**: skill names referenced by any agent, plus agent ids referenced by the team config.
2. Reads the filesystem to collect the **shipped set**: directories under `ai-assets/skills/` that contain a `SKILL.md`, and directories under `ai-assets/agents/` that contain the required agent files.
3. Computes `declared − shipped`. If non-empty, prints a precise report (`agent X declares skill Y, but ai-assets/skills/Y/SKILL.md is missing`) and exits non-zero.
4. Also flags structurally broken skills (a skill directory with no `SKILL.md`).

This is the exact check that would have turned `c14a509` red: it deleted `ai-assets/skills/handoff/` while `teemai.json` still declared `handoff` for the Lead.

### Two call sites

- **CI gate (primary defense).** Add a `check:ai-assets` npm script and a step in `.github/workflows/ci.yml` so every PR runs it. This is the gate that prevents recurrence.
- **Startup alarm (defense in depth).** Have `SkillManager` / `AgentRegistry` run the same validation logic after `loadBuiltinSkills()`. On a missing declared skill, `log.error` with the structured missing set and set a `degraded` health flag the app can surface. This catches drift introduced outside the PR path (manual edits, partial bundles, packaging bugs).

### Optional local guard

Document how to wire the script into a git pre-commit hook for developers who want sub-second local feedback. Kept opt-in to avoid forcing hook installation on everyone.

### Recommendation

Ship the **single validator + CI gate + startup alarm** together. The CI gate is what actually stops the bug; the startup alarm is cheap insurance for paths CI doesn't cover; sharing one implementation keeps them honest. The pre-commit hook is documented but not mandated.

## Impact

- **New files:** `scripts/check-ai-assets-integrity.mjs`, a small shared resolver it imports (or inlines), and a test under `server/__tests__/`.
- **Modified files:** `package.json` (new `check:ai-assets` script), `.github/workflows/ci.yml` (new step), `server/config/SkillManager.ts` and/or `server/config/AgentRegistry.ts` (startup validation + health flag), and wherever startup health is aggregated.
- **Risk:** Low. The validator is read-only. The only behavioral change at runtime is an added error log + health flag; it does not block startup (the app should still boot in a degraded state so it can *report* the problem rather than crash-loop).
- **Backward compatibility:** None affected — purely additive guards.

## Risks & Mitigations

- **False positives from legitimate intentional removals.** When a skill is deliberately retired, the same PR must also remove its declaration in `teemai.json`; the validator then passes. This is correct behavior — it forces declaration and shipped assets to move together.
- **Validator itself rotting.** Covered by a unit test that asserts it catches a synthetically-missing skill, so the guard's own regression is caught.
