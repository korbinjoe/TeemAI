# Relay Tunnel

Manages the Cloudflare Tunnel lifecycle and cloudflared binary to expose
the local OpenTeam server at a public HTTPS/WSS URL for mobile remote
access.

## ADDED Requirements

### REQ-TUNNEL-01: Cloudflared Binary Management

The system SHALL auto-download the platform-specific `cloudflared` binary
to `~/.openteam/bin/cloudflared` on first use, verifying the download
checksum.

#### Scenario: First-time tunnel start on macOS ARM

- **Given** no `cloudflared` binary exists at `~/.openteam/bin/cloudflared`
- **When** the user triggers "Start Tunnel"
- **Then** the system downloads `cloudflared-darwin-arm64` from Cloudflare
  GitHub releases, stores it at `~/.openteam/bin/cloudflared`, sets
  executable permission, and proceeds to start the tunnel.

#### Scenario: Binary already installed

- **Given** `cloudflared` binary exists and is executable
- **When** the user triggers "Start Tunnel"
- **Then** the system skips download and starts the tunnel immediately.

### REQ-TUNNEL-02: Tunnel Lifecycle

The system SHALL spawn `cloudflared tunnel --url http://localhost:<port>`
as a managed child process, parse the public URL from its output, and
expose the tunnel state via API.

#### Scenario: Start tunnel successfully

- **Given** `cloudflared` is installed and server is running on port 13001
- **When** `POST /api/tunnel/start` is called
- **Then** the system spawns cloudflared, parses the public URL
  (e.g. `https://abc123.trycloudflare.com`), and returns
  `{ publicUrl: "https://abc123.trycloudflare.com" }`.

#### Scenario: Stop tunnel

- **Given** tunnel is running
- **When** `POST /api/tunnel/stop` is called
- **Then** the cloudflared process is killed, tunnel state is set to
  `stopped`, and `tunnel:status-changed` WS event is broadcast.

#### Scenario: Tunnel crash recovery

- **Given** tunnel is running
- **When** the cloudflared process crashes unexpectedly
- **Then** the system sets tunnel state to `error`, broadcasts
  `tunnel:status-changed`, and does NOT auto-restart (user must
  explicitly re-start).

### REQ-TUNNEL-03: Idle Auto-Stop

The tunnel SHALL automatically stop after a configurable idle period
(default 30 minutes) when no paired devices have an active WebSocket
connection.

#### Scenario: All mobile devices disconnect

- **Given** tunnel is running with one connected device
- **When** the device disconnects and no new device connects within
  30 minutes
- **Then** the tunnel is automatically stopped and `tunnel:status-changed`
  event is broadcast.

### REQ-TUNNEL-04: Tunnel Status API

The system SHALL expose `GET /api/tunnel/status` returning the current
`TunnelState` including status, public URL, connected device count,
and any error message.

#### Scenario: Query tunnel status while running

- **Given** tunnel is running at `https://abc123.trycloudflare.com`
  with 1 connected device
- **When** `GET /api/tunnel/status` is called
- **Then** response is `{ status: "running", publicUrl: "https://...",
  connectedDevices: [...], startedAt: <timestamp>, error: null }`.
