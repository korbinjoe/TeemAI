# Tasks: Redesign Layout — Agent Workspace

## Phase 1: Foundation (Must ship together)

- [ ] **Create WorkspaceLayout shell** — New layout component with CSS Grid: agent-list-panel | workspace-area. Register as alternative layout in App.tsx with feature flag.
- [ ] **Implement AgentListPanel** — 240px left panel with: workspace header (logo + name), scrollable agent session list, bottom actions (settings, notifications). Collapsible to 52px icon mode.
- [ ] **Build AgentSessionCard** — Individual card in the list showing: agent avatar + name, status badge (running/waiting/error/done), current action text (truncated), duration timer. Urgency-sorted rendering.
- [ ] **Create WorkspaceArea container** — Right zone that renders either MissionControl (empty state) or active agent pane(s). Manages focus state.
- [ ] **Implement single-pane agent view** — Clicking an agent in the list renders their existing ChatPage/terminal content in the workspace area. Must handle terminal resize correctly.
- [ ] **Add workspaceLayoutStore** — Zustand store for layout preferences: panelCollapsed, splitMode, activePanes, focusedPane, classicMode toggle.
- [ ] **Wire layout toggle in Settings** — Add "Layout Mode" option: Workspace (new) | Classic (existing). Persists to local storage.

## Phase 2: Split Pane & Multi-Agent View

- [ ] **Implement SplitPaneContainer** — Resizable split pane supporting horizontal (2-up) and vertical (over-under) modes. Handle drag resize with debounced terminal fit.
- [ ] **Add split pane controls** — Toolbar buttons: single | split-h | split-v | quad. Keyboard shortcuts: ⌘\ for split, ⌘W to close pane.
- [ ] **Agent drag-to-split** — Drag an agent card from the list into the workspace area to open it in a new split pane.
- [ ] **Quad pane layout** — 4-pane grid view for monitoring multiple agents simultaneously. Each pane shows compact terminal output.
- [ ] **Pane focus management** — Click-to-focus, keyboard navigation between panes (⌘[ / ⌘] or ⌘1-4). Active pane has subtle highlight border.

## Phase 3: Command Palette & Navigation

- [ ] **Build CommandPalette component** — ⌘K triggered overlay with fuzzy search. Categories: Agents (switch to), Actions (new session, open settings), Navigation (history, workspaces, skills).
- [ ] **Migrate sidebar navigation items to command palette** — Workspaces, Skills, Cron Jobs, Admin — all accessible via ⌘K search. Remove from primary UI.
- [ ] **Quick-reply integration** — When an agent is in "waiting input" state, the command palette shows a shortcut to jump directly to that agent's input field.

## Phase 4: Mission Control Integration

- [ ] **Embed MissionControl in workspace empty state** — When no agent is selected/focused, workspace area shows the existing MissionControl dashboard (stats, attention alerts, recent completions).
- [ ] **Add inline attention banner** — At the top of the agent list panel, show a compact "2 need attention" indicator that links to the relevant agents.
- [ ] **Aggregate status bar** — Bottom of workspace shows: X running · Y waiting · Z completed today · $cost · total time. Live-updating.

## Phase 5: Polish & Migration

- [ ] **Responsive breakpoints** — Implement panel collapse behavior at 1024px and panel hide at 768px. Test terminal rendering at each breakpoint.
- [ ] **Animation & transitions** — Panel collapse/expand animation (200ms ease), pane split/merge transitions, agent status change micro-animations.
- [ ] **Keyboard shortcut map** — Document and implement full shortcut set: ⌘K (palette), ⌘\ (split), ⌘W (close pane), ⌘1-4 (focus pane), ⌘N (new session), ⌘[ / ⌘] (prev/next agent).
- [ ] **Telemetry instrumentation** — Track: layout mode usage, split pane adoption, time-to-respond, command palette usage frequency.
- [ ] **Remove deprecated components** — After Classic mode sunset: remove AppSidebar, ChatTabBar, SortableChatTab.

## Dependencies

- Phase 2 depends on Phase 1 completion
- Phase 3 can run parallel to Phase 2
- Phase 4 can run parallel to Phase 2
- Phase 5 requires Phase 1-4 all complete

## Validation Criteria

- [ ] Terminal renders correctly in all split pane configurations (1/2/4 panes)
- [ ] Terminal resize works on window resize, panel collapse, and pane split/merge
- [ ] Agent list updates in real-time when agent status changes (WebSocket)
- [ ] Classic mode toggle works without page reload
- [ ] All existing routes remain accessible (via command palette or direct URL)
- [ ] No regression in session restore (refresh preserves layout state + active agents)
