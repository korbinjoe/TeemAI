# Tasks — Mobile Remote Control

## Phase 1: Relay Tunnel + Pairing

### Cloudflared Binary Management
- [ ] Create `server/tunnel/CloudflaredInstaller.ts` — auto-download platform binary to `~/.openteam/bin/cloudflared`
- [ ] Add checksum verification for downloaded binary
- [ ] Support platforms: `darwin-arm64`, `darwin-amd64`, `linux-amd64`, `windows-amd64`

### Tunnel Lifecycle
- [ ] Create `server/tunnel/TunnelManager.ts` — spawn/kill cloudflared child process, parse public URL from stderr
- [ ] Implement idle auto-stop (configurable, default 30 min)
- [ ] Handle process crash detection and state cleanup
- [ ] Add `tunnel:status-changed` WS event to broadcast tunnel state

### Device Pairing & Auth
- [ ] Create DB migration for `paired_devices` table (`id, name, session_token_hash, paired_at, last_seen_at, expires_at, revoked_at`)
- [ ] Create `server/stores/PairedDeviceStore.ts` for device CRUD
- [ ] Implement pairing token generation (32-byte random, 5-min TTL)
- [ ] Implement token exchange endpoint (`POST /api/tunnel/pair/exchange`)
- [ ] Add rate limiting on pairing endpoint (5 attempts/min/IP)
- [ ] Extend `createAuthMiddleware` to check per-device session tokens
- [ ] Extend `verifyWsConnection` to check per-device session tokens
- [ ] Update device `lastSeenAt` on each authenticated request

### Tunnel API Routes
- [ ] Create `server/routes/system/tunnelRoutes.ts` with endpoints: `start`, `stop`, `status`, `pair`, `pair/exchange`, `devices`, `devices/:id` (DELETE)
- [ ] Wire routes into `server/startup/routeSetup.ts`

### Desktop UI: Tunnel Control
- [ ] Add "Remote Control" section to Settings page — toggle tunnel, show URL, QR code button
- [ ] Create QR code modal component (use `qrcode` npm package for generation)
- [ ] Add connected devices list with revoke buttons
- [ ] Add "Connect Mobile" tray menu item (Electron `TrayManager`)

### Validation
- [ ] Write integration tests for TunnelManager (mock cloudflared process)
- [ ] Write tests for pairing flow (token gen → exchange → auth)
- [ ] Write tests for device revocation
- [ ] Manual test: scan QR on phone, verify tunnel connectivity

## Phase 2: Mobile PWA

### Mobile Layout & Routing
- [ ] Create `web/mobile/MobileLayout.tsx` — shell with status bar + bottom tab nav
- [ ] Add `/mobile/*` routes to `App.tsx`
- [ ] Create `web/mobile/components/BottomNav.tsx` — Dashboard / Dispatch tabs
- [ ] Add viewport meta tag and PWA manifest (`public/manifest.json`)
- [ ] Add basic service worker for offline shell

### Pairing Handshake Screen
- [ ] Create `web/mobile/pages/MobilePairing.tsx` — detect `?pair=` param, exchange token, store in localStorage
- [ ] Create `web/mobile/hooks/useMobileAuth.ts` — manage session token lifecycle, redirect to pairing if missing

### Dashboard
- [ ] Create `web/mobile/pages/MobileDashboard.tsx` — mission list grouped by status
- [ ] Create `web/mobile/components/MissionCard.tsx` — compact card with title, workspace, agents, phase, cost
- [ ] Wire WebSocket `chat:activity` events for live updates
- [ ] Fetch initial data from `GET /api/chats/recent`

### Mission Detail
- [ ] Create `web/mobile/pages/MobileMissionDetail.tsx` — conversation view
- [ ] Create `web/mobile/components/AgentMessage.tsx` — message bubble with agent icon
- [ ] Create message input bar with send button
- [ ] Wire `expert:direct-input` for sending messages
- [ ] Create `web/mobile/components/PermissionBanner.tsx` — inline approve/reject

### Quick Dispatch
- [ ] Create `web/mobile/pages/MobileQuickDispatch.tsx` — prompt input + workspace/agent selector
- [ ] Wire `POST /api/workspaces/:id/chats` + `expert:direct-input` for dispatch
- [ ] Navigate to mission detail after dispatch

### Connection Status
- [ ] Add connection indicator to MobileLayout status bar
- [ ] Reuse existing `WebSocketClient` reconnection logic

### Validation
- [ ] Mobile responsive testing on iOS Safari + Android Chrome
- [ ] Test PWA install on both platforms
- [ ] Test permission approval flow end-to-end from phone

## Phase 3: Push Notifications (Future)

- [ ] Investigate Web Push API viability on mobile browsers
- [ ] Add notification permission request flow
- [ ] Server-side push for permission requests and mission completion
- [ ] Fallback to WebSocket in-app notifications when push unavailable

## Dependencies

| Task | Depends On |
|------|-----------|
| Tunnel API Routes | TunnelManager, PairedDeviceStore |
| Desktop UI: Tunnel Control | Tunnel API Routes |
| Mobile Pairing Screen | Tunnel API Routes (exchange endpoint) |
| Mobile Dashboard | Mobile Layout, Mobile Auth |
| Mission Detail | Mobile Dashboard (navigation) |
| Quick Dispatch | Mobile Layout, Mobile Auth |
| Phase 3 | Phase 2 complete |

## Parallelizable Work

- **Phase 1**: CloudflaredInstaller + DB migration can run in parallel
- **Phase 1**: Tunnel routes + auth middleware extension can run in parallel after TunnelManager
- **Phase 2**: Dashboard + Quick Dispatch can be built in parallel after MobileLayout
- **Phase 2**: PermissionBanner is independent of other mobile components
