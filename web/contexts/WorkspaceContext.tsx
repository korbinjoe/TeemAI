import { createContext, useContext, useReducer, useCallback, useEffect, type ReactNode } from 'react'

// ── Types ──

export type ViewMode = 'agent' | 'task-overview'
export type LayoutMode = 'single' | 'split' | 'quad'
export type IdeTab = 'Files' | 'Changes' | 'War Room' | 'Browser'

interface WorkspaceState {
  viewMode: ViewMode
  selectedAgentId: string | null
  selectedTaskId: string | null
  layoutMode: LayoutMode
  panelCollapsed: boolean
  terminalOpen: boolean
  activeIdeTab: IdeTab
  expandedTasks: Record<string, boolean>
  commandPaletteOpen: boolean
  addAgentOpen: boolean
  addAgentTaskId: string | null
  taskChatTargetIndex: number
}

interface WorkspaceContextValue extends WorkspaceState {
  selectAgent: (agentId: string) => void
  openTaskOverview: (taskId: string) => void
  setLayoutMode: (mode: LayoutMode) => void
  cycleLayoutMode: () => void
  togglePanel: () => void
  toggleTerminal: () => void
  setIdeTab: (tab: IdeTab) => void
  toggleTask: (taskId: string) => void
  openCommandPalette: () => void
  closeCommandPalette: () => void
  openAddAgent: (taskId: string) => void
  closeAddAgent: () => void
  cycleTargetAgent: (agentCount: number) => void
}

// ── Constants ──

const STORAGE_KEY = 'openteam:workspace-layout'
const LAYOUT_CYCLE: LayoutMode[] = ['single', 'split', 'quad']

// ── Reducer ──

type Action =
  | { type: 'SELECT_AGENT'; agentId: string }
  | { type: 'OPEN_TASK_OVERVIEW'; taskId: string }
  | { type: 'SET_LAYOUT_MODE'; mode: LayoutMode }
  | { type: 'CYCLE_LAYOUT_MODE' }
  | { type: 'TOGGLE_PANEL' }
  | { type: 'TOGGLE_TERMINAL' }
  | { type: 'SET_IDE_TAB'; tab: IdeTab }
  | { type: 'TOGGLE_TASK'; taskId: string }
  | { type: 'OPEN_COMMAND_PALETTE' }
  | { type: 'CLOSE_COMMAND_PALETTE' }
  | { type: 'OPEN_ADD_AGENT'; taskId: string }
  | { type: 'CLOSE_ADD_AGENT' }
  | { type: 'CYCLE_TARGET_AGENT'; agentCount: number }
  | { type: 'RESTORE'; state: Partial<WorkspaceState> }

const reducer = (state: WorkspaceState, action: Action): WorkspaceState => {
  switch (action.type) {
    case 'SELECT_AGENT':
      return { ...state, viewMode: 'agent', selectedAgentId: action.agentId }

    case 'OPEN_TASK_OVERVIEW':
      return { ...state, viewMode: 'task-overview', selectedTaskId: action.taskId, taskChatTargetIndex: 0 }

    case 'SET_LAYOUT_MODE':
      return { ...state, layoutMode: action.mode }

    case 'CYCLE_LAYOUT_MODE': {
      const idx = LAYOUT_CYCLE.indexOf(state.layoutMode)
      return { ...state, layoutMode: LAYOUT_CYCLE[(idx + 1) % LAYOUT_CYCLE.length] }
    }

    case 'TOGGLE_PANEL':
      return { ...state, panelCollapsed: !state.panelCollapsed }

    case 'TOGGLE_TERMINAL':
      return { ...state, terminalOpen: !state.terminalOpen }

    case 'SET_IDE_TAB':
      return { ...state, activeIdeTab: action.tab }

    case 'TOGGLE_TASK':
      return { ...state, expandedTasks: { ...state.expandedTasks, [action.taskId]: !state.expandedTasks[action.taskId] } }

    case 'OPEN_COMMAND_PALETTE':
      return { ...state, commandPaletteOpen: true }

    case 'CLOSE_COMMAND_PALETTE':
      return { ...state, commandPaletteOpen: false }

    case 'OPEN_ADD_AGENT':
      return { ...state, addAgentOpen: true, addAgentTaskId: action.taskId }

    case 'CLOSE_ADD_AGENT':
      return { ...state, addAgentOpen: false, addAgentTaskId: null }

    case 'CYCLE_TARGET_AGENT':
      return { ...state, taskChatTargetIndex: (state.taskChatTargetIndex + 1) % action.agentCount }

    case 'RESTORE':
      return { ...state, ...action.state }

    default:
      return state
  }
}

