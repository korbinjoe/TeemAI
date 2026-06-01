# Add Mobile Remote Control

## Summary

Enable the user to control their desktop OpenTeam instance from a mobile
phone browser. The phone connects through a relay tunnel that the desktop
app exposes, authenticates via a QR code pairing flow, and renders a
mobile-optimized PWA that covers the core pulse-mode loop: view running
missions, read agent output, send messages / approve permissions, and
dispatch new missions.

## Why

OpenTeam's design principle is **pulse-mode**: batch-dispatch tasks, leave,
come back to batch-review. Today "leave" means leaving the desktop — but
the user still wants to **glance** at mission status from their phone
(commute, meeting, coffee). When an agent hits a permission prompt or
needs user input, the user is blocked until they return to the desktop.

The infrastructure is almost ready:
- `server/middleware/auth.ts` already supports remote access via
  `OPENTEAM_AUTH_TOKEN` Bearer token for both HTTP and WebSocket.
- `web/config/api.ts` already reads `?token=` from URL params and injects
  Bearer headers via `authFetch()` / WS query string.
- All mission state flows through a single WebSocket protocol
  (`shared/ws-types.ts`) and REST API (`/api/chats/*`, `/api/workspaces/*`).
- The Electron tray already consumes `chat:activity` events for live status.

What's missing: (1) a way for the phone to reach the desktop server
through NAT, (2) a pairing UX that doesn't require typing a token, and
(3) a mobile-optimized UI surface.

## Goals

- **Zero-config connectivity**: user scans a QR code on the desktop app,
  phone connects immediately. No port-forwarding, no manual token entry.
- **Pulse-mode on mobile**: view all running missions with live status,
  read the latest agent message, approve/reject permission requests,
  send follow-up messages to agents.
- **Secure by default**: end-to-end encrypted tunnel, short-lived pairing
  tokens, explicit device authorization on desktop side.
- **PWA installable**: mobile user can add to home screen for app-like
  experience. Offline shows last-known state.
- **Cost & battery aware**: mobile UI is read-heavy, minimal polling.
  WebSocket push for live updates, no background polling drain.

## Non-Goals

- Full desktop parity on mobile (no terminal, no file tree, no code editor).
- Multi-user / team access — this is single-user remote control of their
  own machine.
- Native mobile app (iOS/Android) — PWA first; native can come later.
- Running agents on the phone — the phone is a thin remote; all compute
  stays on the desktop.

## Approach

### 1. Relay Tunnel (Desktop → Public Endpoint)

Use Cloudflare Tunnel (`cloudflared`) or a lightweight custom relay to
expose the local OpenTeam server at a public HTTPS URL. This is the same
pattern used by VS Code Remote Tunnels and Tailscale Funnel.

**Recommended: Cloudflare Tunnel (Quick Tunnel mode)**
- `cloudflared tunnel --url http://localhost:<port>` gives a
  `https://<random>.trycloudflare.com` URL, no account needed.
- Supports WebSocket out of the box.
- Free for personal use.
- Desktop app manages the tunnel lifecycle (start on demand, stop when
  no mobile devices connected).

**Fallback: Custom relay**
- A lightweight WebSocket relay server (hosted or self-hosted) that both
  desktop and mobile connect to. More control, but requires running
  infrastructure.

### 2. QR Code Pairing

1. User clicks "Connect Mobile" in desktop app (tray menu or settings).
2. Desktop generates a short-lived pairing URL:
   `https://<tunnel-url>?token=<one-time-token>&pair=1`
3. Displayed as a QR code in a native dialog.
4. Phone scans QR → opens the mobile PWA at the tunnel URL.
5. The one-time token is exchanged for a longer-lived session token stored
   in the phone's localStorage.
6. Desktop shows a "Mobile connected" indicator; phone shows "Connected to
   <machine-name>".

### 3. Mobile PWA

A new route group in the existing React app (`/mobile/*`) that renders a
mobile-optimized UI. Same React codebase, same WebSocket client, same API
layer — just different components optimized for touch and small screens.

**Key screens:**
- **Dashboard**: list of all missions grouped by status (running / waiting /
  done), each showing title, workspace, agent count, top phase, cost.
- **Mission Detail**: scrollable agent output (conversation view), action
  bar for sending messages, permission approval banner.
- **Quick Dispatch**: simple form to create a new mission with a text
  prompt and workspace/agent selector.
- **Notifications**: permission requests and agent completion events pushed
  via WebSocket, surfaced as mobile notifications (via Notification API
  or Push API).

### 4. Authentication & Security

- Tunnel URL is random and unguessable (36-char Cloudflare hash).
- Pairing token is one-time, expires in 5 minutes.
- Session token has configurable TTL (default 7 days), revocable from
  desktop.
- All traffic over HTTPS/WSS through Cloudflare edge.
- Desktop shows connected devices and can revoke access.

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Cloudflare Quick Tunnel URL changes on restart | Medium | Persist tunnel ID or use named tunnel with free account; mobile auto-reconnects |
| Tunnel latency adds to agent interaction | Low | WebSocket is persistent; latency only affects initial connect |
| Cloudflare service outage blocks mobile access | Low | Fallback to direct LAN access when on same network; non-critical path |
| Security: tunnel exposes server to internet | High | Auth token required for all API/WS; tunnel only runs when explicitly enabled; auto-stop after idle timeout |
| PWA limitations on iOS (no persistent push) | Medium | Use WebSocket-based in-app notifications; suggest keep-tab-open; consider native wrapper later |

## Dependencies

- `cloudflared` binary (can be auto-downloaded, ~30MB)
- No new npm runtime dependencies for the server (tunnel is a child process)
- Mobile UI reuses existing React/Tailwind stack

## Sequencing

1. **Phase 1 — Relay Tunnel + Pairing** (server + desktop): expose tunnel,
   QR pairing, device management. Desktop web UI already works over tunnel.
2. **Phase 2 — Mobile PWA** (frontend): mobile-optimized route group with
   dashboard, mission detail, quick dispatch.
3. **Phase 3 — Push Notifications** (server + frontend): WebSocket-driven
   mobile notifications for permission requests and mission completion.
