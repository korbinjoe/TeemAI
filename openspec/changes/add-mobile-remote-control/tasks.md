# Tasks — Mobile Remote Control (LAN)

## Phase 1: LAN Access + QR Pairing

### Auth Extension
- [x] Add `runtimeToken` + `setRuntimeAuthToken()` to `server/middleware/auth.ts`
- [x] Refactor `createAuthMiddleware` and `verifyWsConnection` to read token dynamically via `getAuthToken()`

### LAN Access Controller
- [x] Create `server/lan/LanAccessController.ts` — token generation, LAN IP detection, enable/disable lifecycle

### LAN API Routes
- [x] Create `server/routes/system/lanRoutes.ts` — `POST enable`, `POST disable`, `GET status`
- [x] Wire into `server/startup/routeSetup.ts`
- [x] Instantiate `LanAccessController` in `server/index.ts`

### Desktop UI: QR Modal
- [x] Add `qrcode` + `@types/qrcode` npm packages
- [x] Create `web/components/settings/RemoteControlSettings.tsx` — enable/disable toggle, QR code canvas, LAN URL, copy button
- [x] Add "Remote" section to `GeneralSettings.tsx`
- [x] Add "Connect Mobile..." item to Tray menu (`electron/modules/TrayManager.ts`)

## Phase 2: Mobile PWA

### Mobile Auth
- [x] Create `web/mobile/hooks/useMobileAuth.ts` — extract token from URL → localStorage, strip from URL bar
- [x] Extend `web/config/api.ts` `getAuthToken()` to check localStorage on `/mobile` routes

### Mobile Layout & Routing
- [x] Create `web/mobile/components/BottomNav.tsx` — "Missions" and "New" tabs
- [x] Create `web/mobile/components/ConnectionStatus.tsx` — connection indicator with reconnect guidance
- [x] Create `web/mobile/MobileLayout.tsx` — status bar + outlet + bottom nav, unauthenticated guard
- [x] Add `/mobile/*` routes to `App.tsx` with React.lazy code splitting

### Dashboard
- [x] Create `web/mobile/hooks/useMobileMissions.ts` — fetch all workspace chats + live WS updates
- [x] Create `web/mobile/pages/MobileDashboard.tsx` — mission list grouped by active/recent with status dots

### Mission Detail
- [x] Create `web/mobile/pages/MobileMissionDetail.tsx` — mission info, agent list, permission request banner with approve/reject

### Quick Dispatch
- [x] Create `web/mobile/pages/MobileDispatch.tsx` — workspace picker, prompt textarea, dispatch button

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
