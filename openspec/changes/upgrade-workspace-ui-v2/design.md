# Technical Design: Upgrade Workspace UI v2

## Architecture Overview

Replace `MainLayout` (AppSidebar + Outlet) with `WorkspaceLayout` implementing the interactive prototype's three-zone architecture + toolbar + status bar.

```
Current:  AppSidebar (52px icons) → Outlet (route-based pages)
Proposed: TaskSidebar (240px) → Toolbar + WorkspaceArea + StatusBar
```

## Component Hierarchy

```
WorkspaceLayout (replaces MainLayout for workspace routes)
├── TaskSidebar (240px, collapsible to 52px)
│   ├── SidebarHeader (logo + "New Task" button)
│   ├── TaskSessionList
│   │   ├── PinnedSection
│   │   │   └── PinnedItem × N
│   │   ├── ActiveTasksSection
│   │   │   └── TaskGroup × N (expandable)
│   │   │       ├── TaskGroupHeader (name + status dot + agent count)
│   │   │       ├── AgentSessionItem × N (nested, indented)
│   │   │       └── AddAgentRow ("+ Add Agent")
│   │   └── CompletedSection
│   │       └── CompletedTaskItem × N (collapsed)
│   └── SidebarFooter (icon buttons: history, agents, workspaces, skills, cron, theme, notifications, settings)
├── WorkspaceArea
│   ├── WorkspaceToolbar
│   │   ├── AgentInfoBar (status dot + agent name + task link + sibling dots)
│   │   │   OR TaskInfoBar (group icon + "Task Chat" + task name) — depending on viewMode
│   │   └── LayoutControls (single | split | quad buttons + shortcut hint)
│   ├── WorkspaceContent (varies by viewMode + layoutMode)
│   │   ├── [viewMode=agent, layout=single] → ChatPane (full width chat + input)
│   │   ├── [viewMode=agent, layout=split] → ChatPane (44%) | IDEPanel (56%)
│   │   ├── [viewMode=agent, layout=quad] → 4× MiniAgentPane (grid)
│   │   ├── [viewMode=task, layout=single] → TaskInfoSidebar (200px) | GroupChat
│   │   ├── [viewMode=task, layout=split] → GroupChat (44%) | IDEPanel (56%)
│   │   └── [viewMode=task, layout=quad] → 4× MiniAgentPane per task agents
│   └── WorkspaceStatusBar
│       └── StatusIndicators (running/waiting/error + branch + tools + tokens + cost + time)
├── CommandPalette (⌘K overlay)
└── AddAgentPicker (overlay when adding agent to task)
```

## State Architecture

### Primary State: WorkspaceStore (Zustand)

```typescript
interface WorkspaceState {
  // View state
  viewMode: 'agent' | 'task-overview'
  selectedAgentId: string | null
  selectedTaskId: string | null

  // Layout state
  layoutMode: 'single' | 'split' | 'quad'
  panelCollapsed: boolean
  terminalOpen: boolean
  activeIdeTab: 'Files' | 'Changes' | 'War Room' | 'Browser'

  // Task expansion state
  expandedTasks: Record<string, boolean>

  // Overlay state
  commandPaletteOpen: boolean
  addAgentOpen: boolean
  addAgentTaskId: string | null

  // Task chat state
  taskChatTargetIndex: number

  // Actions
  selectAgent: (agentId: string) => void
  openTaskOverview: (taskId: string) => void
  setLayoutMode: (mode: LayoutMode) => void
  togglePanel: () => void
  toggleTerminal: () => void
  setIdeTab: (tab: IdeTab) => void
  toggleTask: (taskId: string) => void
  openCommandPalette: () => void
  closeCommandPalette: () => void
  openAddAgent: (taskId: string) => void
  closeAddAgent: () => void
  cycleTargetAgent: () => void
}
```

### Data Source: TasksStore (extends existing ChatTabContext)

```typescript
interface Task {
  id: string
  name: string
  workspace: string
  status: 'running' | 'waiting' | 'error' | 'done'
  goal: string
  dispatch: 'lead' | 'user'
  agents: TaskAgent[]
  timeline: TimelineEvent[]
}

interface TaskAgent {
  id: string
  agent: string  // display name
  status: 'running' | 'waiting' | 'error' | 'done'
  action: string
  time: string
  role: 'lead' | 'worker'
  dispatch: 'user' | 'auto'
  handoffFrom?: string
}

interface TimelineEvent {
  t: string
  event: string
  type: 'user' | 'start' | 'handoff' | 'error' | 'waiting' | 'done'
}
```

