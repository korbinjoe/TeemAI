# Capability: Unified AI Tool Command Palette

The input area's `/` command system aggregates commands from all supported AI Coding tools into a single flat list, using `:` only for multi-level command hierarchy.

## ADDED Requirements

### Requirement: Unified Command Registry

The system SHALL maintain a merged registry of commands from all supported AI Coding tools.

#### Scenario: Registry merges commands from multiple tools

- **Given** the system supports Claude Code, Cursor, Aider, and Windsurf
- **When** the command registry is loaded
- **Then** commands from all tools are available in a single flat list
- **And** each command carries metadata about its origin tool

#### Scenario: Colon denotes hierarchy not tool prefix

- **Given** a command "figma:use" exists in the registry
- **When** the user types "/figma:"
- **Then** commands under the "figma" group are filtered (figma:use, figma:generate-design)
- **And** the colon is treated as a hierarchy separator, not a tool namespace

---

### Requirement: Unified Command Menu

The system SHALL display all tool commands in a single autocomplete menu triggered by `/`.

#### Scenario: Menu shows commands from all tools

- **Given** the user types "/" in the input area
- **When** the command menu opens
- **Then** commands from all registered tools appear in the list
- **And** each command displays a subtle tool origin badge

#### Scenario: Active tool commands sort first

- **Given** the current session uses Claude Code
- **When** the user types "/" and the menu opens
- **Then** Claude Code commands appear at the top
- **And** commands from other tools appear below

#### Scenario: Filter works across all tools

- **Given** the user types "/ex"
- **When** the menu filters
- **Then** it shows matching commands from any tool (e.g., "explain" from Cursor, "export" from Claude Code, "exit" from Claude Code)

---

### Requirement: Command Conflict Resolution

The system SHALL handle command name collisions between tools gracefully.

#### Scenario: Same command name from multiple tools

- **Given** both Cursor and Windsurf define a "/test" command
- **When** the user types "/test"
- **Then** both commands appear in the menu with their respective tool badges
- **And** user can select the specific one to execute

#### Scenario: Active tool takes priority in conflicts

- **Given** both Cursor and Windsurf define "/test"
- **And** the active session is Cursor
- **When** the menu shows both
- **Then** Cursor's "/test" appears above Windsurf's "/test"

---

### Requirement: Command Execution

The system SHALL execute the selected command by sending it to the active CLI session.

#### Scenario: Execute a command from the active tool

- **Given** user selects "/compact" (Claude Code command)
- **And** the active session is Claude Code
- **When** the command is executed
- **Then** "/compact" is sent to the CLI session as-is

#### Scenario: Execute a command from a non-active tool

- **Given** user selects "/explain" (Cursor command)
- **And** the active session is Claude Code
- **When** the command is executed
- **Then** "/explain" is sent to the active CLI session
- **And** the CLI session handles or rejects it per its own logic

---

## MODIFIED Requirements

### Requirement: SlashCommandMenu Enhancement

The existing SlashCommandMenu SHALL be extended to display tool origin badges without breaking current behavior.

#### Scenario: Backward compatible rendering

- **Given** only Claude Code commands are available (no other tools registered)
- **When** the menu renders
- **Then** it looks and behaves identically to the current implementation

#### Scenario: Badge display

- **Given** commands from multiple tools are in the list
- **When** the menu renders a command row
- **Then** the command name appears on the left
- **And** the description appears in the middle
- **And** a muted tool badge appears on the right
