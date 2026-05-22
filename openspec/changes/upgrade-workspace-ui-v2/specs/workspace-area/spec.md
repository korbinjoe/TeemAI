# Spec: Workspace Area

## Overview

The main content area occupying the right portion of the layout. Supports multiple view modes (agent 1:1 vs task overview) and layout modes (single/split/quad). Always flanked by a top toolbar and bottom status bar.

## ADDED Requirements

### Requirement: Dual view modes

The workspace area MUST support two view modes: `agent` (1:1 chat with a single agent) and `task-overview` (group chat aggregating all agents in a task).

#### Scenario: User selects an agent from sidebar

**Given** the user clicks an agent item in the sidebar
**When** the workspace renders
**Then** viewMode is set to 'agent'
**And** the toolbar shows: agent status dot + agent name + "in" task link + sibling agent dots
**And** the content shows that agent's chat messages + input

#### Scenario: User clicks a task name to open overview

**Given** the user clicks a task name (not the expand chevron)
**When** the workspace renders
**Then** viewMode is set to 'task-overview'
**And** the toolbar shows: group icon + "Task Chat" + "GROUP" badge + task name
**And** the content shows the task overview layout

### Requirement: Three layout modes

The workspace MUST support three layout configurations, togglable via toolbar controls and keyboard shortcut (⌘\).

#### Scenario: Single layout mode (agent view)

**Given** layoutMode='single' and viewMode='agent'
**When** the workspace renders
**Then** the full width shows ChatPane: scrollable message log + bottom input + stop button

#### Scenario: Split layout mode (agent view)

**Given** layoutMode='split' and viewMode='agent'
**When** the workspace renders
**Then** left 44% shows ChatPane
**And** right 56% shows IDEPanel (tab bar + content + collapsible terminal)
**And** a 1px border separates the two zones

#### Scenario: Quad layout mode

**Given** layoutMode='quad'
**When** the workspace renders
**Then** a 2×2 CSS Grid fills the content area
**And** each cell shows a MiniAgentPane (compact header + last 4 log entries)
**And** clicking a pane header selects that agent

#### Scenario: Keyboard shortcut cycles layout

**Given** the user presses ⌘\
**When** the current layoutMode is 'single'
**Then** it cycles to 'split'
**And** pressing again cycles to 'quad', then back to 'single'

### Requirement: Workspace toolbar

A 38px toolbar MUST appear at the top of the workspace area showing context info and layout controls.

#### Scenario: Toolbar in agent mode

**Given** viewMode='agent' and selected agent is "Designer" in task "Redesign settings page"
**When** toolbar renders
**Then** it shows: [pulsing status dot] "Designer" "in" [clickable task name] [sibling agent dots cluster]
**And** right side shows layout controls + "⌘\" hint

#### Scenario: Sibling agent dots in toolbar

**Given** the selected agent has 2 sibling agents (same task)
**When** toolbar renders
**Then** a small cluster shows colored dots for each sibling's status
**And** clicking a dot switches to that agent
**And** a "+2" label indicates sibling count

### Requirement: Workspace status bar

A 28px monospace status bar MUST appear at the bottom showing aggregate runtime stats.

#### Scenario: Status bar shows live stats

**Given** 2 agents running, 1 waiting, 1 error
**When** the status bar renders
**Then** it shows: [pulse dot] "2 running" | [yellow dot] "1 waiting" | [red dot] "1 error" | branch name | "14/21 tools" | "42.1K tokens" | "$0.42" | "12m 34s"
**And** each section is separated by a 1px vertical divider
**And** running count dot pulses

### Requirement: Terminal section in IDE panel

The IDE panel MUST include a collapsible terminal section at the bottom.

#### Scenario: Terminal collapse/expand

**Given** the terminal section is open (120px)
**When** the user clicks the terminal header
**Then** it collapses to 26px (header only) with chevron rotation animation
**And** clicking again expands back to 120px
**And** terminal content shows monospace output with green prompt indicator

## Related Capabilities

- [task-navigation](../task-navigation/spec.md) — Sidebar drives agent/task selection
- [ide-panels](../ide-panels/spec.md) — Tab content within IDE panel
- [agent-orchestration](../agent-orchestration/spec.md) — Task overview group chat
