# Tasks — Mobile Remote Control (LAN)

## Phase 1: LAN Access + QR Pairing

### Auth Extension
- [ ] Add `runtimeToken` + `setRuntimeAuthToken()` to `server/middleware/auth.ts` (~8 lines)
- [ ] Verify existing `createAuthMiddleware` and `verifyWsConnection` work with runtime token (read-only check, no code change expected)

### LAN Access Controller
- [ ] Create `server/lan/LanAccessController.ts` — token generation, LAN IP detection, enable/disable lifecycle (~60 lines)

### LAN API Routes
- [ ] Create `server/routes/system/lanRoutes.ts` — `POST enable`, `POST disable`, `GET status` (~40 lines)
- [ ] Wire into `server/startup/routeSetup.ts`
- [ ] Instantiate `LanAccessController` in `server/index.ts`

### Desktop UI: QR Modal
- [ ] Add `qrcode` npm package (browser-side, canvas-based)
- [ ] Add "Remote Control" section to Settings page — enable/disable toggle, QR code display, LAN IP text, copy URL button
- [ ] Add "Connect Mobile" item to Tray menu (`electron/modules/TrayManager.ts`) — triggers QR display via IPC

### Validation (Phase 1)
- [ ] Unit test `LanAccessController` (token gen, IP detection, enable/disable)
- [ ] Unit test auth middleware with runtime token
- [ ] Manual test: enable LAN → scan QR on phone → verify desktop web UI loads with auth

## Phase 2: Mobile PWA

### Mobile Layout & Routing
- [ ] Create `web/mobile/MobileLayout.tsx` — status bar (connection indicator) + bottom tab nav
- [ ] Add `/mobile/*` routes to `App.tsx` with React.lazy code splitting
- [ ] Create `web/mobile/components/BottomNav.tsx` — "Missions" and "New" tabs
- [ ] Create `web/mobile/components/ConnectionStatus.tsx` — green/yellow/red dot with label

### Mobile Auth
- [ ] Create `web/mobile/hooks/useMobileAuth.ts` — extract token from URL param → localStorage, strip from URL bar, return auth state
- [ ] Extend `web/config/api.ts` `getAuthToken()` to also check `localStorage('openteam-mobile-token')` when on `/mobile` route
- [ ] Handle 401 responses: clear stored token, show "scan QR again" message

### Dashboard
- [ ] Create `web/mobile/pages/MobileDashboard.tsx` — mission list grouped by status (running → waiting → done)
- [ ] Create `web/mobile/components/MissionCard.tsx` — title, workspace badge, agent count, phase dot, tool progress bar, cost
- [ ] Create `web/mobile/hooks/useMobileMissions.ts` — fetch `GET /api/chats/recent` + subscribe to `chat:activity` WS events for live updates

### Mission Detail
- [ ] Create `web/mobile/pages/MobileMissionDetail.tsx` — conversation view + action bar
- [ ] Create `web/mobile/components/AgentMessage.tsx` — message bubble with agent icon, name, timestamp
- [ ] Add message input bar (text input + send button), wire to `expert:direct-input` WS event
- [ ] Create `web/mobile/components/PermissionBanner.tsx` — sticky banner for permission requests with approve/reject buttons, wire to `expert:permission-response` WS event

### Quick Dispatch
- [ ] Create `web/mobile/pages/MobileQuickDispatch.tsx` — prompt textarea, workspace dropdown, agent dropdown, "Go" button
- [ ] Wire to `POST /api/workspaces/:id/chats` + `expert:direct-input`, navigate to mission detail after dispatch

### Validation (Phase 2)
- [ ] Test on iOS Safari (iPhone SE, iPhone 15 sizes)
- [ ] Test on Android Chrome
- [ ] Test permission approval flow end-to-end from phone
- [ ] Test quick dispatch creates and starts a mission
- [ ] Test WebSocket reconnection on network switch (Wi-Fi toggle)

## Dependencies

| Task | Depends On |
|------|-----------|
| LAN API Routes | LanAccessController, Auth Extension |
| Desktop QR Modal | LAN API Routes, `qrcode` package |
| Mobile Auth | Auth Extension (runtime token) |
| Mobile Layout | Mobile Auth |
| Dashboard | Mobile Layout, `useMobileMissions` hook |
| Mission Detail | Dashboard (navigation from card) |
| Quick Dispatch | Mobile Layout, Mobile Auth |

## Parallelizable Work

- **Phase 1**: Auth extension + LanAccessController can be built in parallel
- **Phase 1**: QR Modal (frontend) + LAN routes (backend) can be built in parallel after LanAccessController
- **Phase 2**: Dashboard + Quick Dispatch can be built in parallel after MobileLayout
- **Phase 2**: PermissionBanner is independent of AgentMessage