### Relationship to existing ChatTabContext

The existing `ChatTabContext` manages flat chat tabs. In the new model:
- Each `Task` maps to one or more `ChatSession` entries
- The `ChatTabContext` remains as the lower-level session manager
- `TasksStore` is a higher-level abstraction that groups sessions by task
- Task data comes from the server via WebSocket (same channel as heartbeat updates)

## Key Technical Decisions

### Decision 1: Task hierarchy source of truth

**Choice**: Tasks are derived from the existing `chats` table + a new `task_id` field on chats.

**Rationale**: The server already groups agent sessions by chat. Adding a `task_id` column (nullable) to `chats` allows grouping multiple chats under one task. For single-agent tasks, `task_id = chat_id` (self-referential).

**Migration**: New DB migration adds `task_id TEXT` column. Existing chats get `task_id = id` (each is its own task). New multi-agent tasks get a shared `task_id`.

### Decision 2: Group Chat message merging

**Choice**: Client-side merge sort of multiple JSONL streams by timestamp.

**Rationale**: Following the "JSONL is single source of truth" principle, group chat is a UI compositor that reads from multiple JSONL files (one per agent session) and interleaves them by timestamp. No new server endpoint needed — the existing `SessionFileWatcher` already parses each file.

**Implementation**:
```typescript
// Merge multiple agent message streams into group chat timeline
const mergeGroupMessages = (agentStreams: Map<string, ParsedMessage[]>): GroupMessage[] => {
  return [...agentStreams.entries()]
    .flatMap(([agentId, msgs]) => msgs.map(m => ({ ...m, agentId })))
    .sort((a, b) => a.timestamp - b.timestamp)
}
```

### Decision 3: IDE Panel component reuse

**Choice**: Reuse existing components where available, create thin wrappers for new tabs.

| Tab | Existing Component | Action |
|-----|-------------------|--------|
| Files | `web/components/ide/FileTree.tsx` | Reuse directly |
| Changes | `web/components/changes/ChangesTab.tsx` + `FileChangeList.tsx` | Wrap in panel |
| War Room | `web/components/chat/whiteboard/` | New panel reading from `wb-snapshot.sh` |
| Browser | None | Placeholder + "Start Dev Server" button |

### Decision 4: Split pane implementation

**Choice**: CSS Grid with pre-defined layout modes (not arbitrary resize).

**Rationale**: The interactive prototype uses fixed ratios (44%/56% for split, 50/50 for quad). Arbitrary resize adds complexity for minimal user value. Use `grid-template-columns` for deterministic layouts.

```css
.layout-single { grid-template-columns: 1fr; }
.layout-split  { grid-template-columns: 44% 1fr; }
.layout-quad   { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
```

### Decision 5: Sidebar collapse behavior

**Choice**: Two states — expanded (240px) and collapsed (52px icon mode).

**Rationale**: Matches the interactive prototype exactly. Collapsed mode shows only status dots for each agent, plus expand/collapse toggle. No intermediate widths.

**Implementation**: CSS transition `width 200ms ease`. Terminal `fit()` debounced at end of transition.

### Decision 6: Agent orchestration (Add Agent)

**Choice**: UI-only overlay that calls existing task dispatch API.

**Rationale**: The "Add Agent" picker is a UI component that shows available agent types and sends a dispatch command to the server. The server already supports spawning new agents via the task system. The overlay collects: agent type + optional instruction text.

## File Impact Analysis

### New Files (Phase 1 — Layout Shell)

```
web/layouts/WorkspaceLayout.tsx          — New root layout
web/components/workspace-v2/TaskSidebar.tsx       — Left panel container
web/components/workspace-v2/TaskSessionList.tsx   — Session list with task grouping
web/components/workspace-v2/TaskGroupItem.tsx     — Expandable task group
web/components/workspace-v2/AgentSessionItem.tsx  — Nested agent item
web/components/workspace-v2/SidebarFooter.tsx     — Bottom icon bar
web/components/workspace-v2/WorkspaceToolbar.tsx  — Top toolbar
web/components/workspace-v2/WorkspaceStatusBar.tsx — Bottom status bar
web/components/workspace-v2/LayoutControls.tsx    — Single/split/quad toggle
web/stores/workspaceStore.ts                      — Layout + view state (Zustand)
```

