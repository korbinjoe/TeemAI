# Mobile Remote Control — Technical Design

## Architecture Overview

```
┌──────────────┐       ┌───────────────────┐       ┌──────────────┐
│  Mobile PWA  │──WSS──│  Cloudflare Edge  │──WSS──│ Desktop App  │
│  (phone)     │──HTTPS│  (tunnel proxy)   │──HTTP─│ (Express +   │
└──────────────┘       └───────────────────┘       │  Electron)   │
                                                    └──────────────┘
```

The mobile phone never connects directly to the desktop. A Cloudflare
Quick Tunnel or named tunnel proxies HTTPS/WSS traffic from a public URL
to `localhost:<serverPort>`. The existing Express server and WebSocket
endpoint serve both the local Electron webview AND the remote mobile PWA
through the same code paths.

## Module Breakdown

### 1. TunnelManager (new: `server/tunnel/TunnelManager.ts`)

Lifecycle manager for the `cloudflared` child process.

```typescript
interface TunnelState {
  status: 'stopped' | 'starting' | 'running' | 'error'
  publicUrl: string | null
  connectedDevices: PairedDevice[]
  startedAt: number | null
  error: string | null
}

interface PairedDevice {
  id: string
  name: string          // user-agent derived
  pairedAt: number
  lastSeenAt: number
  sessionToken: string  // hashed
}

class TunnelManager {
  start(): Promise<string>       // returns public URL
  stop(): void
  getState(): TunnelState
  getPublicUrl(): string | null

  // Device management
  generatePairingUrl(): { url: string; token: string; expiresAt: number }
  exchangePairingToken(oneTimeToken: string): { sessionToken: string; device: PairedDevice } | null
  revokeDevice(deviceId: string): void
  listDevices(): PairedDevice[]
}
```

**Implementation details:**
- Spawns `cloudflared tunnel --url http://localhost:<port> --no-autoupdate`
  as a child process.
- Parses the public URL from cloudflared's stderr output
  (`INF | https://<hash>.trycloudflare.com`).
- Stores paired devices in SQLite (`paired_devices` table) so they
  survive restarts.
- Auto-downloads `cloudflared` binary on first use to
  `~/.openteam/bin/cloudflared` (platform-specific).
- Idle timeout: stops tunnel after 30 minutes with no connected devices.

### 2. Pairing Flow (new: `server/routes/system/tunnelRoutes.ts`)

```
POST /api/tunnel/start        → { publicUrl }
POST /api/tunnel/stop         → { ok }
GET  /api/tunnel/status       → TunnelState
POST /api/tunnel/pair         → { qrUrl, pairingToken, expiresAt }
POST /api/tunnel/pair/exchange → { sessionToken, deviceId }
GET  /api/tunnel/devices      → PairedDevice[]
DELETE /api/tunnel/devices/:id → { ok }
```

**QR code content**: `https://<tunnel-url>/mobile?pair=<one-time-token>`

**Exchange flow:**
1. Mobile opens the QR URL → hits `/mobile` route.
2. Frontend detects `?pair=` param, calls `POST /api/tunnel/pair/exchange`
   with the one-time token.
3. Server validates token (not expired, not used), generates a session
   token (crypto.randomBytes(32).toString('hex')), stores the device.
4. Returns session token → mobile stores in localStorage.
5. Subsequent requests use `Authorization: Bearer <sessionToken>`.
6. The existing `createAuthMiddleware` already handles Bearer tokens, so
   no auth code changes needed — just set the session token as the
   `OPENTEAM_AUTH_TOKEN` equivalent for that device.

**Auth model refinement:**
- Current auth uses a single `OPENTEAM_AUTH_TOKEN` env var.
- For mobile, we introduce per-device session tokens stored in
  `paired_devices` table.
- Modify `createAuthMiddleware` to also check the `paired_devices` table
  when the Bearer token doesn't match `OPENTEAM_AUTH_TOKEN`.

### 3. Auth Middleware Extension (`server/middleware/auth.ts`)

```typescript
// Current: single token check
// New: check OPENTEAM_AUTH_TOKEN OR any valid paired device token

export const createAuthMiddleware = (
  globalToken: string | undefined,
  tunnelManager?: TunnelManager,
) => (req, res, next) => {
  // ... existing localhost check ...

  const bearerToken = extractBearer(req)

  // Check global token first (existing behavior)
  if (globalToken && bearerToken === globalToken) return next()

  // Check paired device tokens
  if (tunnelManager?.validateSessionToken(bearerToken)) return next()

  res.status(401).json({ error: 'Invalid or missing authentication token' })
}
```

WebSocket auth (`verifyWsConnection`) gets the same extension.

### 4. Mobile PWA Routes (new: `web/mobile/`)

