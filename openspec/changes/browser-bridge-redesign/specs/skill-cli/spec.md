# Capability: Skill CLI

Unified Python CLI entry point for all browser-plugin platform operations, consumed by TeemAI skills.

## ADDED Requirements

### Requirement: Single CLI entry point

The system SHALL provide `skill-cli/cli.py` as the only programmatic entry for browser automation from TeemAI skills.

#### Scenario: Subcommand dispatch

- **WHEN** user or agent runs `python cli.py <subcommand> [args]`
- **THEN** cli.py parses arguments, calls `_ensure_bridge_ready()`, executes the subcommand handler, and prints JSON to stdout

#### Scenario: Unknown subcommand

- **WHEN** user runs `python cli.py unknown-cmd`
- **THEN** cli.py prints usage to stderr
- **AND** exits with code `2`

---

### Requirement: BridgePage client

The CLI SHALL include a `BridgePage` class in `skill-cli/bridge/page.py` that wraps WebSocket calls with methods matching browser primitives (`navigate`, `evaluate`, `click_element`, etc.).

#### Scenario: Method maps to bridge message

- **WHEN** Python code calls `page.navigate(url)`
- **THEN** BridgePage sends `{ "role": "cli", "method": "navigate", "params": { "url": url } }`
- **AND** returns the `result` field or raises on `error`

---

### Requirement: JSON stdout and exit codes

Every CLI subcommand SHALL print JSON to stdout (UTF-8, `ensure_ascii=False` for Chinese) and exit with standardized codes: `0` success, `1` not logged in / extension disconnected, `2` business error, `3` risk block, `4` timeout.

#### Scenario: Successful command

- **WHEN** subcommand completes successfully
- **THEN** stdout is valid JSON
- **AND** process exits with code `0`

#### Scenario: Extension disconnected

- **WHEN** `_ensure_bridge_ready()` fails after polling
- **THEN** stdout includes `{ "error": "extension not connected", ... }`
- **AND** process exits with code `1`

---

### Requirement: Python environment

The skill-cli package SHALL require Python ≥ 3.11 and declare dependencies in `pyproject.toml`, installable via `uv sync`.

#### Scenario: Dependency install

- **WHEN** developer runs `uv sync` in `skill-cli/`
- **THEN** `websockets` and other runtime deps are installed
- **AND** `python cli.py ping-server` is runnable

---

### Requirement: Single-instance run lock

The CLI SHALL use a run lock to prevent concurrent CLI processes from interfering with the same browser tab session for mutating operations.

#### Scenario: Concurrent publish blocked

- **WHEN** a second CLI process attempts a mutating subcommand while lock is held
- **THEN** second process exits with code `2` and JSON error describing lock conflict
