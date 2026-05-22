# Spec: Workspace Layout

## Capability: Agent-First Workspace Layout

The product layout shifts from a tab-based chat interface to an agent-centric workspace that surfaces all active sessions, their status, and enables parallel monitoring in a single view.

---

## ADDED Requirements

### Requirement: Agent List Panel as primary navigation

The system SHALL display a left panel listing all active and recent agent sessions sorted by urgency (error > waiting_input > running > idle > completed). Each session entry MUST show agent identity, status, current action, and elapsed time.

#### Scenario: User opens the app with 3 running agents

- **Given** 3 agent sessions are active (1 running, 1 waiting input, 1 error)
- **When** the app loads
- **Then** the Agent List Panel shows 3 entries sorted: error first, waiting second, running third
- **And** each entry displays: agent avatar, agent name, status badge with color, truncated current action, duration

#### Scenario: User collapses the Agent List Panel

- **Given** the Agent List Panel is expanded (240px)
- **When** the user clicks the collapse toggle or the window width drops below 1024px
- **Then** the panel collapses to 52px showing only agent avatars with status dot overlays
- **And** hovering an avatar shows a tooltip with agent name + status

#### Scenario: Agent status changes in real-time

- **Given** an agent is displayed as "running" in the list
- **When** the agent encounters an error
- **Then** the entry re-sorts to the top of the list
- **And** the status badge changes to red "ERROR"
- **And** the transition is animated (slide up, 200ms)

---

### Requirement: Workspace Area with split pane support

The system SHALL provide a right workspace area that displays one or more agent sessions simultaneously. It MUST support single, horizontal split (2-up), vertical split (over-under), and quad (2x2) layouts.

#### Scenario: User views a single agent

- **Given** the user clicks an agent in the list
- **When** no split pane is active
- **Then** the workspace area renders that agent's full terminal/chat content at 100% width and height
- **And** the terminal resizes correctly via fit addon

#### Scenario: User activates horizontal split

- **Given** one agent is displayed in the workspace
- **When** the user presses ⌘\ or clicks the split button
- **Then** the workspace divides into two equal horizontal panes
- **And** the left pane retains the current agent
- **And** the right pane shows a placeholder "Select an agent" or the next-most-urgent agent

#### Scenario: User drags an agent into workspace for split

- **Given** the workspace shows Agent A in single pane mode
- **When** the user drags Agent B from the list and drops it on the right half of the workspace
- **Then** the workspace splits horizontally
- **And** Agent A remains in the left pane, Agent B renders in the right pane

#### Scenario: Terminal resize on pane change

- **Given** 2 agents are displayed in horizontal split
- **When** the user drags the split divider to resize
- **Then** both terminals call `fit()` after a 100ms debounce
- **And** PTY sessions receive the updated dimensions via resize signal

---

### Requirement: Command Palette for universal access

The system SHALL provide a keyboard-triggered overlay (⌘K) that offers fuzzy search access to all application features, replacing the need for sidebar navigation icons.

#### Scenario: User opens command palette

- **Given** the user is anywhere in the application
- **When** they press ⌘K
- **Then** a centered overlay appears with a search input
- **And** default suggestions show: recent agents, quick actions (New Session, Settings)

#### Scenario: User searches for a workspace

- **Given** the command palette is open
- **When** the user types "openteam-web"
- **Then** matching workspaces appear in results under "Workspaces" category
- **And** selecting one navigates to that workspace detail page

#### Scenario: User jumps to a waiting agent

- **Given** Agent B is in "waiting_input" status
- **When** the user opens ⌘K and types the agent name
- **Then** the result shows "Agent B — Waiting for input: 'JWT or session?'"
- **And** selecting it focuses that agent's pane and scrolls to the question

---

### Requirement: Mission Control as workspace empty state

The system SHALL render the Mission Control dashboard inline in the workspace area when no agent is selected or all panes are closed, rather than requiring a separate route.

#### Scenario: App launches with no focused agent

- **Given** the user opens the app
- **When** no specific agent pane is focused
- **Then** the workspace area shows Mission Control: stats bar, attention alerts, active tasks, recent completions
- **And** clicking any task card in Mission Control focuses that agent in a workspace pane

#### Scenario: User closes the last pane

- **Given** one agent is displayed in the workspace
- **When** the user closes the pane (⌘W)
- **Then** the workspace transitions to Mission Control view
- **And** the agent list still shows all sessions

---

### Requirement: Aggregate Status Bar

The system SHALL display a persistent status bar at the bottom of the workspace that shows real-time aggregate metrics across all active sessions.

#### Scenario: Multiple agents are running

- **Given** 3 agents are running, 1 is waiting, 2 completed today
- **When** the status bar renders
- **Then** it displays: "3 running · 1 waiting · 2 done today · $0.42 · 12m total"
- **And** clicking any metric segment filters the agent list to that status

---

## MODIFIED Requirements

### Requirement: Layout mode toggle (backward compatibility)

The system SHALL allow users to switch between the new Workspace layout and the existing Classic (tab-based) layout via Settings.

#### Scenario: User prefers classic layout

- **Given** the user navigates to Settings > Appearance
- **When** they select "Classic (Tabs)" under Layout Mode
- **Then** the app renders the existing MainLayout with AppSidebar + ChatTabBar
- **And** no page reload is required (layout swap is client-side)

#### Scenario: New user gets workspace layout by default

- **Given** a user opens the app for the first time (no stored preference)
- **When** the app loads
- **Then** the Workspace layout is rendered by default
- **And** a one-time tooltip explains "Your agents are now managed from the left panel"

---

## REMOVED Requirements

### Requirement: Top-level sidebar navigation to separate pages

The icon sidebar navigation to separate pages (Workspaces, Skills, Cron Jobs) is removed from the primary UI. These features remain accessible via Command Palette (⌘K) and Settings.

#### Scenario: User wants to access Skills page

- **Given** the user is in Workspace layout
- **When** they press ⌘K and type "skills"
- **Then** "Skills" appears in command palette results under "Navigation"
- **And** selecting it opens the Skills page in the workspace area (replacing current pane content)
