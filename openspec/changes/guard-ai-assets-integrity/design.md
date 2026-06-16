# Design: Guard ai-assets integrity against silent deletion

## Context

`ai-assets/skills/<name>/SKILL.md` are runtime assets loaded by `SkillManager.loadBuiltinSkills()` (`server/config/SkillManager.ts`) and symlinked into `~/.claude/skills/` for the CLI. Which skills an agent needs is declared in `teemai.json` under each agent's `skills: string[]` array, and surfaced through `AgentRegistry` (`server/config/AgentRegistry.ts`, fields at lines ~21/111/164). There is no code path that asserts the declared skills exist on disk — `loadSkillsFromDir` simply loads whatever is present and silently ignores absences.

This design adds a derived integrity check (no new manifest file) reused by CI and startup.

## Decisions

### Decision 1: Derive the required set from existing declarations, do not introduce a manifest

`teemai.json` (`agents[].skills`) and the agent config files are already the authoritative dependency contract. A separate `required-skills.json` would be a second source of truth that can itself drift out of sync — exactly the failure class we are fixing. The validator therefore *derives* the required set from what is already declared.

- Required skills = union of `agents[].skills` across `teemai.json`, plus any skills declared in `ai-assets/agents/*/` config that aren't in `teemai.json`.
- Required agents = agent ids referenced by the team config / built-in roster.

### Decision 2: One implementation, two call sites

The matching logic lives in one place (`scripts/check-ai-assets-integrity.mjs`, exporting a pure `validateAiAssets({ root }) -> { missingSkills, missingAgents, malformedSkills }`). CI invokes it as a CLI (exit non-zero on findings). Startup imports the same function. This guarantees CI and runtime never disagree about what "valid" means.

### Decision 3: CI gate blocks; startup alarms but does not crash

- **CI**: exit code 1 on any finding → PR red. This is the merge gate.
- **Startup**: log a structured `error` and set a `degraded` health flag, but **continue booting**. A crash-loop would make the problem *harder* to diagnose and would take down the whole app; a booted-but-degraded app can show the user exactly which skills are missing. The product already boots agents that may individually fail; surfacing the gap is more useful than refusing to start.

### Decision 4: Structural validity only

A skill "exists" iff `ai-assets/skills/<name>/SKILL.md` is present and non-empty. We do not execute or lint skill scripts here — that is a separate concern and would make the guard slow and flaky. Existence + `SKILL.md` presence is exactly the property `c14a509` violated.

## Architecture

```
                 teemai.json (agents[].skills)          ai-assets/skills/*/SKILL.md
 ai-assets/agents/*/ (config)                           ai-assets/agents/*/ (files)
            │                                                     │
            ▼  declared set                          shipped set  ▼
        ┌─────────────────────────────────────────────────────────────┐
        │   validateAiAssets({ root })  (scripts/check-ai-assets-       │
        │   integrity.mjs — pure, read-only)                           │
        │   returns { missingSkills, missingAgents, malformedSkills }  │
        └───────────────┬───────────────────────────────┬─────────────┘
                        │                                 │
            CLI wrapper │ exit 1 on findings              │ import at startup
                        ▼                                 ▼
            .github/workflows/ci.yml            SkillManager / AgentRegistry
            (npm run check:ai-assets)           → log.error + health.degraded flag
              ► BLOCKS MERGE                       ► ALARMS AT RUNTIME
```

## Data shapes

```ts
interface AiAssetsReport {
  missingSkills: Array<{ skill: string; declaredBy: string[] }>   // declaredBy = agent ids
  missingAgents: Array<{ agent: string; reason: string }>
  malformedSkills: Array<{ skill: string; reason: string }>        // dir exists, SKILL.md absent/empty
}
// "healthy" iff all three arrays are empty
```

Startup health flag (aggregated wherever the server exposes health):

```ts
interface AiAssetsHealth {
  status: 'ok' | 'degraded'
  missing: string[]   // flat list of missing skill/agent names for quick display
}
```

## Failure-mode coverage matrix

| Failure | Caught by CI gate | Caught by startup alarm |
|---|---|---|
| PR deletes a declared skill (the `c14a509` case) | ✅ blocks merge | ✅ if it slips in |
| PR renames a skill dir without updating `teemai.json` | ✅ | ✅ |
| Declared skill dir present but `SKILL.md` deleted | ✅ malformed | ✅ |
| Packaging/bundle drops a skill in the built app | ➖ (not in PR diff) | ✅ primary catch |
| Manual edit to `~/.teemai` / local assets | ➖ | ✅ |

The two call sites are complementary: CI covers the source-of-truth repo; startup covers everything downstream of it.

## Testing strategy

- Unit test (`server/__tests__/aiAssetsIntegrity.test.ts`): run `validateAiAssets` against a fixture tree with (a) a fully valid set → empty report, (b) a declared-but-missing skill → reported in `missingSkills` with correct `declaredBy`, (c) a skill dir missing `SKILL.md` → `malformedSkills`. This asserts the guard catches the exact `c14a509` shape and guards against the guard itself rotting.
- The check also runs against the *real* repo in CI, so the live `teemai.json` ↔ `ai-assets/skills` invariant is continuously enforced.

## Alternatives considered

- **Pre-commit hook only** — rejected as the *primary* mechanism: hooks are bypassable (`--no-verify`) and not installed in CI; suitable only as optional local speed-up.
- **Separate manifest file** — rejected (Decision 1): adds a second source of truth that can rot.
- **Snapshot test of the skills directory listing** — rejected: brittle (every intentional add/remove churns the snapshot) and doesn't encode *why* a skill is required.
- **Crash on missing skill at startup** — rejected (Decision 3): worsens diagnosis and takes the whole app down.
