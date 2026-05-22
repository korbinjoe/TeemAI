# Proposal: Redesign Layout — Agent Workspace

## Summary

Restructure OpenTeam's overall product layout from a "tab-based chat interface" to an "Agent-first workspace" inspired by Cursor 3's Agents Window paradigm. The current layout treats agents as individual chat tabs; the new layout treats agents as parallel workers in a unified command center.

## Motivation

### Current Pain Points

1. **Tab bar doesn't scale** — When 5+ agents run in parallel, the tab bar becomes a flat, indistinguishable row. Users must click each tab to understand what's happening.
2. **No overview without navigation** — Users must visit Mission Control (a separate page) to see aggregate status, then switch back to individual tabs to act. This breaks the "return and review" workflow.
3. **Layout is chat-centric, not agent-centric** — The current layout (sidebar + tab bar + chat content) mirrors a traditional messaging app. But OpenTeam's core loop is "dispatch → monitor → review," which demands a different spatial model.
4. **Wasted screen real estate** — The narrow icon sidebar + full-width chat leaves no room for agent list + workspace split views.

### Cursor 3 Agents Window: Key Patterns to Adopt

| Pattern | Cursor Implementation | OpenTeam Adaptation |
|---------|----------------------|---------------------|
| Agent List Sidebar | Left panel lists all running agents with status | Left panel: live agent sessions with status badges, sorted by urgency |
| Workspace Panel | Right panel shows selected agent's output | Right panel: active agent's terminal/chat with full interaction |
| Multi-pane Split | Side-by-side or grid view of multiple agents | Split view: 2-up or quad view for parallel monitoring |
| Status at a Glance | Each agent shows state (thinking/coding/waiting/done) | Each agent card shows status + current action + duration |
| Agent as Primary Unit | Not tabs, but persistent workspace entries | Sessions persist as workspace items, not ephemeral tabs |

## Goals

- **G1**: Users see all active agents and their status in one glance without navigating between pages
- **G2**: Reduce "time to act" — from seeing a blocked agent to responding — to under 2 seconds (currently requires: notice tab badge → click tab → scroll to question)
- **G3**: Support monitoring 4+ parallel agents simultaneously via split pane
- **G4**: Maintain backward compatibility — existing chat interaction model unchanged, only the chrome around it evolves
- **G5**: Mission Control data (stats, attention alerts) integrates directly into the workspace layout, not a separate page

## Non-Goals

- Not replacing the terminal/chat rendering within each session (xterm stays)
- Not changing the agent execution model or backend architecture
- Not redesigning mobile layout in this iteration (desktop-first)
- Not adding cloud agent support (separate change)

## Approach

### New Layout Structure

```
┌─────────────────────────────────────────────────────────┐
│ [Command Bar — global search, quick actions, ⌘K]        │
├──────────────┬──────────────────────────────────────────┤
│              │                                          │
│  Agent List  │         Workspace Area                  │
│  Panel       │                                          │
│  (240px)     │  ┌─────────────────┬──────────────────┐ │
│              │  │                 │                  │ │
│  ┌────────┐  │  │  Agent A        │  Agent B         │ │
│  │ ● Run  │  │  │  (Terminal)     │  (Terminal)      │ │
│  │ Agent A │  │  │                 │                  │ │
│  ├────────┤  │  │                 │                  │ │
│  │ ⚠ Wait │  │  └─────────────────┴──────────────────┘ │
│  │ Agent B │  │                                          │
│  ├────────┤  │  OR single full-width view:              │
│  │ ● Run  │  │  ┌──────────────────────────────────────┐│
│  │ Agent C │  │  │                                      ││
│  ├────────┤  │  │  Selected Agent (full workspace)     ││
│  │ ✓ Done │  │  │                                      ││
│  │ Agent D │  │  └──────────────────────────────────────┘│
│  └────────┘  │                                          │
│              │                                          │
│  [+ New]     │  [Status Bar: 3 running · 1 waiting ·   │
│              │   $0.42 spent · 12m total]               │
└──────────────┴──────────────────────────────────────────┘
```

### Key Design Decisions

1. **Agent List Panel replaces icon sidebar** — The narrow 52px icon sidebar becomes a 240px agent list panel (collapsible to icon mode). This is the primary navigation.
2. **Tab bar is removed** — Individual chat tabs are replaced by the agent list. Each item in the list is a session entry, not a tab.
3. **Workspace area supports split pane** — Users can view 1, 2, or 4 agent sessions simultaneously. Default is single focused view.
4. **Mission Control is an inline overlay, not a separate page** — The dashboard stats appear as a collapsible header or panel within the workspace when no agent is selected.
5. **Urgency sorting in agent list** — Error → Waiting Input → Running → Completed. Same principle as the existing heartbeat bar concept, but as the primary navigation model.
6. **Command Bar (⌘K)** — A quick-action palette for common operations: new session, switch agent, jump to workspace. Replaces the need for multiple sidebar nav items.

## Risks

| Risk | Mitigation |
|------|-----------|
| Users comfortable with current tab-based model feel disoriented | Gradual migration: offer "Classic Layout" toggle for 2 releases |
| Agent list panel takes too much horizontal space on smaller screens | Collapsible to icon mode (52px), with hover-expand |
| Split pane complexity with xterm rendering | Reuse existing terminal container, only change parent layout grid |
| Route structure change breaks deep links | Keep routes stable, change only layout chrome |

## Success Metrics

- First-pass adoption rate > 60% within 2 weeks of launch (users staying on new layout)
- Time-to-respond to blocked agent: < 3s (measured from notification to first keystroke in reply)
- Users running 3+ parallel agents increases by 40% (hypothesis: better visibility enables more parallelism)
