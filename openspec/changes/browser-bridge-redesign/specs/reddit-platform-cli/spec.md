# Capability: Reddit Platform CLI

Reddit-specific CLI subcommands orchestrated via BridgePage, replacing coarse extension `monitor`/`reply` commands.

## ADDED Requirements

### Requirement: Feed listing subcommand

The CLI SHALL implement `list-feeds --platform reddit` with optional `--subreddit` and `--limit` parameters.

#### Scenario: List subreddit feed

- **WHEN** agent runs `python cli.py list-feeds --platform reddit --subreddit SaaS --limit 10`
- **THEN** CLI navigates to `https://reddit.com/r/SaaS`
- **AND** waits for DOM stable
- **AND** extracts feed items (title, author, score, comment count, url, id)
- **AND** outputs JSON array capped at limit

---

### Requirement: Post comment subcommand

The CLI SHALL implement `post-comment --platform reddit` with `--post-id` or `--url` and `--content-file`.

#### Scenario: Reply on post detail page

- **WHEN** agent runs `post-comment --platform reddit --url "https://reddit.com/r/SaaS/comments/..." --content-file /abs/reply.txt`
- **THEN** CLI navigates to post URL if not already there
- **AND** fills comment composer and submits via BridgePage primitives
- **AND** exits `0` with JSON `{ "success": true, "url": "..." }`

---

### Requirement: Upvote subcommand

The CLI SHALL implement `upvote --platform reddit` with `--post-id` or `--url`.

#### Scenario: Upvote post

- **WHEN** agent runs `upvote --platform reddit --url "<post-url>"`
- **THEN** CLI clicks upvote control on active post page
- **AND** returns JSON success status

---

### Requirement: Reddit module layout

Platform code SHALL live under `skill-cli/platforms/reddit/` with `selectors.py`, `feeds.py`, and `comment.py` modules.

#### Scenario: Selector isolation

- **WHEN** Reddit DOM changes
- **THEN** maintainers update `platforms/reddit/selectors.py` only

---

### Requirement: Optional scoring integration

The CLI MAY apply relevance scoring to feed items when `--score` flag is passed, delegating to a Python scoring function ported from extension decision-engine logic.

#### Scenario: Scored monitor output

- **WHEN** agent runs `list-feeds --platform reddit --subreddit SaaS --score`
- **THEN** output JSON includes `score` field per item on 0–10 scale
- **AND** items are sorted by score descending
