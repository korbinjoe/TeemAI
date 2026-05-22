import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DEFAULT_MODEL, getModelsForProvider } from '@/lib/models'
import { isElectron, ELECTRON_TITLEBAR_PADDING } from '../utils/env'
import {
  getSelectedAgentId,
  setSelectedAgentId as persistSelectedAgentId,
} from '../utils/agentStorage'
import { setAgentOrder, sortAgents } from '../utils/teamStorage'
import { loadLastSession, loadDirHistory, saveDirHistory, loadLastHomeVisit, saveLastHomeVisit } from '../components/home/storage'
import { useHomeData } from '../hooks/useHomeData'
import { useDirPicker } from '../hooks/useDirPicker'
import { useQuickLaunch } from '../hooks/useQuickLaunch'
import { useCreateWorkspace } from '../hooks/useCreateWorkspace'
import { useHomeStats } from '../hooks/useHomeStats'
import LaunchCard from '../components/home/LaunchCard'
import StatsBar from '../components/home/StatsBar'
import RecentActivityPanel from '../components/home/RecentActivityPanel'
import WorkspaceListPanel from '../components/home/WorkspaceListPanel'
import DailyTokenOverview from '../components/home/DailyTokenOverview'
import CreateWorkspaceDialog from '../components/home/CreateWorkspaceDialog'
import DirPickerDialog from '../components/home/DirPickerDialog'
import RecapCard from '../components/home/RecapCard'

