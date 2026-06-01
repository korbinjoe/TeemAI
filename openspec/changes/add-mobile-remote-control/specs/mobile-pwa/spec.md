# Mobile PWA

Mobile-optimized Progressive Web App for remotely controlling the desktop
OpenTeam instance. Covers the pulse-mode loop: glance at status, read
output, approve permissions, send messages, dispatch new missions.

## ADDED Requirements

### REQ-PWA-01: Mobile Dashboard

The mobile app SHALL display a dashboard listing all missions grouped by
status (running, waiting, done), each showing title, workspace name,
agent count, top phase, tool progress, and cost.

#### Scenario: View running missions

- **Given** 2 missions are running and 1 is completed
- **When** the user opens the mobile dashboard
- **Then** the running missions appear at the top with live phase
  indicators, followed by the completed mission in a muted style.

#### Scenario: Live status updates

- **Given** the dashboard is open
- **When** a `chat:activity` WebSocket event arrives for a mission
- **Then** the mission card updates its phase, tool progress, and cost
  in real-time without full page reload.

### REQ-PWA-02: Mission Detail View

The mobile app SHALL display a mission's conversation as a scrollable
message list showing agent output, with an input bar for sending
follow-up messages.

#### Scenario: Read agent conversation

- **Given** a mission with 3 agent messages
- **When** the user navigates to `/mobile/mission/:id`
- **Then** the messages are displayed in chronological order with agent
  name, icon, and formatted text content.

#### Scenario: Send a follow-up message

- **Given** a mission detail view is open
- **When** the user types a message and taps send
- **Then** the message is sent via `expert:direct-input` WebSocket event
  and appears in the conversation.

### REQ-PWA-03: Permission Approval

The mobile app SHALL display pending permission requests as a prominent
banner and allow the user to approve or reject them.

#### Scenario: Permission request arrives

- **Given** the dashboard or mission detail is open
- **When** a `chat:permission-request` event arrives
- **Then** a banner appears showing the tool call details and
  approve/reject buttons.

#### Scenario: Approve permission

- **Given** a permission banner is showing
- **When** the user taps "Allow"
- **Then** an `expert:permission-response` event is sent with
  `outcome: "selected"` and the appropriate `optionId`, and the banner
  dismisses.

### REQ-PWA-04: Quick Dispatch

The mobile app SHALL provide a form to create a new mission with a text
prompt, workspace selector, and optional agent selector.

#### Scenario: Dispatch a new mission

- **Given** the user opens `/mobile/dispatch`
- **When** they enter a prompt, select a workspace, and tap "Go"
- **Then** a new chat is created via `POST /api/workspaces/:id/chats`
  and an agent is started via `expert:direct-input`, and the user is
  navigated to the mission detail view.

### REQ-PWA-05: PWA Installable

The mobile app SHALL include a Web App Manifest and service worker
enabling "Add to Home Screen" on iOS and Android.

#### Scenario: Install on iOS

- **Given** the user visits `/mobile` in Safari on iOS
- **When** they tap "Share → Add to Home Screen"
- **Then** the app appears as a standalone icon on the home screen,
  opens without Safari chrome, and uses the OpenTeam icon and theme.

### REQ-PWA-06: Mobile Notification Center

The mobile app SHALL display a notification center showing recent events:
permission requests, mission completions, and agent errors.

#### Scenario: Mission completed while on dashboard

- **Given** the dashboard is open
- **When** a mission's status changes to `done`
- **Then** a brief toast notification appears and the mission card moves
  to the "done" section.

### REQ-PWA-07: Pairing Handshake Screen

When the mobile app is opened via a QR pairing link, it SHALL display
a pairing screen that exchanges the one-time token for a session token
and transitions to the dashboard.

#### Scenario: First-time pairing via QR

- **Given** the user scans a QR code and opens
  `https://<tunnel>/mobile?pair=<token>`
- **When** the page loads
- **Then** the pairing screen shows "Connecting to <machine-name>...",
  exchanges the token, stores the session token, and navigates to the
  dashboard.

#### Scenario: Already paired

- **Given** the user has a valid session token in localStorage
- **When** they open `/mobile`
- **Then** they go directly to the dashboard without re-pairing.

### REQ-PWA-08: Connection Status Indicator

The mobile app SHALL show a persistent connection indicator (connected /
reconnecting / disconnected) and gracefully handle WebSocket drops.

#### Scenario: WebSocket disconnects

- **Given** the mobile app is connected
- **When** the WebSocket connection drops
- **Then** the status bar shows "Reconnecting..." and the client
  auto-reconnects with exponential backoff (existing `WebSocketClient`
  behavior).
