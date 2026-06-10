# Capability: Browser Agent Skills

TeemAI skill definitions that route AI agents to skill-cli subcommands with enforced boundaries.

## ADDED Requirements

### Requirement: Root browser-agent skill router

The system SHALL ship a root skill `browser-agent/SKILL.md` that routes user intent to platform sub-skills and forbids any execution path other than `python skill-cli/cli.py`.

#### Scenario: Intent routing to Xiaohongshu

- **WHEN** user asks to search Xiaohongshu notes
- **THEN** agent loads `xhs-explore` sub-skill
- **AND** executes only allowed explore subcommands via cli.py

#### Scenario: Forbidden execution paths

- **WHEN** agent has browser-agent skills loaded
- **THEN** agent MUST NOT call deprecated `send.sh`, `monitor.sh`, `daemon.mjs` HTTP API, or MCP browser tools for social platforms covered by this skill tree

---

### Requirement: Xiaohongshu sub-skills

The system SHALL ship sub-skills `xhs-auth`, `xhs-explore`, `xhs-publish`, `xhs-interact`, and optionally `xhs-content-ops`, each listing an explicit whitelist of CLI subcommands.

#### Scenario: xhs-publish whitelist

- **WHEN** xhs-publish skill is active
- **THEN** SKILL.md lists only publish-related subcommands (`fill-publish`, `publish`, `click-publish`, etc.)
- **AND** requires user confirmation before any `--confirm` publish invocation

---

### Requirement: Reddit sub-skill

The system SHALL ship `reddit-engage/SKILL.md` covering list-feeds, post-comment, and upvote subcommands for Reddit.

#### Scenario: Reddit engage workflow

- **WHEN** social-operator runs Reddit engagement workflow
- **THEN** agent uses reddit-engage skill commands only
- **AND** confirms reply content with user before `--confirm`

---

### Requirement: Global skill constraints

All browser-agent sub-skills SHALL enforce: absolute file paths for media; `--content-file` / `--title-file` for Chinese text; login check before mutating operations; reasonable operation intervals documented in skill body.

#### Scenario: Chinese content via file

- **WHEN** agent posts Xiaohongshu comment with Chinese text
- **THEN** agent writes content to absolute path file
- **AND** passes `--content-file` to CLI, not inline `--content`

---

### Requirement: Skill sync from browser-plugin

Skills SHALL be authored in `browser-plugin/skills/` and synced to `TeemAI/ai-assets/skills/` via documented sync script or build step.

#### Scenario: Single source of truth

- **WHEN** skill content is updated in browser-plugin
- **THEN** sync step copies updated SKILL.md files to TeemAI ai-assets
- **AND** TeemAI runtime resolves skills from ai-assets path
