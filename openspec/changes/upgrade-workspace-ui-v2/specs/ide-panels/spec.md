# Spec: IDE Panels

## Overview

The right side of the split layout contains an IDE-like panel with tabbed content: Files, Changes, War Room, and Browser. Each tab provides a different productivity surface for monitoring and reviewing agent work.

## ADDED Requirements

### Requirement: IDE tab bar

The IDE panel MUST have a tab bar at the top allowing switching between four content views.

#### Scenario: Tab bar renders with active indicator

**Given** the IDE panel is visible (split or task-split layout)
**When** it renders
**Then** a 32px tab bar shows: Files, Changes, War Room, Browser
**And** the active tab has accent color text and subtle background highlight
**And** Changes tab shows a green badge with file count (e.g., "5")
**And** right-aligned workspace name in muted monospace

#### Scenario: User switches tabs

**Given** the Changes tab is active
**When** the user clicks "War Room"
**Then** the tab content area switches to War Room content
**And** "War Room" tab becomes active (highlighted)
**And** previous tab content unmounts (lazy rendering)

### Requirement: Files tab

Display the workspace file tree with file status indicators (new/modified).

#### Scenario: Files tab shows workspace tree

**Given** the Files tab is active
**When** it renders
**Then** it shows a hierarchical file tree with folder/file icons
**And** new files are marked in green with "new" label
**And** modified files are marked in yellow with "modified" label
**And** the tree reflects the workspace directory of the selected agent/task

### Requirement: Changes tab

Show git changes (unstaged files) with inline diff preview.

#### Scenario: Changes tab shows file list with diff stats

**Given** the Changes tab is active and 5 files have changes
**When** it renders
**Then** header shows: "Unstaged Changes" title + green file count badge + "Stage All" button + "Commit" button
**And** file list shows each file with: status letter (A=added green, M=modified yellow), file path, diff stats (+X -Y)
**And** first file row has subtle active background

#### Scenario: Inline diff preview for selected file

**Given** the user clicks a file in the changes list
**When** the detail area renders
**Then** it shows an inline diff: file path header, removed lines (red background), added lines (green background)
**And** uses monospace font at 10px

### Requirement: War Room tab

Display shared context entries from the whiteboard (decisions, open questions, constraints).

#### Scenario: War Room shows whiteboard entries

**Given** the War Room tab is active
**When** it renders
**Then** it fetches data from the whiteboard API (wb-snapshot)
**And** shows entries as cards with: type label (colored), content text, "by Agent · Xm ago" attribution
**And** DECISION entries have accent color label
**And** OPEN QUESTION entries have yellow color label
**And** CONSTRAINT entries have red color label and red border

#### Scenario: War Room shows team bar for multi-agent tasks

**Given** the current task has multiple agents
**When** War Room tab renders
**Then** a team chip bar appears at the top showing all task agents
**And** each chip shows: status dot + agent name
**And** the currently selected agent's chip has an accent border
**And** clicking a chip switches to that agent

### Requirement: Browser tab

Provide a placeholder for live preview with a "Start Dev Server" button.

#### Scenario: Browser tab empty state

**Given** no dev server is running
**When** the Browser tab renders
**Then** it shows centered: globe icon (32px), "No preview running" text, "Start dev server to see live preview" subtitle, "Start Dev Server" button with accent styling

## Related Capabilities

- [workspace-area](../workspace-area/spec.md) — IDE panel is rendered within split layout mode
- [task-navigation](../task-navigation/spec.md) — War Room tab uses task context for team display