// ── Initial State ──

const defaultState: WorkspaceState = {
  viewMode: 'agent',
  selectedAgentId: null,
  selectedTaskId: null,
  layoutMode: 'split',
  panelCollapsed: false,
  terminalOpen: true,
  activeIdeTab: 'Changes',
  expandedTasks: {},
  commandPaletteOpen: false,
  addAgentOpen: false,
  addAgentTaskId: null,
  taskChatTargetIndex: 0,
}

const loadPersistedState = (): Partial<WorkspaceState> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

// ── Context ──

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export const WorkspaceProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(reducer, defaultState, (initial) => ({
    ...initial,
    ...loadPersistedState(),
  }))

  useEffect(() => {
    const persisted: Partial<WorkspaceState> = {
      layoutMode: state.layoutMode,
      panelCollapsed: state.panelCollapsed,
      terminalOpen: state.terminalOpen,
      activeIdeTab: state.activeIdeTab,
      expandedTasks: state.expandedTasks,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted))
  }, [state.layoutMode, state.panelCollapsed, state.terminalOpen, state.activeIdeTab, state.expandedTasks])

  const selectAgent = useCallback((agentId: string) => dispatch({ type: 'SELECT_AGENT', agentId }), [])
  const openTaskOverview = useCallback((taskId: string) => dispatch({ type: 'OPEN_TASK_OVERVIEW', taskId }), [])
  const setLayoutMode = useCallback((mode: LayoutMode) => dispatch({ type: 'SET_LAYOUT_MODE', mode }), [])
  const cycleLayoutMode = useCallback(() => dispatch({ type: 'CYCLE_LAYOUT_MODE' }), [])
  const togglePanel = useCallback(() => dispatch({ type: 'TOGGLE_PANEL' }), [])
  const toggleTerminal = useCallback(() => dispatch({ type: 'TOGGLE_TERMINAL' }), [])
  const setIdeTab = useCallback((tab: IdeTab) => dispatch({ type: 'SET_IDE_TAB', tab }), [])
  const toggleTask = useCallback((taskId: string) => dispatch({ type: 'TOGGLE_TASK', taskId }), [])
  const openCommandPalette = useCallback(() => dispatch({ type: 'OPEN_COMMAND_PALETTE' }), [])
  const closeCommandPalette = useCallback(() => dispatch({ type: 'CLOSE_COMMAND_PALETTE' }), [])
  const openAddAgent = useCallback((taskId: string) => dispatch({ type: 'OPEN_ADD_AGENT', taskId }), [])
  const closeAddAgent = useCallback(() => dispatch({ type: 'CLOSE_ADD_AGENT' }), [])
  const cycleTargetAgent = useCallback((agentCount: number) => dispatch({ type: 'CYCLE_TARGET_AGENT', agentCount }), [])

  const value: WorkspaceContextValue = {
    ...state,
    selectAgent,
    openTaskOverview,
    setLayoutMode,
    cycleLayoutMode,
    togglePanel,
    toggleTerminal,
    setIdeTab,
    toggleTask,
    openCommandPalette,
    closeCommandPalette,
    openAddAgent,
    closeAddAgent,
    cycleTargetAgent,
  }

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export const useWorkspace = (): WorkspaceContextValue => {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider')
  return ctx
}
