# Technical Design: Agent Workspace Layout

## Architecture Overview

The redesign replaces the current `MainLayout` (sidebar + outlet) with a new `WorkspaceLayout` that implements a three-zone architecture:

```
Current:  AppSidebar (52px icons) → Outlet (full width, contains ChatTabBar + content)
Proposed: AgentListPanel (240px, collapsible) → WorkspaceArea (flex, contains split pane)
```

## Component Hierarchy

```
WorkspaceLayout (replaces MainLayout)
├── AgentListPanel
│   ├── WorkspaceHeader (logo + workspace selector)
│   ├── AgentSessionList (sorted by urgency)
│   │   └── AgentSessionCard × N
│   ├── QuickActions (+ New, ⌘K hint)
│   └── BottomNav (Settings, Notifications)
├── WorkspaceArea
│   ├── WorkspaceToolbar (split controls, layout toggle)
│   ├── SplitPaneContainer
│   │   └── AgentPane × 1-4
│   │       ├── AgentPaneHeader (agent name, status, actions)
│   │       └── AgentPaneContent (existing ChatPage/Terminal content)
│   └── WorkspaceStatusBar (aggregate stats)
└── CommandPalette (⌘K overlay)
```

## Data Flow

### Agent Session State

The existing `useChatsStore` (Zustand) already tracks active chats with status. The new layout subscribes to the same store but renders it differently:

```typescript
// Existing store provides:
interface ChatSession {
  id: string
  title: string
  status: 'running' | 'waiting_input' | 'error' | 'completed' | 'idle'
  agentName: string
  workspaceId: string
  // ...
}

// New derived state for agent list:
interface AgentListItem extends ChatSession {
  urgencyRank: number  // 0=error, 1=waiting, 2=running, 3=completed
  currentAction?: string
  duration: number
  tokenUsage: { in: number; out: number }
}
```

### Layout State

New Zustand slice for workspace layout preferences:

```typescript
interface WorkspaceLayoutState {
  panelCollapsed: boolean        // Agent list panel collapsed to icon mode
  splitMode: 'single' | 'horizontal' | 'vertical' | 'quad'
  activePanes: string[]          // chat IDs currently displayed in panes
  focusedPane: string | null     // which pane has focus
  classicMode: boolean           // fallback to tab-based layout
}
```

## Key Technical Decisions

### Decision 1: Agent List Panel vs Icon Sidebar

**Choice**: Replace icon sidebar entirely with agent list panel.

**Rationale**: The current icon sidebar serves as page-level navigation (Dashboard, History, Agents, etc.). In the new model, all these are accessible via Command Palette or inline within the workspace. The agent list provides more value per pixel than navigation icons.

**Migration**: `AppSidebar.tsx` is deprecated. `AgentListPanel.tsx` is the new component. Route-based navigation (pages like `/chats`, `/agents`, `/workspaces`) remains functional but accessed via ⌘K command palette rather than sidebar icons.

### Decision 2: Split Pane Implementation

**Choice**: CSS Grid with resizable regions, not iframe isolation.

**Rationale**: Each agent pane renders the same `ChatPage` component (which internally uses xterm.js for terminal). CSS Grid provides:
- No iframe overhead
- Shared state access (agent list updates reflect immediately)
- Native keyboard focus management

**Trade-off**: Terminal resize events need to propagate correctly when pane sizes change. Existing `fit addon` logic handles this, but timing must account for CSS transitions.

**Implementation**: Use `react-resizable-panels` (already battle-tested in VS Code web) or custom implementation with CSS `grid-template-columns`/`grid-template-rows`.

### Decision 3: Tab Bar Removal Strategy

**Choice**: Remove tab bar from default layout; retain as "compact mode" for users who prefer it.

**Rationale**: The tab bar is the most visible element of the old layout. Removing it is the strongest signal of the paradigm shift. However, some users (especially those with 1-2 agents) may prefer the simpler horizontal tab model.

