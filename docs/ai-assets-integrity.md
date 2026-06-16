# ai-assets Integrity Guard

TeemAI agents declare their required skills in `teemai.json` under
`agents.list[].skills`. Those declarations are a runtime contract: every
declared built-in skill must ship under `ai-assets/skills/<name>/SKILL.md`, and
every declared built-in agent must have a corresponding directory under
`ai-assets/agents/`.

Run the guard locally:

```bash
npm run check:ai-assets
```

The check is read-only. It derives the required set from `teemai.json` and
legacy agent markdown configs, scans shipped assets, and fails when it finds:

- A declared skill with no matching `SKILL.md`.
- A skill directory whose `SKILL.md` is missing, empty, or malformed.
- A declared agent whose asset directory is missing or structurally empty.

Failures name the missing asset and the agent that declared it. Fix the failure
by either restoring the asset or removing the stale declaration in the same
change.

## Optional Pre-commit Hook

The CI gate is authoritative. Developers who want earlier local feedback can add
this to `.git/hooks/pre-commit` or an equivalent hook runner:

```bash
#!/usr/bin/env bash
set -euo pipefail
npm run check:ai-assets
```

Keep this opt-in; CI already runs the guard for pull requests and protected
branch pushes.

