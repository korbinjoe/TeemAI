# Capability: Xiaohongshu Platform CLI

Xiaohongshu-specific CLI subcommands ported from `xiaohongshu-skills`, orchestrated via BridgePage.

## ADDED Requirements

### Requirement: Authentication subcommands

The CLI SHALL implement `check-login`, `login`, `send-code`, `verify-code`, and `delete-cookies` subcommands for Xiaohongshu authentication.

#### Scenario: Check login status

- **WHEN** agent runs `python cli.py check-login --platform xiaohongshu`
- **THEN** CLI navigates to explore page, detects login DOM or QR code
- **AND** outputs JSON with `logged_in` boolean and user info or QR artifact path

#### Scenario: Not logged in exit code

- **WHEN** check-login determines user is not logged in
- **THEN** CLI exits with code `1`

---

### Requirement: Content discovery subcommands

The CLI SHALL implement `list-feeds`, `search-feeds`, `get-feed-detail`, and `user-profile` subcommands requiring paired `feed_id` and `xsec_token` where applicable.

#### Scenario: Search feeds

- **WHEN** agent runs `python cli.py search-feeds --keyword "露营" --platform xiaohongshu`
- **THEN** CLI navigates to search URL, waits for DOM stable, extracts `__INITIAL_STATE__.search.feeds`
- **AND** outputs structured JSON feed list

#### Scenario: Feed detail requires token

- **WHEN** agent runs `get-feed-detail` without `xsec_token`
- **THEN** CLI exits with code `2` and error explaining token requirement

---

### Requirement: Interaction subcommands

The CLI SHALL implement `post-comment`, `reply-comment`, `like-feed`, and `favorite-feed` subcommands.

#### Scenario: Post comment with content file

- **WHEN** agent runs `post-comment --feed-id ID --xsec-token TOKEN --content-file /abs/path.txt`
- **THEN** CLI reads content from file (not inline argv for Chinese text)
- **AND** executes comment flow via BridgePage primitives
- **AND** exits `0` on success

---

### Requirement: Publish subcommands

The CLI SHALL implement `fill-publish`, `publish`, `publish-video`, `click-publish`, `long-article`, and related publish pipeline subcommands with UTF-16 title length validation (≤ 20 units).

#### Scenario: Fill publish without posting

- **WHEN** agent runs `fill-publish` with title-file, content-file, and absolute image paths
- **THEN** CLI fills creator publish form but does not click publish
- **AND** outputs JSON confirming form state for user preview

#### Scenario: Publish requires confirmation at skill layer

- **WHEN** agent runs `publish` without `--confirm`
- **THEN** CLI MAY output dry-run preview JSON
- **AND** skill documentation requires AskUserQuestion before `--confirm`

---

### Requirement: Xiaohongshu module layout

Platform code SHALL live under `skill-cli/platforms/xhs/` with `selectors.py`, `urls.py`, `types.py`, `errors.py`, and `human.py` modules matching the reference project structure.

#### Scenario: Selector centralization

- **WHEN** Xiaohongshu DOM changes
- **THEN** maintainers update `selectors.py` without changing skill SKILL.md files

---

### Requirement: Risk and diagnostic subcommands

The CLI SHALL implement `check-risk`, `diagnose-404`, `get-netlog`, and `risk-report` subcommands delegating to extension diagnostic primitives.

#### Scenario: Diagnose 404 after detail navigation

- **WHEN** navigation results in platform 404 page
- **THEN** CLI calls diagnostic primitives and returns JSON with redirect chain and suggested token refresh outcome
