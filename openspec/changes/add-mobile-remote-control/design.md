# Mobile Remote Control (LAN) — Technical Design

## Architecture Overview

```
┌──────────────┐                    ┌───────────────┐
│  Mobile PWA  │──── HTTP/WS ──────▶│ MacBook       │
│  (phone)     │   192.168.x.x:port │ Express Server│
└──────────────┘                    └───────────────┘
         same Wi-Fi / LAN
```

No proxy, no tunnel, no relay. The phone connects directly to the
Express server that Electron already runs. The existing auth middleware
gates non-localhost requests via Bearer token.

## Module Breakdown

### 1. LAN Access Controller (new: `server/lan/LanAccessController.ts`)

Manages runtime auth token lifecycle and LAN IP detection.

```typescript
import { networkInterfaces } from 'os'
import { randomBytes } from 'crypto'

class LanAccessController {
  private token: string | null = null
  private enabledAt: number | null = null

  enable(): { token: string; lanUrl: string } {
    this.token = randomBytes(32).toString('hex')
    this.enabledAt = Date.now()
    setRuntimeAuthToken(this.token)
    const ip = this.detectLanIp()
    const port = getServerPort()
    return {
      token: this.token,
      lanUrl: `http://${ip}:${port}/mobile?token=${this.token}`,
    }
  }

  disable(): void {
    this.token = null
    this.enabledAt = null
    setRuntimeAuthToken(null)
  }

  isEnabled(): boolean {
    return this.token !== null
  }

  getStatus(): LanAccessStatus {
    return {
      enabled: this.isEnabled(),
      lanIp: this.detectLanIp(),
      enabledAt: this.enabledAt,
    }
  }

  private detectLanIp(): string {
    const nets = networkInterfaces()
    for (const name of ['en0', 'wlan0', 'eth0']) {
      const iface = nets[name]
      if (!iface) continue
      const v4 = iface.find(i => i.family === 'IPv4' && !i.internal)
      if (v4) return v4.address
    }
    // Fallback: first non-internal IPv4
    for (const iface of Object.values(nets)) {
      const v4 = iface?.find(i => i.family === 'IPv4' && !i.internal)
      if (v4) return v4.address
    }
    return '127.0.0.1'
  }
}

interface LanAccessStatus {
  enabled: boolean
  lanIp: string | null
  enabledAt: number | null
}
```

~60 lines. No database, no persistence. Token lives in memory — restarting
the server disables LAN access (safe default).

### 2. Auth Middleware Extension (`server/middleware/auth.ts`)

Minimal change — add runtime token support:

```typescript
// ADD: runtime token setter
let runtimeToken: string | null = null
export const setRuntimeAuthToken = (token: string | null) => {
  runtimeToken = token
}

// MODIFY: getAuthToken to check runtime token first
export const getAuthToken = (): string | undefined =>
  runtimeToken ?? process.env.OPENTEAM_AUTH_TOKEN ?? undefined
```

All downstream code (`createAuthMiddleware`, `verifyWsConnection`) already
calls `getAuthToken()`, so they automatically pick up the runtime token.
Zero changes to the middleware functions themselves.

### 3. LAN API Routes (new: `server/routes/system/lanRoutes.ts`)

```
POST /api/lan/enable   → { lanUrl, token }
POST /api/lan/disable  → { ok }
GET  /api/lan/status   → LanAccessStatus
```

These endpoints are localhost-only (existing middleware already blocks
remote access to non-whitelisted paths). Only the desktop UI calls them.

### 4. Desktop UI: QR Modal

**Settings page** — new "Remote Control" section:

```
┌─────────────────────────────────┐
│ Remote Control                  │
│                                 │
│ [Enable LAN Access]             │
│                                 │
│ (when enabled:)                 │
│ ┌─────────┐                     │
│ │ QR Code │  Scan with phone    │
│ │         │  to connect         │
│ └─────────┘                     │
│                                 │
│ LAN IP: 192.168.1.100:13001    │
│ Status: ● Connected (1 client)  │
│                                 │
│ [Disable LAN Access]            │
└─────────────────────────────────┘
```

**Tray menu** — add "Connect Mobile" item that triggers the same flow
via IPC bridge → opens a BrowserWindow with the QR.

**QR generation**: use `qrcode` npm package (browser-side, canvas-based).
The QR encodes the full URL including token.

### 5. Mobile PWA Routes (new: `web/mobile/`)

```
web/mobile/
  MobileLayout.tsx              — status bar + bottom tab nav
  pages/
    MobileDashboard.tsx         — mission list by status
    MobileMissionDetail.tsx     — conversation + input + permission
    MobileQuickDispatch.tsx     — new mission form
  components/
    MissionCard.tsx             — compact card
    PermissionBanner.tsx        — approve/reject banner
    AgentMessage.tsx            — message bubble
    BottomNav.tsx               — tab bar
    ConnectionStatus.tsx        — connected/reconnecting indicator
  hooks/
    useMobileAuth.ts            — read token from URL/localStorage
    useMobileMissions.ts        — mission list with WS live updates
