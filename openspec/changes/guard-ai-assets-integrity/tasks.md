# Tasks: Guard ai-assets integrity against silent deletion

## 1. Validator core
- [x] 1.1 Create `scripts/check-ai-assets-integrity.mjs` exporting a pure `validateAiAssets({ root })` that returns `{ missingSkills, missingAgents, malformedSkills }`
- [x] 1.2 Build the **declared set**: parse `teemai.json` `agents[].skills` and `ai-assets/agents/*/` configs to collect required skill names (with declaring agent ids) and required agent ids
- [x] 1.3 Build the **shipped set**: scan `ai-assets/skills/*/` for non-empty `SKILL.md` and `ai-assets/agents/*/` for required files
- [x] 1.4 Compute `missingSkills` (with `declaredBy`), `missingAgents`, and `malformedSkills` (dir present, `SKILL.md` absent/empty)
- [x] 1.5 Add a CLI wrapper: print a precise per-asset report and exit non-zero on any finding, exit zero when clean

## 2. CI gate (primary defense)
- [x] 2.1 Add `"check:ai-assets": "node scripts/check-ai-assets-integrity.mjs"` to `package.json` scripts
- [x] 2.2 Add a `Check ai-assets integrity` step running `npm run check:ai-assets` to `.github/workflows/ci.yml`
- [x] 2.3 Manually verify: a branch deleting `ai-assets/skills/handoff/` (with `handoff` still declared) makes the step exit non-zero

## 3. Startup alarm (defense in depth)
- [x] 3.1 Import/reuse `validateAiAssets` in `server/config/SkillManager.ts` (or `AgentRegistry.ts`) after `loadBuiltinSkills()`
- [x] 3.2 On findings: emit a structured `log.error` naming the missing/malformed assets; on clean: no error
- [x] 3.3 Set an `ai-assets` health signal (`ok` | `degraded` + missing list) in the server's health aggregation; ensure startup still completes (no crash)

## 4. Tests
- [x] 4.1 Add `server/__tests__/aiAssetsIntegrity.test.ts` with fixtures: valid set → empty report; declared-but-missing skill → `missingSkills` with correct `declaredBy`; malformed skill → `malformedSkills`
- [x] 4.2 Confirm `npm test` runs the new test and it passes

## 5. Docs & optional local guard
- [x] 5.1 Document the guard (what it checks, how to run `npm run check:ai-assets`, how to interpret failures) — e.g. a short note near the scripts or in the change's design reference
- [x] 5.2 Document the optional pre-commit hook snippet that runs `npm run check:ai-assets` (opt-in, not mandated)

## 6. Validate
- [x] 6.1 Run `openspec validate guard-ai-assets-integrity --strict` and resolve all issues
- [x] 6.2 Run `npm run check:ai-assets` against the current repo and confirm it passes (assets already restored in `86a58dd`)