```
web/mobile/
  MobileLayout.tsx          — shell: status bar, bottom nav
  pages/
    MobileDashboard.tsx     — mission list grouped by status
    MobileMissionDetail.tsx — conversation view + action bar
    MobileQuickDispatch.tsx — new mission form
    MobilePairing.tsx       — pairing handshake screen
  components/
    MissionCard.tsx         — compact mission card
    PermissionBanner.tsx    — approve/reject inline
    AgentMessage.tsx        — single message bubble
    BottomNav.tsx           — tab bar navigation
  hooks/
    useMobileAuth.ts        — token exchange + storage
    useMobileMissions.ts    — mission list with WS live updates
```

**Routing:**
```typescript
// In App.tsx, add:
<Route path="/mobile" element={<MobileLayout />}>
  <Route index element={<MobileDashboard />} />
  <Route path="mission/:missionId" element={<MobileMissionDetail />} />
  <Route path="dispatch" element={<MobileQuickDispatch />} />
</Route>
<Route path="/mobile/pair" element={<MobilePairing />} />
```

**PWA manifest** (`public/manifest.json`):
```json
{
  "name": "OpenTeam Remote",
  "short_name": "OpenTeam",
  "start_url": "/mobile",
  "display": "standalone",
  "background_color": "#0a0a0a",
  "theme_color": "#0a0a0a",
  "icons": [...]
}
```

### 5. Cloudflared Binary Management (new: `server/tunnel/CloudflaredInstaller.ts`)

```typescript
class CloudflaredInstaller {
  async ensureInstalled(): Promise<string>  // returns binary path
  isInstalled(): boolean
  getVersion(): string | null
}
```

- Downloads platform-specific binary from Cloudflare's GitHub releases.
- Stores at `~/.openteam/bin/cloudflared` (or `cloudflared.exe`).
- Verifies checksum after download.
- Supports: `darwin-amd64`, `darwin-arm64`, `linux-amd64`, `windows-amd64`.

### 6. Desktop UI: Tunnel Control

**Settings page section** (`web/pages/SettingsPage.tsx`):
- Toggle tunnel on/off.
- Show current public URL.
- "Connect Mobile" button → shows QR code modal.
- Connected devices list with revoke buttons.

**Tray menu addition** (`electron/modules/TrayManager.ts`):
- "Connect Mobile" menu item → triggers QR code display.
- Shows connected device count when tunnel is active.

### 7. WebSocket Message Extensions

New WS events for tunnel state sync:

```typescript
// Server → Client (desktop only, not mobile)
'tunnel:status-changed': TunnelState
'tunnel:device-connected': { device: PairedDevice }
'tunnel:device-disconnected': { deviceId: string }
```

## Data Model

### New table: `paired_devices`

```sql
CREATE TABLE paired_devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  session_token_hash TEXT NOT NULL UNIQUE,
  paired_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER,
  revoked_at INTEGER
);
```

### New table: `tunnel_state`

```sql
CREATE TABLE tunnel_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- Stores: last_tunnel_id, auto_start_tunnel, idle_timeout_minutes
```

## Decisions

### D1: Cloudflare Quick Tunnel vs Named Tunnel vs Custom Relay

**Decision: Quick Tunnel for MVP, upgrade path to Named Tunnel.**

Quick Tunnel requires zero configuration and no Cloudflare account.
Downside: URL changes on every restart. For MVP this is acceptable —
the phone re-scans QR when URL changes. Named Tunnel (free account
required) gives stable URL for later.

Custom relay rejected: requires hosting infrastructure, adds latency,
maintenance burden. Cloudflare edge is faster and free.

### D2: Same React codebase vs Separate mobile app

**Decision: Same codebase, `/mobile` route group.**

Reuses all existing hooks, WebSocket client, API layer, and Tailwind
config. Mobile components are leaf-level only — no shared component
library refactor needed. Build output is a single bundle; mobile loads
only its route chunk via code splitting.

### D3: Auth model — single token vs per-device tokens

**Decision: Per-device tokens stored in SQLite.**

Single `OPENTEAM_AUTH_TOKEN` doesn't support revocation per device.
Per-device tokens allow: see who's connected, revoke one phone without
affecting others, track last-seen for idle cleanup.

### D4: Mobile notifications — Web Push vs WebSocket-only

**Decision: WebSocket in-app notifications for MVP.**

Web Push API requires a push service subscription and server-side push
endpoint, adding complexity. WebSocket notifications work when the PWA
tab is open (foreground). iOS PWA push support is limited. Start with
WebSocket, add Web Push as a Phase 3 enhancement if needed.

## Security Considerations

1. **Tunnel exposure**: the tunnel makes the server reachable from the
   internet. Every request goes through auth middleware. The tunnel only
   runs when explicitly enabled by the user.
2. **Token storage**: session tokens hashed with SHA-256 before storage
   in SQLite. Raw token only exists in mobile localStorage.
3. **Pairing token**: one-time, 5-minute TTL, 32-byte random.
4. **No secrets over QR**: the QR contains a URL with a one-time pairing
   token, not the session token. The session token is returned over HTTPS
   after exchange.
5. **Auto-stop**: tunnel stops after configurable idle period (default
   30 min) with no mobile connections.
6. **Rate limiting**: pairing endpoint rate-limited to prevent brute-force
   (5 attempts per minute).
