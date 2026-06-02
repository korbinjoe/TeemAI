# LAN Access

Manages runtime auth token generation, LAN IP detection, and QR code
pairing for mobile remote access within the local network.

## ADDED Requirements

### REQ-LAN-01: Enable LAN Access

The system SHALL generate a random auth token and expose a QR-ready URL
containing the machine's LAN IP, server port, and token when the user
enables LAN access.

#### Scenario: Enable LAN access from Settings

- **Given** LAN access is disabled
- **When** the user clicks "Enable LAN Access" in the Settings page
- **Then** the system calls `POST /api/lan/enable`, receives
  `{ lanUrl: "http://192.168.1.100:13001/mobile?token=<hex>", token: "<hex>" }`,
  and displays the `lanUrl` as a QR code.

#### Scenario: Enable LAN access from Tray

- **Given** LAN access is disabled
- **When** the user clicks "Connect Mobile" in the Tray menu
- **Then** a window appears showing the QR code with the LAN URL.

### REQ-LAN-02: Disable LAN Access

The system SHALL clear the runtime auth token and immediately reject all
subsequent remote requests when LAN access is disabled.

#### Scenario: Disable LAN access

- **Given** LAN access is enabled with an active mobile connection
- **When** the user clicks "Disable LAN Access"
- **Then** the system calls `POST /api/lan/disable`, the runtime token is
  cleared, and all subsequent remote API/WS requests are rejected with 401.

#### Scenario: Server restart clears LAN access

- **Given** LAN access was enabled
- **When** the server restarts
- **Then** LAN access is disabled (token is in-memory only), and the
  phone must re-scan a new QR code.

### REQ-LAN-03: LAN IP Detection

The system SHALL detect the machine's primary LAN IPv4 address, preferring
well-known interface names (`en0`, `wlan0`, `eth0`), falling back to the
first non-internal IPv4 address.

#### Scenario: MacBook on Wi-Fi

- **Given** the machine has `en0` with IPv4 `192.168.1.100`
- **When** LAN access is enabled
- **Then** the QR URL uses `192.168.1.100` as the host.

#### Scenario: No network interface

- **Given** the machine has no non-internal IPv4 address
- **When** LAN access is enabled
- **Then** the system falls back to `127.0.0.1` and the QR code is still
  generated (usable for same-machine testing).

### REQ-LAN-04: QR Code Display

The desktop UI SHALL render a QR code encoding the full LAN URL, generated
client-side using the `qrcode` npm package.

#### Scenario: QR code in Settings page

- **Given** LAN access is enabled
- **When** the Settings page "Remote Control" section is visible
- **Then** a scannable QR code is displayed along with the text URL and
  a "Copy URL" button.

### REQ-LAN-05: LAN Status API

The system SHALL expose `GET /api/lan/status` returning whether LAN access
is enabled, the detected LAN IP, and the timestamp of enablement.

#### Scenario: Query LAN status while enabled

- **Given** LAN access was enabled at timestamp T
- **When** `GET /api/lan/status` is called from localhost
- **Then** response is `{ enabled: true, lanIp: "192.168.1.100", enabledAt: T }`.

## MODIFIED Requirements

### REQ-AUTH-01: Runtime Auth Token Support

The existing `getAuthToken()` function in `server/middleware/auth.ts`
SHALL be extended to check a runtime-set token in addition to the
`OPENTEAM_AUTH_TOKEN` environment variable, with runtime token taking
precedence.

#### Scenario: Runtime token set, no env var

- **Given** `setRuntimeAuthToken("abc123")` was called and
  `OPENTEAM_AUTH_TOKEN` is not set
- **When** a remote request arrives with `Authorization: Bearer abc123`
- **Then** the request is authorized.

#### Scenario: Both runtime token and env var set

- **Given** runtime token is "runtime-tok" and env var is "env-tok"
- **When** a request arrives with `Authorization: Bearer runtime-tok`
- **Then** the request is authorized (runtime takes precedence).

#### Scenario: Localhost bypass unchanged

- **Given** LAN access is disabled (no runtime token, no env var)
- **When** a request arrives from `127.0.0.1`
- **Then** the request is authorized without any token (existing behavior).
