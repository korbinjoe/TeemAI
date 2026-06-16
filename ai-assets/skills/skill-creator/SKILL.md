---
name: skill-creator
description: >
  Create or update Codex/agent skills with clear trigger rules, scoped
  instructions, reusable references, and testable workflows. Use when a user
  asks to add a new reusable capability or improve an existing skill.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# skill-creator

Use this skill to create a reusable skill directory with a `SKILL.md` and any
supporting `references/`, `scripts/`, or assets that the skill needs.

## Core principles

- A skill should encode a repeatable workflow, not a one-off answer.
- Trigger rules must be specific enough that the agent knows when to use the
  skill and when to skip it.
- Keep the main `SKILL.md` short enough to load quickly; move long domain
  details into `references/`.
- Prefer scripts or templates for large reusable artifacts instead of asking the
  model to recreate them from memory.
- Avoid hidden dependencies. List required CLIs, services, credentials, and
  environment variables in the skill.

## Required `SKILL.md` shape

Every skill must start with YAML frontmatter:

```yaml
---
name: skill-name
description: >
  What this skill does and the situations that should trigger it.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---
```

The body should include:

- When to use the skill.
- When not to use it.
- The workflow the agent should follow.
- Any files or references the agent must read before acting.
- Verification steps or expected outputs.

## Directory layout

```text
skills/<skill-name>/
  SKILL.md
  references/        # optional long-form instructions
  scripts/           # optional executable helpers
  templates/         # optional starter artifacts
```

## Quality checklist

- The skill name is lowercase kebab-case and matches its directory.
- The description contains concrete trigger language.
- Instructions are imperative and operational.
- The skill does not duplicate unrelated agent personality or global policy.
- References are only loaded when relevant.
- Scripts are executable when they are intended to run directly.
- The skill includes verification guidance for its common outputs.

