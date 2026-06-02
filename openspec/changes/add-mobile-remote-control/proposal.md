# Add Mobile Remote Control (LAN)

## Summary

Enable the user to control their desktop OpenTeam instance from a mobile
phone on the same Wi-Fi network. The phone scans a QR code displayed on
the desktop, connects directly to the Express server via LAN IP, and
renders a mobile-optimized PWA that covers the core pulse-mode loop: view
running missions, read agent output, send messages / approve permissions,
and dispatch new missions.

No external services, no tunnels, no account registration. The existing
server and auth infrastructure already support LAN access — the main work
is a mobile-optimized frontend and a QR pairing UX.

## Why

OpenTeam's design principle is **pulse-mode**: batch-dispatch tasks, leave,
come back to batch-review. Today "leave" means leaving the desktop — but
the user still wants to **glance** at mission status from their phone
(meeting, coffee, couch). When an agent hits a permission prompt or needs
user input, the user is blocked until they return to the desktop.

The infrastructure is already in place:
- **Server listens on 0.0.0.0** — `httpServer.listen(port)` with no host
  argument, so it's already reachable on the LAN.
- **Auth supports remote access** — `server/middleware/auth.ts` requires
  Bearer token for non-localhost requests (HTTP + WebSocket).
- **Frontend supports token injection** — `web/config/api.ts` reads
  `?token=` from URL, injects into `authFetch()` and WS query string.
- **All mission state** flows through a single WebSocket protocol
  (`shared/ws-types.ts`) and REST API (`/api/chats/*`, `/api/workspaces/*`).

What's missing: (1) a UX to enable LAN access and generate a QR code,
and (2) a mobile-optimized UI surface.

## Goals

- **One-scan connectivity**: user clicks "Connect Mobile" on desktop,
  scans the QR on phone, done. No manual IP/port/token entry.
- **Pulse-mode on mobile**: view all running missions with live status,
  read the latest agent message, approve/reject permission requests,
  send follow-up messages to agents.
- **Zero dependencies**: no external services, no binary downloads, no
  account registration. Pure LAN HTTP/WS.
- **Minimal server changes**: leverage existing auth middleware and
  WebSocket protocol. Backend delta is ~50 lines.

## Non-Goals

- Internet/WAN access (Cloudflare tunnel, relay server) — future upgrade.
- Full desktop parity on mobile (no terminal, no file tree, no code editor).
- Multi-user / team access — single-user remote control only.
- Native mobile app — PWA first.
- Running agents on the phone — phone is a thin remote.
- HTTPS on LAN — requires cert infrastructure; HTTP is acceptable within
  a trusted local network.
- Offline/PWA-install — no value when LAN connectivity is required.

## Approach

### 1. LAN Access Enable + QR Pairing

1. User clicks "Connect Mobile" in desktop Settings page or Tray menu.
2. Server generates a random auth token (runtime, not env var), detects
   the machine's LAN IP address.
3. Composes URL: `http://192.168.x.x:<port>/mobile?token=<token>`
4. Displays as QR code in a modal dialog.
5. Phone scans → opens mobile PWA in browser → token stored in
   localStorage for subsequent visits.
6. Desktop shows "Mobile Connected" indicator when a remote WS client
   is active. "Disable LAN Access" clears the token and disconnects.

### 2. Auth Middleware (Minimal Change)

Current `getAuthToken()` reads `process.env.OPENTEAM_AUTH_TOKEN`. Extend
to also support a runtime-set token:

```typescript
let runtimeToken: string | null = null
export const setRuntimeAuthToken = (t: string | null) => { runtimeToken = t }
export const getAuthToken = (): string | undefined =>
  runtimeToken ?? process.env.OPENTEAM_AUTH_TOKEN ?? undefined
```

All existing auth logic (Bearer check, WS query param check) works
unchanged — they already call `getAuthToken()`.

### 3. Mobile PWA

A new `/mobile/*` route group in the existing React app. Same codebase,
same WebSocket client, same API layer — just different leaf components
optimized for touch and small screens.

**Key screens:**
- **Dashboard**: mission list grouped by status (running / waiting / done),
  each showing title, workspace, agent count, top phase, cost.
- **Mission Detail**: scrollable conversation view, message input bar,
  permission approval banner.
- **Quick Dispatch**: text prompt + workspace/agent selector → create and
  start a mission.

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| HTTP not HTTPS on LAN | Low | Trusted network; token in URL is one-time (stored in localStorage after first load); future: mDNS + self-signed cert |
| LAN IP changes after DHCP renewal | Low | Re-scan QR; most home/office DHCP leases are stable for hours/days |
| Multiple network interfaces → wrong IP in QR | Low | Prefer en0/wlan0; let user pick if ambiguous |
| Phone on different VLAN/subnet | Medium | Documented prerequisite: same network segment; future: tunnel upgrade path |

## Dependencies

- `qrcode` npm package (lightweight, for QR generation in desktop UI)
- No other new dependencies; mobile UI reuses React/Tailwind stack

## Sequencing

1. **Phase 1 — LAN Enable + QR** (~2 days): runtime token API, LAN IP
   detection, QR modal in Settings/Tray. At this point the existing
   desktop web UI already works from the phone.
2. **Phase 2 — Mobile PWA** (~5 days): `/mobile` route group with
   dashboard, mission detail, quick dispatch, mobile layout.
