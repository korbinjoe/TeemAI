# Changelog

## [0.1.0-beta.2] - 2026-06-02

### Features

- **Mobile remote control**: add PWA with LAN access, QR pairing, real-time streaming, agent name display, and message grouping in mission detail
- **Mobile dashboard**: agent names, Rocket icon, enhanced home page, sidebar team row, and agent stats
- **Workflow scheduler**: add notification queue, watchdog, and autoAdvance for server-driven workflow progression
- **War room visuals**: differentiate timeline card styles, improve causal flow edges, file tree auto-scroll, and whiteboard layout edges

### Bug Fixes

- Fix War Room DAG not reflecting real-time workflow task status
- Fix second handoff to same agent silently failing
- Fix AskUserQuestion tool not available when allowedTools is configured
- Fix message area running status color to match global blue convention
- Fix queued messages lost on Mission switch by persisting to global store
- Fix New Mission button UI freeze by removing useWorkspace() from memo-wrapped MissionRow
- Fix handoff task being silently dropped when target agent is already running
- Fix Lead agent bypassing multi-agent dispatch by using replace prompt mode and tightening tools
- Fix empty state logo to use theme-aware TeemAILogo component
- Fix war room misclassifying internal subagent spawns as handoffs

### Improvements

- Rewrite UI Designer prompts to eliminate AI-taste output
- Split dialog state from WorkspaceContext into dedicated DialogContext
- Change default IDE editor font size from M to S for visual consistency
- Revise mobile remote control spec to LAN-only and add workspace visibility tracking

## [0.1.0-beta.1] - 2026-06-02

### Features

- **Multi-agent orchestration**: server-driven DAG workflow scheduling with Lead-as-router dispatch model, lead-as-judge review loop, and automated merge conflict resolution
- **Workspace detail page**: add `/workspaces/:workspaceId` route for workspace-level overview
- **One-click workspace creation**: streamline workspace setup flow, remove notch panel
- **Agent evolution**: support agent performance audit and built-in definition optimization
- **War room (whiteboard)**: shared key-information board for cross-agent context with goal/decision/artifact/progress tracking
- **Terminal view mode**: bridge ACP chat to `claude --resume` PTY for direct terminal interaction
- **IDE enhancements**: fullscreen mode, font-size selector, file-type icons, in-document find (⌘F), new file/folder toolbar buttons, centered markdown preview
- **Tray improvements**: running-mission count and overview panel in macOS tray, native menu integration
- **Sidebar redesign**: immersive cross-workspace overview with collapsible groups, pinned missions, auto-archive after 2 days idle, search via `/` shortcut, hide/unhide workspaces
- **Home redesign**: vibrant agent avatars with traditional color palette monograms, redesigned header
- **Chat features**: three-tier error state for agent turns, slash command chip rendering, queued message management with ArrowUp recall, AskUserQuestion guard for queued messages
- **Multiple agent instances**: support duplicate agents in a single mission with independent sessions
- **DevPanel**: 5-tab architecture for full system observability including JSONL viewer
- **Themes**: add Diancui (Kingfisher), Jiqing (Clear Sky), and Tanxiang (Sandalwood) brand themes
- **Configurable models**: load model list from `~/.teemai/config.json` instead of hardcoding
- **Heartbeat bar**: scope heartbeat and queue indicators to current agent in single-agent view
- **Continuation summary**: collapsible cross-session context handoff summary
- **macOS sleep prevention**: keep system awake while missions are running
- **Lead agent benchmarks**: 19 eval scenarios with visual report and E2E lifecycle benchmark

### Bug Fixes

- Fix UI lag when many missions are active by reducing unnecessary re-renders
- Fix agent selectors showing non-team agents by filtering with hired-agents
- Fix unresolved slash commands causing "Unknown command" in conversation mode
- Fix tray icon spacing and vertical alignment in macOS menu bar
- Fix sidebar status dots out of sync with live agent phase
- Fix mission status dot showing running (blue) over waiting (yellow) priority
- Fix macOS traffic-light overlap on sidebar headers and fullscreen IDE tab bar
- Fix terminal PTY view staying alive across mission switches
- Fix markdown links opening in Electron window instead of system browser
- Fix agent CWD resolution from chat workspace instead of `process.cwd()`
- Fix DAG workflow stuck after first task by ensuring `onExited` fires on all exit paths
- Fix war-room goal write failure when active goal already exists
- Fix stale closure blocking queue flush in chat input
- Fix image attachments not forwarded to model on cold start
- Fix empty state avatar, replace with TeemAI logo
- Fix Git Changes panel not refreshing after agent commits via PTY
- Fix Electron dev/prod daemon port isolation and SingletonLock conflict
- Fix black screen caused by Google Fonts CDN, switch to `@fontsource/inter`
- Replace ad-hoc code signing for macOS DMG
- Suppress completion notification on user-stop and timeout

### Refactoring

- Rename task → mission across UI, types, and routes
- Remove MissionInfoSidebar and Timeline section, delegate to War Room
- Promote Workspace V2 to default, remove V1 dead code
- Switch Lead dispatch to handoff-first model with strict router-not-doer behavior
- Centralize placeholder title detection with i18n awareness
- Remove internal project references for open-source readiness
- Audit and optimize built-in agent definitions

## [0.1.0-beta.0] - 2026-04-28

Initial beta release.
