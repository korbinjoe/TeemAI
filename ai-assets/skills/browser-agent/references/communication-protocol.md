# Communication Protocol: TeemAI Skill ↔ Browser Extension

## Architecture

```
TeemAI Agent
  → browser-agent skill
    → browser.sh (Layer 1: OS/Chrome — launch, navigate, tab switch)
    → HTTP POST to localhost:<port> (Layer 2: extension commands)
      → browser-agent-daemon
        ↔ Native Messaging ↔ Browser Extension (service worker)
          → Content Script → Reddit/Twitter/Xiaohongshu DOM
```

### Components

1. **browser-agent-daemon** (`scripts/daemon.mjs`): Standalone Node.js process
   - Runs a local HTTP server on a random available port
   - Writes port to `~/.teemai/browser-agent/daemon.port`
   - Communicates with extension via Chrome Native Messaging (stdin/stdout)
   - Manages command queue, result storage, and status tracking

2. **Browser Extension Native Messaging Host**: Registered with Chrome
   - Connects to daemon via stdin/stdout
   - Receives commands from daemon, executes via content scripts
   - Returns results to daemon

3. **Skill Shell Scripts**: HTTP clients
   - Read daemon port from `daemon.port` file
   - Send commands via `curl` to `http://localhost:<port>/api/...`
   - Parse JSON responses

### Daemon Lifecycle

```
Extension loads
  → Starts native messaging host
    → Native host launches daemon.mjs (if not running)
      → Daemon starts HTTP server on random port
      → Daemon writes port to ~/.teemai/browser-agent/daemon.port
      → Daemon sends "ready" to extension via stdout

Skill script runs
  → Reads port from daemon.port
  → curl http://localhost:<port>/api/status
  → If 200: daemon is running
  → If connection refused: daemon not running, exit 10

User closes browser / extension unloads
  → Native messaging host exits
  → Daemon detects stdin close, shuts down HTTP server
  → Daemon removes daemon.port file
```

### HTTP API (Daemon)

```
POST /api/command
  Body: { "type": "navigate"|"monitor"|"post"|"reply"|"generate"|"analytics"|"configure"|"pause"|"resume"|"feedback", "payload": {...} }
  Response: { "taskId": "cmd-xxx", "status": "queued" } (async)
          or { "status": "success", "result": {...} } (sync, fast commands)

GET /api/result/<taskId>
  Response: { "status": "success"|"failed"|"pending", "result"?: {...}, "error"?: string }

GET /api/status
  Response: { "connected": bool, "riskLevel": string, "activeAccounts": [...], "todayStats": {...} }

POST /api/confirm/<taskId>
  Body: { "confirmed": true }
  Response: { "status": "confirmed" }

GET /api/health
  Response: { "ok": true, "uptime": number, "version": string }
```

### Native Messaging Protocol (Daemon ↔ Extension)

Messages are JSON objects sent via stdin/stdout (newline-delimited):

```
// Daemon → Extension (command)
{"type":"command","id":"cmd-123","action":"monitor","payload":{"platform":"reddit","subreddit":"SaaS"}}

// Extension → Daemon (result)
{"type":"result","id":"cmd-123","status":"success","result":[...]}

// Extension → Daemon (status update)
{"type":"status","data":{"riskLevel":"safe","postsToday":2}}

// Daemon → Extension (heartbeat)
{"type":"ping"}

// Extension → Daemon (heartbeat response)
{"type":"pong"}
```

### Error Handling

| Scenario | Behavior |
|----------|----------|
| Daemon not running | Scripts exit 10, suggest starting extension |
| Extension disconnected | Daemon returns 503 with "extension disconnected" |
| Command timeout (60s default) | Task marked as "timeout", scripts exit 30 |
| Risk block | Command rejected with 403, risk explanation in response |
| Native messaging crash | Daemon auto-restarts native host, re-queues pending commands |

### Security

- Daemon binds to `127.0.0.1` only (not accessible from network)
- Random port assigned at startup (not predictable)
- Port file created with mode `0600` (owner-only read)
- No authentication needed (localhost trust model)
- Daemon auto-exits when extension disconnects (no orphan processes)
