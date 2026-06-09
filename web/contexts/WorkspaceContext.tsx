import { createContext, useContext, useReducer, useCallback, useEffect, useMemo, useState, useRef, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { buildMissionUrl, buildWorkspaceUrl } from '../components/workspace/urls'

// ── Types ──

export type ViewMode = 'agent' | 'mission-overview'
export type LayoutMode = 'single' | 'split' | 'quad'
export type IdeTab = 'IDE' | 'War Room'
const VALID_IDE_TABS: IdeTab[] = ['IDE', 'War Room']

// IDE region defaults to collapsed in single mode (focus on chat),
// expanded in split/quad mode (coordination needs mission context visible)
const defaultIdeCollapsedFor = (mode: LayoutMode): boolean => mode === 'single'

// User-resizable panel width bounds
export const SIDEBAR_WIDTH_MIN = 200
export const SIDEBAR_WIDTH_MAX = 360
export const SIDEBAR_WIDTH_DEFAULT = 300
const sidebarMaxWidth = () => Math.max(SIDEBAR_WIDTH_MIN, Math.floor(window.innerWidth / 2))

export const IDE_WIDTH_MIN = 280
export const IDE_WIDTH_MAX = 640
export const IDE_WIDTH_DEFAULT = 380

// Chat width in split mode (px). null = use default percentage (44% or 50% on narrow).
export const CHAT_SPLIT_WIDTH_MIN = 320
export const CHAT_SPLIT_WIDTH_MAX = 1200

const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v))

interface WorkspaceState {
  layoutMode: LayoutMode
  panelCollapsed: boolean
  terminalOpen: boolean
  activeIdeTab: IdeTab
  expandedMissions: Record<string, boolean>
  ideCollapsed: boolean
}

interface ResizeState {
  sidebarWidth: number
  idePanelWidth: number
  chatSplitWidth: number | null
}

interface WorkspaceContextValue extends WorkspaceState, ResizeState {
  // URL-derived navigation state (NOT in reducer, comes from layout props)
  workspaceId: string | null
  activeChatId: string | null
  selectedAgentId: string | null
  /** Derived: 'agent' when selectedAgentId is set, 'mission-overview' otherwise. */
  viewMode: ViewMode
  /** Alias for activeChatId — preserved so legacy consumers keep compiling. */
  selectedMissionId: string | null

  // Transient per-mission target index for @target cycle in group chat input.
  missionChatTargetIndex: number
  cycleTargetAgent: (agentCount: number) => void

  /** DOM node where V2 IDEPanel wants ChatInstance's RightPanel to portal. Null when
   *  IDE column is showing a non-chat tab (e.g. War Room) or no chat is active. */
  ideMountNode: HTMLElement | null
  setIdeMountNode: (node: HTMLElement | null) => void

  // Navigation helpers — all write to the URL, never to local state.
  selectAgent: (agentId: string) => void
  openMissionOverview: (missionId: string) => void

  setLayoutMode: (mode: LayoutMode) => void
  cycleLayoutMode: () => void
  togglePanel: () => void
  collapsePanel: () => void
  expandPanel: () => void
  toggleTerminal: () => void
  setIdeTab: (tab: IdeTab) => void
  toggleMission: (missionId: string) => void
  toggleIde: () => void
  setSidebarWidth: (w: number) => void
  setIdePanelWidth: (w: number) => void
  setChatSplitWidth: (w: number | null) => void
}

// ── Constants ──

const STORAGE_KEY = 'teemai:workspace-layout'
const LAYOUT_CYCLE: LayoutMode[] = ['single', 'split', 'quad']

// ── Reducer (layout state only — no resize widths) ──

type Action =
  | { type: 'SET_LAYOUT_MODE'; mode: LayoutMode }
  | { type: 'CYCLE_LAYOUT_MODE' }
  | { type: 'TOGGLE_PANEL' }
  | { type: 'COLLAPSE_PANEL' }
  | { type: 'EXPAND_PANEL' }
  | { type: 'TOGGLE_TERMINAL' }
  | { type: 'SET_IDE_TAB'; tab: IdeTab }
  | { type: 'TOGGLE_MISSION'; missionId: string }
  | { type: 'TOGGLE_IDE' }
  | { type: 'RESTORE'; state: Partial<WorkspaceState> }

