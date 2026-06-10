# Capability: Browser Bridge Primitives

Extension-side browser automation primitives invoked by the bridge handler. Platform business logic MUST NOT live in this layer.

## ADDED Requirements

### Requirement: Navigate primitive

The extension SHALL implement a `navigate` method that loads a URL in the active or newly focused tab, using same-origin `window.location.href` when the tab is already on the target platform domain.

#### Scenario: Cross-domain navigation

- **WHEN** bridge receives `navigate` with `url: "https://www.xiaohongshu.com/explore"`
- **THEN** extension activates or creates a tab and loads the URL
- **AND** returns `{ "result": null }` after navigation initiates

#### Scenario: Same-origin navigation

- **WHEN** current tab is on `xiaohongshu.com` and navigate target is also on `xiaohongshu.com`
- **THEN** extension sets `window.location.href` via MAIN world script instead of `chrome.tabs.update` cross-site navigation

---

### Requirement: JavaScript evaluation primitive

The extension SHALL implement `evaluate` that runs JavaScript in the page MAIN world via `chrome.scripting.executeScript` and returns the serialized result.

#### Scenario: Read page state

- **WHEN** CLI sends `evaluate` with expression reading `window.__INITIAL_STATE__`
- **THEN** extension executes in MAIN world
- **AND** returns the JSON-serializable result to bridge

---

### Requirement: DOM interaction primitives

The extension SHALL implement `has_element`, `wait_for_selector`, `click_element`, `input_text`, and `input_content_editable` methods operating on CSS selectors in the active tab.

#### Scenario: Wait for selector

- **WHEN** CLI sends `wait_for_selector` with a selector and timeout
- **THEN** extension polls until element exists or timeout
- **AND** returns boolean found status

#### Scenario: Contenteditable input

- **WHEN** CLI sends `input_content_editable` with selector and text
- **THEN** extension inserts text using editor-compatible APIs (e.g. `document.execCommand("insertText")`)
- **AND** triggers input events recognized by the page framework

---

### Requirement: Trusted input via debugger

The extension SHALL implement debugger-backed click and text insertion for critical UI actions when `useTrusted: true` is specified in params, producing `isTrusted: true` events.

#### Scenario: Trusted click on publish button

- **WHEN** CLI sends `click_element` with `useTrusted: true`
- **THEN** extension attaches debugger to tab
- **AND** dispatches `Input.dispatchMouseEvent` at element coordinates
- **AND** detaches debugger after action

---

### Requirement: File upload primitive

The extension SHALL implement `set_file_input` using debugger `DOM.setFileInputFiles` with local absolute file paths provided by CLI.

#### Scenario: Upload images to publish form

- **WHEN** CLI sends `set_file_input` with selector and `files: ["/abs/path/a.jpg"]`
- **THEN** extension sets files on the matched input element
- **AND** returns success

---

### Requirement: Platform diagnostics primitives

The extension SHALL implement `get_404_diagnostics` and `analyze_risk_control` for Xiaohongshu-style redirect and fingerprint detection, backed by request interceptors where installed.

#### Scenario: 404 after navigation

- **WHEN** page lands on platform 404 URL after navigate
- **THEN** CLI can call `get_404_diagnostics` and receive captured 302 chain and error codes
- **AND** extension MAY attempt automatic xsec_token refresh when error codes indicate token expiry

---

### Requirement: Autonomous mode gate

When `controlMode` setting is `teemai`, the extension autonomous scheduler MUST NOT execute post, reply, or upvote actions; bridge primitives MUST remain available.

#### Scenario: TeemAI control active

- **WHEN** `controlMode` is `teemai`
- **THEN** alarm-scheduled social actions are suppressed
- **AND** bridge-handler continues processing CLI-forwarded commands
