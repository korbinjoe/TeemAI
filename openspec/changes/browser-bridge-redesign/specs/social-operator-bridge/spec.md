# Capability: Social Operator Bridge Integration

Updates to the `social-operator` TeemAI agent to consume the new skill-cli and WebSocket bridge instead of bash daemon scripts.

## ADDED Requirements

### Requirement: Updated boot checklist

The social-operator agent BOOT.md SHALL verify bridge connectivity using `python cli.py ping-server` instead of `status.sh`.

#### Scenario: Bridge offline at boot

- **WHEN** ping-server reports `extension_connected: false`
- **THEN** agent replies with install instructions (load extension, enable bridge, reload Chrome)
- **AND** does not attempt social actions

#### Scenario: Bridge online at boot

- **WHEN** ping-server reports `extension_connected: true`
- **THEN** agent logs risk/status fields if available
- **AND** replies ready message with platform accounts summary

---

### Requirement: Agent skills registration

The social-operator entry in agent configuration SHALL register sub-skills `browser-agent`, `xhs-explore`, `xhs-publish`, `xhs-interact`, `xhs-auth`, and `reddit-engage` instead of single `browser-agent` only.

#### Scenario: openteam.json skills list

- **WHEN** social-operator agent loads
- **THEN** its skills array includes xhs and reddit sub-skills
- **AND** deprecated bash-only browser-agent scripts are not referenced in TOOLS.md

---

### Requirement: Workflow migration

Workflow markdown files SHALL invoke cli.py subcommands with documented examples replacing send.sh/monitor.sh calls.

#### Scenario: Reddit engage workflow

- **WHEN** reddit-engage workflow runs monitor step
- **THEN** workflow instructs `python cli.py list-feeds --platform reddit --subreddit <name> --score`
- **AND** reply step uses `post-comment --content-file` with user confirmation gate

#### Scenario: Xiaohongshu workflow

- **WHEN** social-operator performs Xiaohongshu content ops
- **THEN** workflow references xhs-content-ops or composed xhs sub-skill steps
- **AND** uses check-login before publish or comment

---

### Requirement: CLI path resolution

BOOT.md and TOOLS.md SHALL document CLI path resolution order: `BROWSER_SKILL_CLI` env, `~/.teemai/browser-agent/config.json` `cliPath`, browser-plugin dev tree, synced ai-assets copy.

#### Scenario: Dev tree path

- **WHEN** developer runs TeemAI from monorepo with browser-plugin sibling
- **THEN** config or env points to `../browser-plugin/skill-cli/cli.py`
- **AND** agent bash invocations use absolute resolved path

---

### Requirement: Deprecation notice in agent docs

social-operator TOOLS.md SHALL list deprecated bash scripts as removed after migration Phase 3 with pointer to cli.py equivalents.

#### Scenario: send.sh replacement mapping

- **WHEN** maintainer reads TOOLS.md migration table
- **THEN** `send.sh reply` maps to `cli.py post-comment`
- **AND** `monitor.sh` maps to `cli.py list-feeds --score`
