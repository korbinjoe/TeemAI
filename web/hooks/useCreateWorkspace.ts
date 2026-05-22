import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { QuickItem, WorkspaceInfo } from '../components/home/types'
import { saveDirHistory } from '../components/home/storage'
import { API_BASE, authFetch } from '@/config/api'

interface UseCreateWorkspaceOptions {
  setWorkspaces: (ws: WorkspaceInfo[]) => void
  setSelectedQuickItem: (item: QuickItem) => void
  setDirHistory: (h: string[]) => void
  setDirModalOpen: (open: boolean) => void
  setPickingForCreateWs: (v: boolean) => void
  handleQuickLaunch: (item: QuickItem) => void
}

export const useCreateWorkspace = ({
  setWorkspaces,
  setSelectedQuickItem,
  setDirHistory,
  setDirModalOpen,
  setPickingForCreateWs,
  handleQuickLaunch,
}: UseCreateWorkspaceOptions) => {
  const { t } = useTranslation(['home', 'common'])

  const [createWsOpen, setCreateWsOpen] = useState(false)
  const [createWsName, setCreateWsName] = useState('')
  const [createWsRepos, setCreateWsRepos] = useState<string[]>([])
  const [creatingWs, setCreatingWs] = useState(false)

  const openCreateWsModal = () => {
    setCreateWsName('')
    setCreateWsRepos([])
    setCreateWsOpen(true)
  }

  const handleAddRepoToCreateWs = (path: string) => {
    setDirHistory(saveDirHistory(path))
    setDirModalOpen(false)
    setPickingForCreateWs(false)
    setCreateWsRepos((prev) => prev.includes(path) ? prev : [...prev, path])
    setCreateWsName((prev) => prev || path.split('/').pop() || '')
  }

  const handleRemoveRepoFromCreateWs = (path: string) => {
    setCreateWsRepos((prev) => prev.filter((p) => p !== path))
  }

  const handleCreateWorkspace = async (andStart: boolean) => {
    if (!createWsName.trim() || createWsRepos.length === 0) return
    setCreatingWs(true)
    try {
      const res = await authFetch(`${API_BASE}/api/workspaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createWsName.trim(),
          repositories: createWsRepos.map((p) => ({ path: p })),
        }),
      })
      if (!res.ok) throw new Error()
      const workspace = await res.json()
      const wsRes = await authFetch(`${API_BASE}/api/workspaces`)
      if (wsRes.ok) setWorkspaces(await wsRes.json())
      toast.success(t('home:createSuccess'))
      setCreateWsOpen(false)

      const newItem: QuickItem = {
        type: 'workspace',
        label: workspace.name,
        paths: createWsRepos,
        lastUsed: Date.now(),
        workspaceId: workspace.id,
      }
      setSelectedQuickItem(newItem)

      if (andStart) {
        handleQuickLaunch(newItem)
      }
    } catch {
      toast.error(t('home:createFailed'))
    } finally {
      setCreatingWs(false)
    }
  }

  return {
    createWsOpen, setCreateWsOpen,
    createWsName, setCreateWsName,
    createWsRepos, setCreateWsRepos,
    creatingWs,
    openCreateWsModal,
    handleAddRepoToCreateWs,
    handleRemoveRepoFromCreateWs,
    handleCreateWorkspace,
  }
}