const HomePage = () => {
  const lastSession = useMemo(() => loadLastSession(), [])
  const [model, setModel] = useState(lastSession?.model ?? DEFAULT_MODEL)
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(
    () => lastSession?.agentId ?? getSelectedAgentId() ?? undefined,
  )
  const [dirHistory, setDirHistory] = useState<string[]>(() => loadDirHistory())
  const [lastHomeVisit] = useState(() => loadLastHomeVisit())
  const [recapDismissed, setRecapDismissed] = useState(false)

  // Data fetching + WebSocket
  const { workspaces, setWorkspaces, recentChats, agents, setAgents, loading } = useHomeData()

  // Stats
  const homeStats = useHomeStats()

  // Dir picker
  const dirPicker = useDirPicker(dirHistory)

  // Quick launch
  const quickLaunch = useQuickLaunch({
    dirHistory, setDirHistory, workspaces, agents, model, selectedAgentId, lastSession,
  })

  // Create workspace
  const createWs = useCreateWorkspace({
    setWorkspaces,
    setSelectedQuickItem: quickLaunch.setSelectedQuickItem,
    setDirHistory: (h: string[]) => setDirHistory(h),
    setDirModalOpen: dirPicker.setDirModalOpen,
    setPickingForCreateWs: dirPicker.setPickingForCreateWs,
    handleQuickLaunch: quickLaunch.handleQuickLaunch,
  })

  useEffect(() => {
    if (!loading) saveLastHomeVisit()
  }, [loading])

  useEffect(() => {
    if (selectedAgentId || agents.length === 0) return
    const defaultAgent = agents.find((a) => a.id === 'fullstack-product-engineer') || agents[0]
    if (!defaultAgent) return
    setSelectedAgentId(defaultAgent.name)
    persistSelectedAgentId(defaultAgent.name)
    const compatible = getModelsForProvider(defaultAgent.provider)
    if (!compatible.some((m) => m.value === model)) {
      setModel(compatible[0]?.value ?? DEFAULT_MODEL)
    }
  }, [agents, selectedAgentId, model])

  const handleAgentSelect = (agentName: string) => {
    setSelectedAgentId(agentName)
    persistSelectedAgentId(agentName)

    const agent = agents.find((a) => a.name === agentName)
    const compatible = getModelsForProvider(agent?.provider)
    if (!compatible.some((m) => m.value === model)) {
      setModel(compatible[0]?.value ?? DEFAULT_MODEL)
    }
  }

  const handleAgentReorder = (ids: string[]) => {
    setAgentOrder(ids)
    setAgents(sortAgents(agents))
  }

  const handlePickAndLaunch = (path: string) => {
    if (dirPicker.pickingForCreateWs) {
      createWs.handleAddRepoToCreateWs(path)
      return
    }
    setDirHistory(saveDirHistory(path))
    dirPicker.setDirModalOpen(false)
    quickLaunch.handleQuickLaunch({ type: 'repo', label: path, paths: [path], lastUsed: Date.now() })
  }

  const handleNewChat = () => {
    if (quickLaunch.selectedQuickItem) {
      quickLaunch.handleQuickLaunch(quickLaunch.selectedQuickItem)
    } else {
      dirPicker.openDirPicker()
    }
  }

  const handleQuickSelectRepo = (path: string) => {
    createWs.setCreateWsRepos((prev) => [...prev, path])
    createWs.setCreateWsName((prev) => prev || path.split('/').pop() || '')
  }

  return (
    <div className="flex flex-col h-full bg-bg-primary">
      {/* Header */}
      <div
        className={cn(
          'h-12 border-b border-white/[0.04] flex items-center px-4 gap-3 shrink-0 backdrop-blur-sm',
          isElectron && '-webkit-app-region-drag',
        )}
        style={{ paddingLeft: isElectron ? ELECTRON_TITLEBAR_PADDING : 16 }}
      >
        <span className="text-base font-nunito font-extrabold tracking-wide text-gradient-brand">
          OpenTeam
        </span>
        <span className="text-xs text-text-muted font-normal tracking-wider uppercase">
          AI Super-Individual OS
        </span>
        <span className="flex-1" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-8 py-5 md:py-6">
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-16 text-text-secondary text-sm">
              <Loader2 size={16} className="animate-spin" />
              Loading...
            </div>
          ) : (
            <div className="max-w-[1200px] mx-auto space-y-5">
              {!recapDismissed && (
                <RecapCard
                  chats={recentChats}
                  lastVisitTime={lastHomeVisit}
                  onDismiss={() => setRecapDismissed(true)}
                />
              )}

              <div className="md:hidden">
                <LaunchCard
                  selectedQuickItem={quickLaunch.selectedQuickItem}
                  setSelectedQuickItem={quickLaunch.setSelectedQuickItem}
                  quickDropdownOpen={quickLaunch.quickDropdownOpen}
                  setQuickDropdownOpen={quickLaunch.setQuickDropdownOpen}
                  quickSearch={quickLaunch.quickSearch}
                  setQuickSearch={quickLaunch.setQuickSearch}
                  filteredQuickItems={quickLaunch.filteredQuickItems}
                  comboboxRef={quickLaunch.comboboxRef}
                  displayedChips={quickLaunch.displayedChips}
                  displayedChipIds={quickLaunch.displayedChipIds}
                  sensors={quickLaunch.sensors}
                  handleSortEnd={quickLaunch.handleSortEnd}
                  handleRemoveQuickItem={quickLaunch.handleRemoveQuickItem}
                  agents={agents}
                  selectedAgentId={selectedAgentId}
                  onAgentSelect={handleAgentSelect}
                  onAgentReorder={handleAgentReorder}
                  model={model}
                  setModel={setModel}
                  launchingItem={quickLaunch.launchingItem}
                  onNewChat={handleNewChat}
                  onOpenCreateWsModal={createWs.openCreateWsModal}
                />
              </div>

              <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-1 min-w-0 space-y-5">
                  <StatsBar recentChats={recentChats} stats={homeStats} />
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm p-4">
                    <RecentActivityPanel recentChats={recentChats} workspaces={workspaces} agents={agents} />
                  </div>
                  <WorkspaceListPanel workspaces={workspaces} />
                  <DailyTokenOverview />
                </div>

                <div className="hidden md:block w-96 shrink-0 space-y-5">
                  <LaunchCard
                    selectedQuickItem={quickLaunch.selectedQuickItem}
                    setSelectedQuickItem={quickLaunch.setSelectedQuickItem}
                    quickDropdownOpen={quickLaunch.quickDropdownOpen}
                    setQuickDropdownOpen={quickLaunch.setQuickDropdownOpen}
                    quickSearch={quickLaunch.quickSearch}
                    setQuickSearch={quickLaunch.setQuickSearch}
                    filteredQuickItems={quickLaunch.filteredQuickItems}
                    comboboxRef={quickLaunch.comboboxRef}
                    displayedChips={quickLaunch.displayedChips}
                    displayedChipIds={quickLaunch.displayedChipIds}
                    sensors={quickLaunch.sensors}
                    handleSortEnd={quickLaunch.handleSortEnd}
                    handleRemoveQuickItem={quickLaunch.handleRemoveQuickItem}
                    agents={agents}
                    selectedAgentId={selectedAgentId}
                    onAgentSelect={handleAgentSelect}
                    onAgentReorder={handleAgentReorder}
                    model={model}
                    setModel={setModel}
                    launchingItem={quickLaunch.launchingItem}
                    onNewChat={handleNewChat}
                    onOpenCreateWsModal={createWs.openCreateWsModal}
                  />
                </div>
              </div>

              <div className="md:hidden">
                <DailyTokenOverview />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <CreateWorkspaceDialog
        open={createWs.createWsOpen}
        onOpenChange={createWs.setCreateWsOpen}
        name={createWs.createWsName}
        onNameChange={createWs.setCreateWsName}
        repos={createWs.createWsRepos}
        creating={createWs.creatingWs}
        dirHistory={dirHistory}
        onAddRepo={dirPicker.openDirPickerForCreateWs}
        onRemoveRepo={createWs.handleRemoveRepoFromCreateWs}
        onQuickSelectRepo={handleQuickSelectRepo}
        onCreate={createWs.handleCreateWorkspace}
      />

      <DirPickerDialog
        open={dirPicker.dirModalOpen}
        onOpenChange={(open) => { dirPicker.setDirModalOpen(open); if (!open) dirPicker.setPickingForCreateWs(false) }}
        browsePath={dirPicker.browsePath}
        homeDir={dirPicker.homeDir}
        dirs={dirPicker.dirs}
        loadingDirs={dirPicker.loadingDirs}
        dirSearch={dirPicker.dirSearch}
        onDirSearchChange={dirPicker.setDirSearch}
        searchResults={dirPicker.searchResults}
        searchLoading={dirPicker.searchLoading}
        newFolderMode={dirPicker.newFolderMode}
        onNewFolderModeChange={dirPicker.setNewFolderMode}
        newFolderName={dirPicker.newFolderName}
        onNewFolderNameChange={dirPicker.setNewFolderName}
        newFolderError={dirPicker.newFolderError}
        onNewFolderErrorChange={dirPicker.setNewFolderError}
        pickingForCreateWs={dirPicker.pickingForCreateWs}
        onLoadDirs={dirPicker.loadDirs}
        onPickAndLaunch={handlePickAndLaunch}
        onCreateFolder={() => dirPicker.handleCreateFolder(handlePickAndLaunch)}
      />
    </div>
  )
}

export default HomePage
