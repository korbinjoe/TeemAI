# Spec: Task Navigation Sidebar

## Overview

The left sidebar replaces the existing `AppSidebar` (52px icon nav) with a 240px `TaskSidebar` that organizes sessions by task hierarchy: Pinned → Active Tasks (with nested agents) → Completed.

## ADDED Requirements

### Requirement: Task-centric session grouping

The sidebar MUST organize agent sessions into task groups. Each task is an expandable container that lists its member agents as nested items.

#### Scenario: User sees active tasks with nested agents

**Given** the user has 2 active tasks, one with 3 agents and one with 1 agent
**When** the sidebar renders
**Then** it shows an "Active Tasks" section header with count
**And** each task shows as an expandable row with: chevron, status dot (worst status from agents), task name, agent count badge
**And** expanding a task reveals its agents indented below

#### Scenario: Agent status rollup to task level

**Given** a task has agents with statuses [running, running, error]
**When** the sidebar renders the task row
**Then** the task's status dot shows red (error takes priority)
**And** priority order is: error > waiting > running > done

#### Scenario: Auto-dispatched agents show hierarchy indicators

**Given** Agent B was auto-dispatched by Agent A (handoff)
**When** the sidebar shows Agent B
**Then** it displays a "↳" prefix and vertical connector line from parent
**And** shows an "auto" badge in green

### Requirement: Urgency-sorted agent list

Active tasks MUST be sorted by urgency to surface attention-needed items first.

#### Scenario: Tasks with errors appear first

**Given** tasks with statuses: [running, error, done, waiting]
**When** the sidebar renders active tasks
**Then** the order is: error task, waiting task, running task
**And** done tasks appear in a separate "Completed" section

### Requirement: Pinned sessions

Users MUST be able to pin tasks for quick access. Pinned items appear in a dedicated section above active tasks.

#### Scenario: Pinned section renders above active tasks

**Given** the user has 2 pinned items
**When** the sidebar renders
**Then** a "Pinned" section with pin icon appears at the top
**And** each pinned item shows: pin icon, name, age label (e.g., "12d")

### Requirement: Sidebar collapse

The sidebar MUST support collapsing to a 52px icon-only mode.

#### Scenario: User collapses sidebar

**Given** the sidebar is expanded (240px)
**When** the user clicks the collapse button
**Then** the sidebar animates to 52px width in 200ms
**And** shows only agent status dots and expand button
**And** the workspace area expands to fill available space

### Requirement: Add Agent entry point

Each expanded task MUST show an "+ Add Agent" row at the bottom of its agent list.

#### Scenario: User clicks Add Agent

**Given** a task is expanded showing its agents
**When** the user clicks the "+ Add Agent" row
**Then** the AddAgentPicker overlay opens with the task ID pre-set

## Related Capabilities

- [workspace-area](../workspace-area/spec.md) — Sidebar selection drives workspace content
- [agent-orchestration](../agent-orchestration/spec.md) — Add Agent picker
