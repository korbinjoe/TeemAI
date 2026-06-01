# Mobile Remote Access

Handles device pairing, per-device authentication, and session management
for mobile remote control of the desktop OpenTeam instance.

## ADDED Requirements

### REQ-PAIR-01: QR Code Pairing Flow

The system SHALL generate a QR code containing a pairing URL with a
one-time token, allowing a mobile phone to authenticate without manually
entering credentials.

#### Scenario: Generate pairing QR code

- **Given** tunnel is running at `https://abc123.trycloudflare.com`
- **When** `POST /api/tunnel/pair` is called
- **Then** the system returns `{ qrUrl: "https://abc123.trycloudflare.com/mobile?pair=<token>", pairingToken: "<token>", expiresAt: <timestamp> }`
  where the token is a 32-byte random hex string expiring in 5 minutes.

#### Scenario: Pairing token expiration

- **Given** a pairing token was generated 6 minutes ago
- **When** mobile calls `POST /api/tunnel/pair/exchange` with the expired token
- **Then** the system returns `401 { error: "Pairing token expired" }`.

#### Scenario: Pairing token is single-use

- **Given** a pairing token has already been exchanged for a session token
- **When** another device tries to exchange the same pairing token
- **Then** the system returns `401 { error: "Pairing token already used" }`.

### REQ-PAIR-02: Token Exchange

The mobile client SHALL exchange a valid one-time pairing token for a
long-lived session token via `POST /api/tunnel/pair/exchange`.

#### Scenario: Successful token exchange

- **Given** a valid, unexpired pairing token
- **When** mobile calls `POST /api/tunnel/pair/exchange` with
  `{ pairingToken, deviceName }`
- **Then** the system creates a `PairedDevice` record, returns
  `{ sessionToken: "<hex>", deviceId: "<uuid>" }`, and broadcasts
  `tunnel:device-connected` to desktop WebSocket clients.

### REQ-PAIR-03: Per-Device Session Tokens

The auth middleware SHALL accept per-device session tokens in addition to
the global `OPENTEAM_AUTH_TOKEN`, supporting per-device revocation.

#### Scenario: Mobile request with valid session token

- **Given** a paired device with session token "abc123"
- **When** mobile sends `GET /api/chats/recent` with
  `Authorization: Bearer abc123`
- **Then** the request is authorized and returns chat data.

#### Scenario: Revoked device token rejected

- **Given** device "phone-1" was revoked via `DELETE /api/tunnel/devices/phone-1`
- **When** the revoked device sends any API request with its old token
- **Then** the request returns `401 { error: "Device access revoked" }`.

### REQ-PAIR-04: Device Management

The desktop user SHALL be able to list connected devices and revoke access
for any paired device.

#### Scenario: List paired devices

- **Given** two devices are paired
- **When** `GET /api/tunnel/devices` is called
- **Then** response includes both devices with id, name, pairedAt,
  lastSeenAt fields.

#### Scenario: Revoke a device

- **Given** device "phone-1" is paired
- **When** `DELETE /api/tunnel/devices/phone-1` is called
- **Then** the device's session token is invalidated, the device record
  is marked as revoked, and `tunnel:device-disconnected` event is
  broadcast.

### REQ-PAIR-05: Pairing Rate Limiting

The pairing exchange endpoint SHALL be rate-limited to 5 attempts per
minute per IP to prevent brute-force attacks.

#### Scenario: Rate limit exceeded

- **Given** 5 failed pairing attempts from the same IP in 60 seconds
- **When** a 6th attempt is made
- **Then** the system returns `429 { error: "Too many pairing attempts" }`.

## MODIFIED Requirements

### REQ-AUTH-01: Auth Middleware Multi-Token Support

The existing auth middleware (`createAuthMiddleware`) SHALL be extended
to check both the global `OPENTEAM_AUTH_TOKEN` and per-device session
tokens from the `paired_devices` table.

#### Scenario: Global token still works

- **Given** `OPENTEAM_AUTH_TOKEN=global-token-123` is set
- **When** a request arrives with `Authorization: Bearer global-token-123`
- **Then** the request is authorized (existing behavior preserved).

#### Scenario: Paired device token works

- **Given** a device is paired with session token "device-token-456"
- **When** a request arrives with `Authorization: Bearer device-token-456`
- **Then** the request is authorized and the device's `lastSeenAt` is updated.
