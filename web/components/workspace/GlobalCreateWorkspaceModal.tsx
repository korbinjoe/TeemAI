import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { API_BASE, authFetch } from '@/config/api'
import { WS_EVENTS } from '@/hooks/useWorkspaceEvents'
import CreateWorkspaceDialog from '@/components/home/CreateWorkspaceDialog'
import DirPickerDialog from '@/components/home/DirPickerDialog'
import { useDirPicker } from '@/hooks/useDirPicker'
import { loadDirHistory, saveDirHistory } from '@/components/home/storage'

export const GlobalCreateWorkspaceModal = () => {
  const navigate = useNavigate()
  const { t } = useTranslation(['workspace', 'home', 'common'])
  
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [repos, setRepos] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  
  const [dirHistory, setDirHistory] = useState<string[]>(() => loadDirHistory())
  const dirPicker = useDirPicker(dirHistory)

  useEffect(() => {
    const handleOpen = () => {
      setName('')
      setRepos([])
      setOpen(true)
    }
    window.addEventListener(WS_EVENTS.OPEN_CREATE_MODAL, handleOpen)
    return () => window.removeEventListener(WS_EVENTS.OPEN_CREATE_MODAL, handleOpen)
  }, [])

  const handleCreate = async (andStart: boolean) => {
    if (!name.trim() || repos.length === 0) return
    setCreating(true)
    try {
      const res = await authFetch(`${API_BASE}/api/workspaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          repositories: repos.map((p) => ({ path: p })),
        }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Create workspace failed')
      }
      const ws = await res.json()
      toast.success(t('workspace:list.created'))
      setOpen(false)

      window.dispatchEvent(new CustomEvent(WS_EVENTS.CREATED, { detail: ws }))

      if (andStart) {
        // Navigate to the newly created workspace
        navigate(`/workspace/${ws.id}`)
      }
    } catch {
      toast.error(t('workspace:list.createFailed'))
    } finally {
      setCreating(false)
    }
  }

  const handleAddRepo = () => {
    dirPicker.openDirPickerForCreateWs()
  }

  const handlePickDir = (path: string) => {
    setDirHistory(saveDirHistory(path))
    dirPicker.setDirModalOpen(false)
    dirPicker.setPickingForCreateWs(false)
    setRepos((prev) => prev.includes(path) ? prev : [...prev, path])
    setName((prev) => prev || path.split('/').pop() || '')
  }

  const handleQuickSelectRepo = (path: string) => {
    setRepos((prev) => prev.includes(path) ? prev : [...prev, path])
    setName((prev) => prev || path.split('/').pop() || '')
  }

  return (
    <>
      <CreateWorkspaceDialog
        open={open}
        onOpenChange={setOpen}
        name={name}
        onNameChange={setName}
        repos={repos}
        creating={creating}
        dirHistory={dirHistory}
        onAddRepo={handleAddRepo}
        onRemoveRepo={(path) => setRepos(prev => prev.filter(p => p !== path))}
        onQuickSelectRepo={handleQuickSelectRepo}
        onCreate={handleCreate}
      />

      <DirPickerDialog
        open={dirPicker.dirModalOpen}
        onOpenChange={(isOpen) => { dirPicker.setDirModalOpen(isOpen); if (!isOpen) dirPicker.setPickingForCreateWs(false) }}
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
        onPickAndLaunch={handlePickDir}
        onCreateFolder={() => dirPicker.handleCreateFolder(handlePickDir)}
      />
    </>
  )
}
