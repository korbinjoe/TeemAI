# Spec: Agent Orchestration UX

## Overview

UI capabilities for managing agents within a task: viewing team topology, adding agents mid-task, group chat interaction, and the command palette for global navigation.

## ADDED Requirements

### Requirement: Task Overview with Group Chat

When viewing a task (not a single agent), the workspace MUST show a merged timeline of all agent activities.

#### Scenario: Group chat shows interleaved messages

**Given** a task has 3 agents (Fullstack, Reviewer, Shield) with concurrent activity
**When** the task overview renders
**Then** messages from all agents are merged into a single timeline sorted by timestamp
**And** each message shows the agent avatar (first letter, colored by role), agent name, and content
**And** message types rendered: system (centered pill), handoff (blue arrow banner), start (join indicator), text (bubble), tool-call (indented ⚡), done (indented ✓), error (red card), waiting (yellow card with action buttons), progress (pulsing dot)

#### Scenario: Waiting messages show action buttons

**Given** Agent Fullstack has a "waiting" message asking "JWT or session auth?"
**When** it renders in the group chat
**Then** it shows: yellow-bordered card with agent name + "needs your input" label + question text + "Reply" button + "Open 1:1" button
**And** clicking "Open 1:1" switches viewMode to 'agent' for that agent
**And** clicking "Reply" focuses the group chat input with @Fullstack pre-selected

#### Scenario: Error messages show error card

**Given** Agent Shield has an error "Permission denied: daemon.json"
**When** it renders in the group chat
**Then** it shows: red-bordered card with agent avatar + agent name + "✗" prefix + error text

### Requirement: Group Chat input with @agent targeting

The group chat input MUST allow targeting a specific agent in the task.

#### Scenario: Input targets one agent at a time

**Given** the task has agents [Fullstack, Reviewer, Shield]
**When** the group chat input renders
**Then** it shows: [@Fullstack] button (accent colored) + text input + send hint + stop button
**And** the placeholder reads "Message Fullstack..."

#### Scenario: User cycles target agent

**Given** the current target is @Fullstack
**When** the user clicks the @Fullstack button
**Then** it cycles to @Reviewer
**And** clicking again cycles to @Shield, then back to @Fullstack

### Requirement: Task Info Sidebar in overview mode

When in task overview (single layout), a 200px info panel MUST appear on the left.

#### Scenario: Task info sidebar shows goal and team

**Given** task overview is active for "Implement user auth flow"
**When** the info sidebar renders
**Then** it shows sections: Goal (task description + workspace label), Team (lead agent highlighted + worker agents with hierarchy + "Add Agent" row), Timeline (vertical event list), Actions ("Cancel Task" button)

#### Scenario: Team section shows topology

**Given** task has lead=Fullstack, workers=[Reviewer (auto), Shield (auto)]
**When** the team section renders
**Then** Fullstack shows with LEAD badge and purple tint
**And** workers show below with vertical connector line, "↳" prefix, and "auto" badge
**And** clicking an agent name switches to that agent's 1:1 view

#### Scenario: Timeline shows task history

**Given** the task has 6 timeline events
**When** the timeline section renders
**Then** it shows a vertical list with: colored dot (by event type) + event text + timestamp
**And** dots connected by vertical lines between events
**And** colors: user=muted, start=muted, handoff=accent, error=red, waiting=yellow, done=green

### Requirement: Add Agent Picker

A modal overlay MUST allow adding a new agent to an existing task.

#### Scenario: Add Agent picker shows available agent types

**Given** the user clicks "+ Add Agent" on a task
**When** the picker opens
**Then** it shows: header (title + task name), instruction input (optional), scrollable agent type list
**And** each agent type row shows: icon square (28px, first letter), name, description, arrow icon
**And** footer shows: "Agent will inherit task context" hint + Cancel button

#### Scenario: User selects agent type with instruction

**Given** the picker is open with instruction "Review auth code for XSS vulnerabilities"
**When** the user clicks "Code Reviewer" agent type
**Then** a new agent is dispatched to the task with the instruction
**And** the picker closes
**And** the new agent appears in the sidebar under the task
**And** the view switches to the new agent's 1:1 chat

### Requirement: Command Palette

A global ⌘K overlay MUST provide quick access to agents, actions, and navigation.

#### Scenario: Command palette opens and searches

**Given** the user presses ⌘K
**When** the palette opens
**Then** it shows: dark scrim (60% opacity) + centered 520px dialog + search input (auto-focused) + categorized results
**And** results include: "Active Tasks" section (agents nested under tasks), "Actions" section (New Task ⌘N, Settings ⌘,)
**And** typing in search input filters results by fuzzy match

#### Scenario: Selecting a result navigates

**Given** the palette is open showing Agent "Designer" in results
**When** the user clicks "Designer"
**Then** the palette closes
**And** the agent "Designer" is selected in the sidebar
**And** the workspace shows that agent's content

#### Scenario: Escape closes palette

**Given** the command palette is open
**When** the user presses Escape
**Then** the palette closes without navigation change

### Requirement: Keyboard shortcuts

The workspace MUST support a standard set of keyboard shortcuts.

#### Scenario: Full shortcut map

**Given** the workspace is active
**Then** the following shortcuts are supported:
- ⌘K: Open command palette
- ⌘\: Cycle layout mode (single → split → quad → single)
- ⌘1-4: Select agent by index (sidebar order)
- ⌘N: Create new task
- Escape: Close any open overlay

## Related Capabilities

- [task-navigation](../task-navigation/spec.md) — Sidebar provides entry points for task overview and add agent
- [workspace-area](../workspace-area/spec.md) — Group chat renders within workspace content area
- [ide-panels](../ide-panels/spec.md) — War Room tab complements group chat view