**Implementation**:
- New layout is default for all users
- `Settings > Appearance > Layout Mode`: "Workspace" (default) | "Classic (Tabs)"
- Classic mode renders the existing `ChatTabBar` + single content area within the new `WorkspaceLayout` shell

### Decision 4: Mission Control Integration

**Choice**: Mission Control becomes the "empty state" of the workspace area when no specific agent is focused.

**Rationale**: Currently Mission Control is a separate route (`/` → `ChatTabContainer` → `EmptyTabPage` → Mission Control). In the new layout, it's the natural landing state — you open the app, see your agent list on the left and the dashboard on the right. Clicking an agent replaces the dashboard with that agent's workspace.

**Implementation**: `MissionControl.tsx` component renders inside `WorkspaceArea` when `activePanes` is empty. No route change needed.

### Decision 5: Command Palette (⌘K)

**Choice**: Implement a command palette as the universal action entry point.

**Rationale**: With sidebar navigation removed, users need a fast way to access:
- Create new session
- Switch workspace
- Open settings
- Navigate to specific agent
- Access history/skills/cron (previously sidebar items)

**Implementation**: Similar to VS Code's ⌘P / Cursor's ⌘K. A floating search input with categorized results. Use `cmdk` library (lightweight, React-native).

## File Impact Analysis

### New Files
- `web/layouts/WorkspaceLayout.tsx` — New root layout
- `web/components/workspace-v2/AgentListPanel.tsx` — Left panel
- `web/components/workspace-v2/AgentSessionCard.tsx` — Individual agent card in list
- `web/components/workspace-v2/WorkspaceArea.tsx` — Right workspace container
- `web/components/workspace-v2/SplitPaneContainer.tsx` — Split pane logic
- `web/components/workspace-v2/AgentPane.tsx` — Individual pane wrapper
- `web/components/workspace-v2/WorkspaceStatusBar.tsx` — Bottom status bar
- `web/components/workspace-v2/CommandPalette.tsx` — ⌘K overlay
- `web/stores/workspaceLayoutStore.ts` — Layout state

### Modified Files
- `web/App.tsx` — Route structure update (add WorkspaceLayout as alternative to MainLayout)
- `web/layouts/MainLayout.tsx` — Retained as "Classic" mode
- `web/components/home/MissionControl.tsx` — Extracted for reuse in workspace empty state

### Deprecated (not deleted)
- `web/components/nav/AppSidebar.tsx` — Superseded by AgentListPanel
- `web/components/nav/ChatTabBar.tsx` — Superseded by AgentListPanel
- `web/components/nav/SortableChatTab.tsx` — No longer needed

## Responsive Behavior

| Breakpoint | Agent List Panel | Workspace Area |
|-----------|-----------------|---------------|
| ≥ 1440px | 280px expanded | Full split pane support (up to quad) |
| 1024-1439px | 240px expanded | Max 2-pane split |
| 768-1023px | Collapsed to 52px (icon mode) | Single pane only |
| < 768px | Hidden (swipe to reveal) | Single pane, full screen |

## Performance Considerations

1. **Terminal instances**: Each visible pane mounts an xterm instance. Limit to 4 simultaneous visible terminals. Background panes are unmounted (state preserved in store, reconnected on focus).
2. **Agent list updates**: Use WebSocket for real-time status. Agent list re-renders only on status change, not on every terminal output line.
3. **Split pane resize**: Debounce xterm `fit()` calls to 100ms during resize drag.
4. **Memory**: With 4 active terminals, estimated memory overhead is ~80MB additional vs single terminal. Acceptable for desktop app.

## Migration Path

### Phase 1: Ship as opt-in (Feature Flag)
- WorkspaceLayout exists alongside MainLayout
- Users toggle via Settings
- Default: Classic for existing users, Workspace for new users

### Phase 2: Workspace becomes default
- After 2 weeks of telemetry, if adoption > 60%, flip default
- Classic mode remains available

### Phase 3: Deprecate Classic
- After 1 month, remove Classic layout code
- Simplify codebase
