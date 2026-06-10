# Capability: Browser Bridge Protocol

WebSocket-based local bridge connecting Skill CLI clients to the Browser Social Agent Chrome extension.

## ADDED Requirements

### Requirement: Bridge server listens on localhost

The system SHALL run a bridge server process that accepts WebSocket connections on `127.0.0.1` at port `9333` by default, overridable via `--port` or `BROWSER_BRIDGE_PORT`.

#### Scenario: Default port binding

- **WHEN** bridge_server starts without arguments
- **THEN** it listens on `ws://127.0.0.1:9333`
- **AND** it does not bind to non-loopback interfaces

#### Scenario: Custom port

- **WHEN** bridge_server starts with `--port 9400`
- **THEN** it listens on `ws://127.0.0.1:9400`

---

### Requirement: Extension maintains long WebSocket connection

The Chrome extension service worker SHALL connect to the bridge server and send `{ "role": "extension" }` as its first message, then maintain the connection with automatic reconnect on disconnect.

#### Scenario: Successful extension handshake

- **WHEN** the extension service worker starts and bridge_server is running
- **THEN** the extension opens a WebSocket to the bridge URL
- **AND** sends `{ "role": "extension" }`
- **AND** bridge_server marks the extension as connected

#### Scenario: Reconnect after disconnect

- **WHEN** the WebSocket connection drops
- **THEN** the extension attempts reconnect within 5 seconds
- **AND** re-sends the extension handshake

---

### Requirement: CLI uses short WebSocket connections

The skill CLI SHALL open a WebSocket, send exactly one CLI message with `{ "role": "cli", "method": "...", "params": {...} }`, receive one response, and close the connection.

#### Scenario: Successful CLI round-trip

- **WHEN** CLI sends `{ "role": "cli", "method": "ping_server" }`
- **THEN** bridge_server responds with `{ "result": { "extension_connected": <bool> } }`
- **AND** CLI closes the WebSocket

#### Scenario: Extension not connected

- **WHEN** CLI sends a method other than `ping_server` and no extension is connected
- **THEN** bridge_server responds with `{ "error": "<message>" }`
- **AND** CLI exits with code `1`

---

### Requirement: Command correlation by UUID

The bridge server SHALL assign a UUID `id` to each forwarded CLI command and match extension responses by that `id`.

#### Scenario: Forward and return result

- **WHEN** CLI sends `{ "role": "cli", "method": "navigate", "params": { "url": "..." } }`
- **THEN** bridge_server forwards `{ "id": "<uuid>", "method": "navigate", "params": {...} }` to the extension
- **WHEN** extension responds `{ "id": "<uuid>", "result": null }`
- **THEN** bridge_server returns that response to the CLI WebSocket

---

### Requirement: CLI command timeout

The bridge server SHALL enforce a per-command timeout of 90 seconds by default, canceling the pending CLI request if the extension does not respond in time.

#### Scenario: Timeout exceeded

- **WHEN** extension does not respond within the timeout window
- **THEN** bridge_server returns `{ "error": "timeout" }` to CLI
- **AND** CLI exits with code `4`

---

### Requirement: Environment bootstrap

The skill CLI SHALL implement `_ensure_bridge_ready()` that starts bridge_server if absent, launches Chrome if extension is disconnected, and polls up to 20 seconds for extension connection.

#### Scenario: Auto-start bridge

- **WHEN** CLI runs and bridge_server is not running
- **THEN** CLI starts bridge_server as a background process
- **AND** retries `ping_server` until success or failure

#### Scenario: Auto-launch Chrome

- **WHEN** bridge_server reports `extension_connected: false`
- **THEN** CLI attempts to launch the user's Chrome browser
- **AND** polls `ping_server` for up to 20 seconds