const reducer = (state: WorkspaceState, action: Action): WorkspaceState => {
  switch (action.type) {
    case 'SET_LAYOUT_MODE':
      return { ...state, layoutMode: action.mode, ideCollapsed: defaultIdeCollapsedFor(action.mode) }

    case 'CYCLE_LAYOUT_MODE': {
      const idx = LAYOUT_CYCLE.indexOf(state.layoutMode)
      const next = LAYOUT_CYCLE[(idx + 1) % LAYOUT_CYCLE.length]
      return { ...state, layoutMode: next, ideCollapsed: defaultIdeCollapsedFor(next) }
    }

    case 'TOGGLE_PANEL':
      return { ...state, panelCollapsed: !state.panelCollapsed }

    case 'COLLAPSE_PANEL':
      return state.panelCollapsed ? state : { ...state, panelCollapsed: true }

    case 'EXPAND_PANEL':
      return state.panelCollapsed ? { ...state, panelCollapsed: false } : state

    case 'TOGGLE_TERMINAL':
      return { ...state, terminalOpen: !state.terminalOpen }

    case 'SET_IDE_TAB':
      return { ...state, activeIdeTab: action.tab }

    case 'TOGGLE_MISSION':
      return { ...state, expandedMissions: { ...state.expandedMissions, [action.missionId]: !state.expandedMissions[action.missionId] } }

    case 'TOGGLE_IDE':
      return { ...state, ideCollapsed: !state.ideCollapsed }

    case 'RESTORE': {
      const restored = { ...state, ...action.state }
      // Drop legacy 'War Room' tab from old persisted state
      if (!VALID_IDE_TABS.includes(restored.activeIdeTab)) {
        restored.activeIdeTab = 'IDE'
      }
      return restored
    }

    default:
      return state
  }
}

// ── Initial State ──

const defaultState: WorkspaceState = {
  layoutMode: 'split',
  panelCollapsed: false,
  terminalOpen: true,
  activeIdeTab: 'IDE',
  expandedMissions: {},
  ideCollapsed: false,
}

const loadPersistedState = (): Partial<WorkspaceState & ResizeState> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    // Strip legacy keys that are now URL-driven; ignore unknown shapes silently.
    delete parsed.viewMode
    delete parsed.selectedAgentId
    delete parsed.selectedMissionId
    delete parsed.missionChatTargetIndex
    delete parsed.workspaceId
    delete parsed.activeChatId
    return parsed as Partial<WorkspaceState & ResizeState>
  } catch {
    return {}
  }
}

// ── Resize Context (high-frequency, isolated from main context) ──

interface ResizeContextValue extends ResizeState {
  setSidebarWidth: (w: number) => void
  setIdePanelWidth: (w: number) => void
  setChatSplitWidth: (w: number | null) => void
}

const ResizeContext = createContext<ResizeContextValue | null>(null)

// ── Main Context ──

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

interface WorkspaceProviderProps {
  children: ReactNode
  workspaceId?: string | null
  activeChatId?: string | null
  selectedAgentId?: string | null
}

