# Spec: Terminal Transcript Sync

## ADDED Requirements

### Requirement: Terminal mode syncs transcript changes to chat mode

When a terminal resume PTY is attached for a mission agent, the server MUST watch the provider session JSONL for that `(chatId, agentId, cliSessionId)` when the JSONL path can be resolved.

#### Scenario: Existing transcript is replayed

**Given** a terminal view attaches to an agent with an existing session JSONL
**When** the watcher starts
**Then** the server emits an `agent:structured-message` batch of type `full`
**And** the payload uses the same `chatId`, `agentId`, and CLI session id.

#### Scenario: New terminal turns appear in chat state

**Given** a user sends input through terminal mode
**When** the native CLI writes new JSONL lines
**Then** the watcher emits an `agent:structured-message` batch of type `delta`
**And** switching back to message mode shows the new messages from the JSONL transcript.

### Requirement: Terminal raw output remains terminal-only

The server MUST NOT parse ANSI PTY output into chat messages. Raw PTY bytes MUST continue to be sent as `agent:data` for xterm rendering only.

### Requirement: View attach creates a renderable terminal instance

When the web client receives `agent:view-attached`, it MUST ensure the target agent has a terminal instance and MUST attempt to open it even if no `agent:data` frame has arrived yet.
