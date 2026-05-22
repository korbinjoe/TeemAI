# Proposal: Upgrade Workspace UI v2 — Task-Centric Agent Workspace

## Summary

Implement the full interactive prototype (`workspace-interactive.html`) as the production OpenTeam UI. This builds upon and supersedes the existing `redesign-layout-agent-workspace` change by adding four major capabilities: **task-centric sidebar navigation**, **task group chat mode**, **IDE side panels (Files/Changes/War Room/Browser)**, and **agent orchestration UX (add/dispatch/handoff)**.

## Motivation

### Why the existing `redesign-layout-agent-workspace` proposal isn't enough

The existing proposal defines the layout shell (agent list panel + split workspace area + command palette), but the interactive prototype reveals a deeper paradigm shift:

1. **Task as the primary hierarchy** — The sidebar organizes by _Tasks_, not flat agents. Each task contains 1-N agents (lead + workers). This matches the real user mental model: "I dispatched a task, how's it going?" not "I spawned 4 agents, which one is which?"
2. **Group Chat / Task Overview** — Users need a task-level view that merges all agent outputs into a unified timeline with handoff arrows, error callouts, and @-targeted replies. The existing proposal has no concept of this.
3. **IDE Panels** — The workspace right panel isn't just "terminal output." It includes Files (workspace tree), Changes (git diff), War Room (shared context board), and Browser (live preview). These are core productivity surfaces.
4. **Agent Orchestration** — Adding agents mid-task, showing lead/worker hierarchy, auto-dispatch indicators, and handoff chains. This is the "team management" layer on top of raw agent sessions.

### User workflow this unlocks

```
User dispatches "Implement user auth" task
→ Lead (Fullstack) starts, auto-spawns Reviewer + Shield
→ User sees task in sidebar with 3 nested agents
→ Clicks task → Group Chat shows unified timeline
→ Sees Shield errored, clicks to 1:1 view
→ Switches to War Room tab, sees open question from Fullstack
→ Replies via @Fullstack in group chat
→ Opens quad view to monitor all 3 simultaneously
```

## Goals

- **G1**: Sidebar reflects task hierarchy: Task → Agents (nested, with status rollup)
- **G2**: Task Overview mode: group chat timeline + team topology + task timeline sidebar
- **G3**: IDE panels in workspace: Files, Changes, War Room, Browser as tabs
- **G4**: Agent orchestration: add agent mid-task, show lead/worker/auto roles
- **G5**: Status bar: running/waiting/error counts, branch, tokens, cost, time
- **G6**: Full keyboard shortcut system (Cmd+K, Cmd+\, Cmd+1-4, Cmd+N)

## Non-Goals

- Not redesigning the terminal/xterm rendering internals
- Not implementing the Browser panel's dev server integration (placeholder only)
- Not changing backend agent execution logic (UI-only change)
- Not implementing drag-to-split (use button controls only in v2)
- Not implementing "Classic Layout" toggle (ship new layout directly)

## Approach

### Layout Architecture (from interactive prototype)

```
┌──────────────────────────────────────────────────────────────────┐
│ WorkspaceLayout                                                   │
├──────────────┬───────────────────────────────────────────────────┤
│              │ Toolbar (agent/task info + layout controls)        │
│  Left Panel  ├───────────────────────────────────────────────────┤
│  (240px)     │                                                   │
│              │  Workspace Area                                   │
│  ┌────────┐  │  ┌───────────────────┬───────────────────────────┐│
│  │Pinned  │  │  │ Chat / Group Chat │ IDE Panel (tabs)          ││
│  │────────│  │  │                   │  Files|Changes|WarRoom|   ││
│  │Active  │  │  │                   │  Browser                  ││
│  │Tasks   │  │  │                   ├───────────────────────────┤│
│  │ ├ Agent│  │  │                   │ Terminal (collapsible)    ││
│  │ ├ Agent│  │  │                   │                           ││
│  │ └ +Add │  │  └───────────────────┴───────────────────────────┘│
│  │────────│  │                                                   │
│  │Done    │  ├───────────────────────────────────────────────────┤
│  └────────┘  │ Status Bar (stats, cost, time)                    │
│  [Actions]   │                                                   │
└──────────────┴───────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Task hierarchy in sidebar** — Tasks are expandable groups, agents are nested items. Agents show status dot, name, role badge (LEAD/auto), and duration.
2. **Dual view modes** — `agent` mode (1:1 with single agent) and `task-overview` mode (group chat for entire task). Toggle via clicking task name.
3. **IDE panel as tab system** — Right panel uses tabs: Files (workspace file tree), Changes (git status + inline diff), War Room (whiteboard entries), Browser (preview placeholder).
4. **Split pane applies to the entire workspace area** — In split mode, the left side is chat/group-chat, right side is IDE panels. In quad mode, each pane is a mini agent view.
5. **Status bar is always visible** — Shows aggregate task status, git branch, tool count, token usage, cost, elapsed time.

## Relationship to `redesign-layout-agent-workspace`

This change **supersedes** the previous proposal. It includes all of its scope (layout shell, agent list panel, split pane, command palette, status bar) but restructures the implementation around the task-centric model. The previous change's `tasks.md` should be marked as superseded.

## Risks

| Risk | Mitigation |
|------|-----------|
| Complexity of dual view modes (agent vs task-overview) | Share underlying chat components; task-overview is a compositor over same data |
| War Room tab requires whiteboard API integration | Already built — `wb-snapshot.sh` provides data; render as card list |
| Changes tab requires git integration | Existing `ChangesTab.tsx` + `FileChangeList.tsx` components can be reused |
| Group chat message ordering across agents | Use timestamp-based merge sort from existing JSONL data |
| Terminal resize in nested split panes | Debounce fit() at 100ms; reuse existing xterm resize patterns |

## Success Metrics

- Task-level monitoring enables user to assess 4-agent task status in < 3 seconds
- "Add Agent" feature used in > 30% of multi-agent tasks
- Group Chat preferred over 1:1 switching for tasks with 3+ agents
- IDE panels (especially Changes + War Room) viewed in > 50% of sessions