### New Files (Phase 2 — Workspace Content)

```
web/components/workspace-v2/WorkspaceContent.tsx     — Content router by mode
web/components/workspace-v2/ChatPane.tsx             — Single agent chat view
web/components/workspace-v2/IDEPanel.tsx             — Right panel with tabs
web/components/workspace-v2/IDETabBar.tsx            — Files|Changes|WarRoom|Browser
web/components/workspace-v2/WarRoomPanel.tsx         — War Room entries display
web/components/workspace-v2/BrowserPanel.tsx         — Preview placeholder
web/components/workspace-v2/MiniAgentPane.tsx        — Compact pane for quad view
```

### New Files (Phase 3 — Task Overview + Orchestration)

```
web/components/workspace-v2/TaskOverview.tsx          — Task overview container
web/components/workspace-v2/TaskInfoSidebar.tsx       — Goal + team + timeline sidebar
web/components/workspace-v2/GroupChat.tsx             — Merged timeline renderer
web/components/workspace-v2/GroupChatMessage.tsx      — Individual message in group
web/components/workspace-v2/GroupChatInput.tsx        — @agent targeted input
web/components/workspace-v2/AddAgentPicker.tsx        — Agent picker overlay
web/components/workspace-v2/CommandPalette.tsx        — ⌘K search overlay
```

### Modified Files

```
web/App.tsx                — Add WorkspaceLayout route, keep MainLayout for non-workspace pages
web/contexts/ChatTabContext.tsx — Add task grouping awareness (optional, can be separate store)
shared/ws-types.ts         — Add task-related message types
```

### Deprecated (after migration)

```
web/components/nav/AppSidebar.tsx     — Replaced by TaskSidebar
web/components/nav/ChatTabBar.tsx     — Replaced by TaskSessionList
web/components/nav/SortableChatTab.tsx — No longer needed
```

## CSS / Design Tokens

The interactive prototype defines these CSS variables — align with existing Tailwind config:

```css
--bg-primary: #0a0a10     → bg-bg-primary (existing)
--bg-secondary: #0e0e16   → bg-bg-secondary (new)
--bg-tertiary: #16161a    → bg-bg-tertiary (new)
--bg-hover: #1e1e2a       → hover:bg-bg-hover (new)
--bg-selected: #242432    → bg-bg-selected (new)
--border: #262636         → border-border (existing)
--border-subtle: #1c1c2a  → border-border-subtle (new)
--text-primary: #e2e4f0   → text-text-primary (existing)
--text-secondary: #949cac → text-text-secondary (existing)
--text-muted: #5a6478     → text-text-muted (existing)
--accent: #5a8fca         → text-accent (existing)
--accent-light: #82b0de   → text-accent-light (new)
--green: #34d399          → text-green (existing)
--yellow: #fbbf24         → text-yellow (existing)
--red: #ef4444            → text-red (existing)
--purple: #a78bfa         → text-purple (new)
```

## Performance Considerations

1. **Terminal instances**: Max 4 visible xterm instances. Background agents are unmounted, reconnected on focus.
2. **Group Chat rendering**: Virtualize message list for tasks with 100+ messages. Use `react-virtual` if needed.
3. **Sidebar updates**: Agent status changes arrive via WebSocket. Only re-render affected `AgentSessionItem`, not entire list.
4. **IDE panel lazy loading**: Each tab content is lazy-mounted on first activation. War Room fetches data only when tab is selected.
5. **Split pane transitions**: Use CSS transitions (200ms) with `will-change: width` for smooth panel collapse.

## Migration Path

1. **Phase 1**: Ship `WorkspaceLayout` behind a route guard (`/v2/*` routes). Existing layout untouched.
2. **Phase 2**: Once stable, make WorkspaceLayout the default for workspace routes. Keep MainLayout for settings/admin.
3. **Phase 3**: Remove old navigation components after 1 release cycle.
