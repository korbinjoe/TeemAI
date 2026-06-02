import { createContext, useContext, useCallback, useState, useMemo, type ReactNode } from 'react'

interface DialogContextValue {
  newMissionOpen: boolean
  newMissionWorkspaceId: string | null
  commandPaletteOpen: boolean
  addAgentOpen: boolean
  addAgentTaskId: string | null

  openNewMission: (workspaceId?: string) => void
  closeNewMission: () => void
  openCommandPalette: () => void
  closeCommandPalette: () => void
  openAddAgent: (missionId: string) => void
  closeAddAgent: () => void
}

const DialogContext = createContext<DialogContextValue | null>(null)

export const DialogProvider = ({ children }: { children: ReactNode }) => {
  const [newMissionOpen, setNewMissionOpen] = useState(false)
  const [newMissionWorkspaceId, setNewMissionWorkspaceId] = useState<string | null>(null)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [addAgentOpen, setAddAgentOpen] = useState(false)
  const [addAgentTaskId, setAddAgentTaskId] = useState<string | null>(null)

  const openNewMission = useCallback((wsId?: string) => {
    setNewMissionOpen(true)
    setNewMissionWorkspaceId(wsId ?? null)
    setCommandPaletteOpen(false)
  }, [])

  const closeNewMission = useCallback(() => {
    setNewMissionOpen(false)
    setNewMissionWorkspaceId(null)
  }, [])

  const openCommandPalette = useCallback(() => setCommandPaletteOpen(true), [])
  const closeCommandPalette = useCallback(() => setCommandPaletteOpen(false), [])

  const openAddAgent = useCallback((missionId: string) => {
    setAddAgentOpen(true)
    setAddAgentTaskId(missionId)
  }, [])

  const closeAddAgent = useCallback(() => {
    setAddAgentOpen(false)
    setAddAgentTaskId(null)
  }, [])

  const value = useMemo<DialogContextValue>(() => ({
    newMissionOpen,
    newMissionWorkspaceId,
    commandPaletteOpen,
    addAgentOpen,
    addAgentTaskId,
    openNewMission,
    closeNewMission,
    openCommandPalette,
    closeCommandPalette,
    openAddAgent,
    closeAddAgent,
  }), [
    newMissionOpen, newMissionWorkspaceId,
    commandPaletteOpen,
    addAgentOpen, addAgentTaskId,
    openNewMission, closeNewMission,
    openCommandPalette, closeCommandPalette,
    openAddAgent, closeAddAgent,
  ])

  return <DialogContext.Provider value={value}>{children}</DialogContext.Provider>
}

export const useDialog = (): DialogContextValue => {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error('useDialog must be used within DialogProvider')
  return ctx
}
