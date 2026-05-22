import { useEffect } from 'react'
import { WorkspaceProvider, useWorkspace } from '../contexts/WorkspaceContext'
import TaskSidebar from '../components/workspace-v2/TaskSidebar'
import WorkspaceToolbar from '../components/workspace-v2/WorkspaceToolbar'
import WorkspaceContent from '../components/workspace-v2/WorkspaceContent'
import WorkspaceStatusBar from '../components/workspace-v2/WorkspaceStatusBar'
import CommandPalette from '../components/workspace-v2/CommandPalette'
import AddAgentPicker from '../components/workspace-v2/AddAgentPicker'
import useResponsiveLayout from '../components/workspace-v2/useResponsiveLayout'

const MOCK_AGENT_IDS = ['agent-1', 'agent-2', 'agent-3', 'agent-4']

const WorkspaceLayoutInner = () => {
  const {
    panelCollapsed,
    commandPaletteOpen,
    addAgentOpen,
    openCommandPalette,
    closeCommandPalette,
    closeAddAgent,
    cycleLayoutMode,
    selectAgent,
    togglePanel,
    toggleTerminal,
  } = useWorkspace()

  useResponsiveLayout()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey

      if (e.key === 'Escape') {
        if (commandPaletteOpen) closeCommandPalette()
        else if (addAgentOpen) closeAddAgent()
        return
      }

      if (!mod) return

      if (e.key === 'k') {
        e.preventDefault()
        openCommandPalette()
      } else if (e.key === '\\') {
        e.preventDefault()
        cycleLayoutMode()
      } else if (e.key === 'b') {
        e.preventDefault()
        togglePanel()
      } else if (e.key === '`') {
        e.preventDefault()
        toggleTerminal()
      } else if (e.key >= '1' && e.key <= '4') {
        e.preventDefault()
        const idx = parseInt(e.key) - 1
        if (MOCK_AGENT_IDS[idx]) selectAgent(MOCK_AGENT_IDS[idx])
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [
    commandPaletteOpen,
    addAgentOpen,
    openCommandPalette,
    closeCommandPalette,
    closeAddAgent,
    cycleLayoutMode,
    selectAgent,
    togglePanel,
    toggleTerminal,
  ])

  return (
    <div className="flex h-screen bg-bg-primary overflow-hidden">
      <TaskSidebar collapsed={panelCollapsed} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <WorkspaceToolbar />
        <WorkspaceContent />
        <WorkspaceStatusBar />
      </div>
      <CommandPalette />
      <AddAgentPicker />
    </div>
  )
}

const WorkspaceLayout = () => (
  <WorkspaceProvider>
    <WorkspaceLayoutInner />
  </WorkspaceProvider>
)

export default WorkspaceLayout