export const WorkspaceProvider = ({
  children,
  workspaceId = null,
  activeChatId = null,
  selectedAgentId = null,
}: WorkspaceProviderProps) => {
  const persisted = useMemo(() => loadPersistedState(), [])

  const [state, dispatch] = useReducer(reducer, defaultState, (initial) => {
    const merged: WorkspaceState = { ...initial, ...persisted }
    if (!VALID_IDE_TABS.includes(merged.activeIdeTab)) {
      merged.activeIdeTab = 'IDE'
    }
    return merged
  })

  // Resize widths live in separate useState — updates here do NOT trigger
  // the main context's useMemo, so only resize consumers re-render during drag.
  const [sidebarWidth, setSidebarWidthRaw] = useState(() =>
    clamp((persisted.sidebarWidth as number) ?? SIDEBAR_WIDTH_DEFAULT, SIDEBAR_WIDTH_MIN, sidebarMaxWidth()),
  )
  const [idePanelWidth, setIdePanelWidthRaw] = useState(() =>
    clamp((persisted.idePanelWidth as number) ?? IDE_WIDTH_DEFAULT, IDE_WIDTH_MIN, IDE_WIDTH_MAX),
  )
  const [chatSplitWidth, setChatSplitWidthRaw] = useState<number | null>(() => {
    const v = persisted.chatSplitWidth
    if (v === null || v === undefined) return null
    return clamp(v as number, CHAT_SPLIT_WIDTH_MIN, CHAT_SPLIT_WIDTH_MAX)
  })

  const setSidebarWidth = useCallback((w: number) => {
    setSidebarWidthRaw(clamp(w, SIDEBAR_WIDTH_MIN, sidebarMaxWidth()))
  }, [])
  const setIdePanelWidth = useCallback((w: number) => {
    setIdePanelWidthRaw(clamp(w, IDE_WIDTH_MIN, IDE_WIDTH_MAX))
  }, [])
  const setChatSplitWidth = useCallback((w: number | null) => {
    setChatSplitWidthRaw(w === null ? null : clamp(w, CHAT_SPLIT_WIDTH_MIN, CHAT_SPLIT_WIDTH_MAX))
  }, [])

  const navigate = useNavigate()

  // viewMode is purely derived from the URL-driven selectedAgentId.
  const viewMode: ViewMode = selectedAgentId ? 'agent' : 'mission-overview'

  // Transient @target cycle index, reset whenever the mission changes.
  const [missionChatTargetIndex, setTaskChatTargetIndex] = useState(0)
  useEffect(() => { setTaskChatTargetIndex(0) }, [activeChatId])
  const cycleTargetAgent = useCallback((agentCount: number) => {
    if (agentCount <= 0) return
    setTaskChatTargetIndex((i) => (i + 1) % agentCount)
  }, [])

  // Persist layout + resize state to localStorage. Resize values use refs to
  // avoid re-triggering the effect on every drag frame — we debounce via a
  // trailing write on the next layout state change or unmount.
  const resizeRef = useRef({ sidebarWidth, idePanelWidth, chatSplitWidth })
  resizeRef.current = { sidebarWidth, idePanelWidth, chatSplitWidth }

  useEffect(() => {
    const persisted = {
      layoutMode: state.layoutMode,
      panelCollapsed: state.panelCollapsed,
      terminalOpen: state.terminalOpen,
      activeIdeTab: state.activeIdeTab,
      expandedMissions: state.expandedMissions,
      ideCollapsed: state.ideCollapsed,
      ...resizeRef.current,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted))
  }, [state.layoutMode, state.panelCollapsed, state.terminalOpen, state.activeIdeTab, state.expandedMissions, state.ideCollapsed])

  // Also persist on resize changes, but debounced to avoid thrashing storage
  // on every mousemove frame.
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
    persistTimerRef.current = setTimeout(() => {
      const current = {
        layoutMode: state.layoutMode,
        panelCollapsed: state.panelCollapsed,
        terminalOpen: state.terminalOpen,
        activeIdeTab: state.activeIdeTab,
        expandedMissions: state.expandedMissions,
        ideCollapsed: state.ideCollapsed,
        sidebarWidth,
        idePanelWidth,
        chatSplitWidth,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
    }, 300)
    return () => { if (persistTimerRef.current) clearTimeout(persistTimerRef.current) }
  }, [sidebarWidth, idePanelWidth, chatSplitWidth])

  // Navigation helpers — these are the public API. They drive the URL, which
  // is then read back as props by the layout and threaded into this provider.
  const selectAgent = useCallback((agentId: string) => {
    if (!workspaceId || !activeChatId) return
    navigate(buildMissionUrl(workspaceId, activeChatId, agentId))
  }, [navigate, workspaceId, activeChatId])

  const openMissionOverview = useCallback((missionId: string) => {
    if (!workspaceId) return
    navigate(buildMissionUrl(workspaceId, missionId))
  }, [navigate, workspaceId])

  const setLayoutMode = useCallback((mode: LayoutMode) => dispatch({ type: 'SET_LAYOUT_MODE', mode }), [])
  const cycleLayoutMode = useCallback(() => dispatch({ type: 'CYCLE_LAYOUT_MODE' }), [])
  const togglePanel = useCallback(() => dispatch({ type: 'TOGGLE_PANEL' }), [])
  const collapsePanel = useCallback(() => dispatch({ type: 'COLLAPSE_PANEL' }), [])
  const expandPanel = useCallback(() => dispatch({ type: 'EXPAND_PANEL' }), [])
  // toggleTerminal is a bridge to WebIDEPanel (which owns the terminal drawer
  // state). The reducer's `terminalOpen` is now unused; kept only to avoid a
  // localStorage schema bump.
  const toggleTerminal = useCallback(() => {
    window.dispatchEvent(new CustomEvent('ide:toggle-terminal'))
  }, [])
  const setIdeTab = useCallback((tab: IdeTab) => dispatch({ type: 'SET_IDE_TAB', tab }), [])
  const toggleMission = useCallback((missionId: string) => dispatch({ type: 'TOGGLE_MISSION', missionId }), [])
  const toggleIde = useCallback(() => dispatch({ type: 'TOGGLE_IDE' }), [])

  // IDE portal target: V2 IDEPanel registers a DOM node when its IDE tab is active;
  // ChatInstance reads this and createPortal()s RightPanel into it.
  const [ideMountNode, setIdeMountNode] = useState<HTMLElement | null>(null)

  // Main context value — does NOT depend on resize widths. Changes to
  // sidebarWidth/idePanelWidth/chatSplitWidth during drag do not trigger
  // re-render of components that only read from this context.
  const value: WorkspaceContextValue = useMemo(() => ({
    ...state,
    // Resize values are included for backward compat of useWorkspace() shape
    // but the memo does NOT list them as deps. Consumers that need live resize
    // values should use useWorkspaceResize() for reactivity during drag.
    sidebarWidth: resizeRef.current.sidebarWidth,
    idePanelWidth: resizeRef.current.idePanelWidth,
    chatSplitWidth: resizeRef.current.chatSplitWidth,
    workspaceId,
    activeChatId,
    selectedAgentId,
    selectedMissionId: activeChatId,
    viewMode,
    missionChatTargetIndex,
    cycleTargetAgent,
    ideMountNode,
    setIdeMountNode,
    selectAgent,
    openMissionOverview,
    setLayoutMode,
    cycleLayoutMode,
    togglePanel,
    collapsePanel,
    expandPanel,
    toggleTerminal,
    setIdeTab,
    toggleMission,
    toggleIde,
    setSidebarWidth,
    setIdePanelWidth,
    setChatSplitWidth,
  }), [
    state, workspaceId, activeChatId, selectedAgentId, viewMode,
    missionChatTargetIndex, cycleTargetAgent,
    ideMountNode,
    selectAgent, openMissionOverview,
    setLayoutMode, cycleLayoutMode, togglePanel, collapsePanel, expandPanel,
    toggleTerminal, setIdeTab, toggleMission, toggleIde,
    setSidebarWidth, setIdePanelWidth, setChatSplitWidth,
  ])

  // Resize context — only the 3 container components subscribe to this.
  const resizeValue: ResizeContextValue = useMemo(() => ({
    sidebarWidth,
    idePanelWidth,
    chatSplitWidth,
    setSidebarWidth,
    setIdePanelWidth,
    setChatSplitWidth,
  }), [sidebarWidth, idePanelWidth, chatSplitWidth, setSidebarWidth, setIdePanelWidth, setChatSplitWidth])

  return (
    <WorkspaceContext.Provider value={value}>
      <ResizeContext.Provider value={resizeValue}>
        {children}
      </ResizeContext.Provider>
    </WorkspaceContext.Provider>
  )
}

export const useWorkspace = (): WorkspaceContextValue => {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider')
  return ctx
}

/** Subscribe to resize widths reactively. Use this in components that render
 *  container dimensions (MissionSidebar, SplitChatContainer, IdeRegion) so
 *  they re-render on drag without cascading to the entire workspace tree. */
export const useWorkspaceResize = (): ResizeContextValue => {
  const ctx = useContext(ResizeContext)
  if (!ctx) throw new Error('useWorkspaceResize must be used within WorkspaceProvider')
  return ctx
}

// Re-export for callers that import via the context for convenience.
export { buildMissionUrl, buildWorkspaceUrl }