```

**Routing** (add to `App.tsx`):
```tsx
<Route path="/mobile" element={<MobileLayout />}>
  <Route index element={<MobileDashboard />} />
  <Route path="mission/:missionId" element={<MobileMissionDetail />} />
  <Route path="dispatch" element={<MobileQuickDispatch />} />
</Route>
```

**Data flow** — same as desktop, no new APIs:
- Missions: `GET /api/chats/recent` + `chat:activity` WS events
- Conversation: `GET /api/conversation/:sessionId`
- Send message: `expert:direct-input` WS event
- Permission: `chat:permission-request` WS → `expert:permission-response` WS
- Create mission: `POST /api/workspaces/:id/chats` + `expert:direct-input`
- Workspaces: `GET /api/workspaces`
- Agents: `GET /api/agents`

### 6. Mobile Auth Hook (`web/mobile/hooks/useMobileAuth.ts`)

```typescript
const useMobileAuth = () => {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    if (token) {
      localStorage.setItem('openteam-mobile-token', token)
      // Remove token from URL to avoid leaking in screenshots/shares
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const token = localStorage.getItem('openteam-mobile-token')
  return { isAuthenticated: !!token, token }
}
```

The existing `getAuthToken()` in `web/config/api.ts` already reads from
URL params. For mobile, we also check localStorage so the token persists
across page reloads after the initial QR scan.

## Decisions

### D1: Runtime token vs Database-persisted token

**Decision: Runtime (in-memory) token.**

- LAN access is an ephemeral session, not a permanent config.
- Server restart = LAN access disabled = safe default.
- No migration, no new table, no cleanup logic.

### D2: Separate mobile app vs Same codebase route group

**Decision: Same codebase, `/mobile` route group.**

- Reuses all hooks, WS client, API layer, Tailwind config.
- Code-split via React lazy loading — desktop never loads mobile chunks.
- Single build/deploy artifact.

### D3: Connected device tracking

**Decision: Defer. Not needed for LAN MVP.**

- The desktop shows "LAN access enabled" but doesn't track individual
  devices. The WS connection count is visible in server logs.
- Future enhancement: count remote WS connections, show in UI.

### D4: QR code — server-side vs client-side generation

**Decision: Client-side (browser canvas).**

- `qrcode` package works in browser, no server endpoint needed.
- Desktop UI calls `/api/lan/enable`, gets the URL, renders QR locally.
- Keeps the server change minimal.

## Security Considerations

1. **LAN trust boundary**: HTTP (not HTTPS) is acceptable within a home/
   office LAN. The token prevents other devices on the network from
   accessing the server without authorization.
2. **Token in URL**: only present on the initial QR scan. Mobile auth hook
   immediately moves it to localStorage and strips it from the URL bar.
3. **Token lifecycle**: token exists only in server memory. Disabling LAN
   access or restarting the server invalidates it immediately.
4. **Localhost-only control**: the enable/disable endpoints are only
   accessible from localhost (existing auth middleware behavior).

## Files Changed Summary

| File | Change |
|------|--------|
| `server/middleware/auth.ts` | Add `runtimeToken` + `setRuntimeAuthToken()` (~8 lines) |
| `server/lan/LanAccessController.ts` | **New** — token lifecycle + IP detection (~60 lines) |
| `server/routes/system/lanRoutes.ts` | **New** — 3 endpoints (~40 lines) |
| `server/startup/routeSetup.ts` | Wire lanRoutes (~3 lines) |
| `server/index.ts` | Instantiate LanAccessController (~3 lines) |
| `web/App.tsx` | Add `/mobile` routes (~5 lines) |
| `web/mobile/**` | **New** — entire mobile UI (~8-10 files) |
| Settings page component | Add "Remote Control" section (~80 lines) |
| `electron/modules/TrayManager.ts` | Add "Connect Mobile" menu item (~10 lines) |
