# Mobile PWA

Mobile-optimized UI route group (`/mobile/*`) for remotely controlling
the desktop OpenTeam instance over LAN. Covers the pulse-mode loop:
glance at status, read output, approve permissions, send messages,
dispatch new missions.

## ADDED Requirements

### REQ-PWA-01: Mobile Dashboard

The mobile app SHALL display a dashboard listing all missions grouped by
status (running, waiting, done), each showing title, workspace name,
agent count, top phase, tool progress, and cost.

#### Scenario: View running missions

- **Given** 2 missions are running and 1 is completed
- **When** the user opens `/mobile`
- **Then** running missions appear at the top with live phase indicators,
  followed by completed missions in a muted style.

#### Scenario: Live status updates

- **Given** the dashboard is open
- **When** a `chat:activity` WebSocket event arrives for a mission
- **Then** the mission card updates its phase, tool progress, and cost
  in real-time without page reload.

### REQ-PWA-02: Mission Detail View

The mobile app SHALL display a mission's conversation as a scrollable
message list with an input bar for sending follow-up messages.

#### Scenario: Read agent conversation

- **Given** a mission with agent messages
- **When** the user navigates to `/mobile/mission/:id`
- **Then** messages are displayed chronologically with agent name, icon,
  and formatted text content.

#### Scenario: Send a follow-up message

- **Given** mission detail is open for a running mission
- **When** the user types a message and taps send
- **Then** the message is sent via `expert:direct-input` WebSocket event
  and appears in the conversation.

### REQ-PWA-03: Permission Approval

The mobile app SHALL display pending permission requests as a prominent
banner and allow the user to approve or reject them.

#### Scenario: Permission request arrives

- **Given** the dashboard or mission detail is open
- **When** a `chat:permission-request` event arrives
- **Then** a banner appears showing the tool call title and
  approve/reject buttons.

#### Scenario: Approve permission

- **Given** a permission banner is showing
- **When** the user taps "Allow"
- **Then** an `expert:permission-response` event is sent with the
  appropriate `optionId`, and the banner dismisses.

### REQ-PWA-04: Quick Dispatch

The mobile app SHALL provide a form to create a new mission with a text
prompt, workspace selector, and optional agent selector.

#### Scenario: Dispatch a new mission

- **Given** the user opens `/mobile/dispatch`
- **When** they enter a prompt, select a workspace, and tap "Go"
- **Then** a new chat is created via `POST /api/workspaces/:id/chats`,
  an agent is started via `expert:direct-input`, and the user is
  navigated to the mission detail view.

### REQ-PWA-05: Mobile Auth from QR

When the mobile app is opened via a QR link, it SHALL extract the auth
token from the URL, store it in localStorage, strip it from the URL bar,
and use it for all subsequent API and WebSocket requests.

#### Scenario: First open via QR scan

- **Given** the user scans a QR code containing
  `http://192.168.1.100:13001/mobile?token=abc123`
- **When** the page loads
- **Then** the token is stored in localStorage, the URL is rewritten to
  `/mobile` (no token visible), and the dashboard loads with
  authenticated data.

#### Scenario: Subsequent visit

- **Given** a token exists in localStorage
- **When** the user opens `/mobile` without a URL token
- **Then** the stored token is used for authentication and the dashboard
  loads normally.

#### Scenario: Invalid or revoked token

- **Given** the stored token is no longer valid (LAN access was disabled)
- **When** any API call returns 401
- **Then** the mobile app clears the stored token and shows a
  "Connection lost — scan QR code again" message.

### REQ-PWA-06: Connection Status Indicator

The mobile app SHALL show a persistent connection indicator and
gracefully handle WebSocket disconnects.

#### Scenario: WebSocket disconnects

- **Given** the mobile app is connected
- **When** the WebSocket connection drops
- **Then** the status bar shows "Reconnecting..." and the client
  auto-reconnects with exponential backoff (existing `WebSocketClient`
  behavior).

#### Scenario: Connected state

- **Given** WebSocket is open
- **When** the user views any mobile screen
- **Then** a green indicator shows the connected machine name or IP.

### REQ-PWA-07: Mobile-Optimized Layout

The mobile app SHALL render a touch-friendly layout with a bottom
tab navigation bar, optimized for screens under 430px wide.

#### Scenario: Bottom navigation

- **Given** the mobile app is open
- **When** the user views any screen
- **Then** a bottom tab bar shows two tabs: "Missions" (dashboard) and
  "New" (quick dispatch), with the active tab highlighted.

#### Scenario: Responsive sizing

- **Given** the mobile app is open on an iPhone SE (375px wide)
- **When** the dashboard renders
- **Then** mission cards fill the width with appropriate padding, text
  is readable, and touch targets are at least 44px.
