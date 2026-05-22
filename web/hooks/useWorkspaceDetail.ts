import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { API_BASE, authFetch } from '@/config/api'
import type { Workspace, Chat, Repository } from '@/components/workspace/types'
import { useChatTabs } from '@/contexts/ChatTabContext'

export const useWorkspaceDetail = (workspaceId: string | undefined) => {
  const { t } = useTranslation(['workspace', 'common'])
  const navigate = useNavigate()
  const { closeTab } = useChatTabs()
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [chats, setChats] = useState<Chat[]>([])
  const [loading, setLoading] = useState(true)

  // New chat state
  const [newChatModalOpen, setNewChatModalOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  // Delete chat state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteChatId, setDeleteChatId] = useState<string | null>(null)

  // Rename state
  const [isEditingName, setIsEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Repo management state
  const [reposExpanded, setReposExpanded] = useState(true)
  const [addRepoOpen, setAddRepoOpen] = useState(false)
  const [repoSearch, setRepoSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Array<{ name: string; path: string }>>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [isGitRepo, setIsGitRepo] = useState<boolean | null>(null)
  const [addingRepo, setAddingRepo] = useState(false)
  const [removeRepoConfirm, setRemoveRepoConfirm] = useState<Repository | null>(null)
  const [cleanRepoConfirm, setCleanRepoConfirm] = useState<Repository | null>(null)
  const [cleaning, setCleaning] = useState(false)
  const [pendingChangesKey, setPendingChangesKey] = useState(0)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const fetchWorkspace = useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    try {
      const [wsRes, chatsRes] = await Promise.all([
        authFetch(`${API_BASE}/api/workspaces/${workspaceId}`),
        authFetch(`${API_BASE}/api/workspaces/${workspaceId}/chats`),
      ])
      if (!wsRes.ok) throw new Error()
      setWorkspace(await wsRes.json())
      if (chatsRes.ok) setChats(await chatsRes.json())
    } catch {
      toast.error(t('workspace:loadFailed'))
      navigate('/')
    } finally {
      setLoading(false)
    }
  }, [workspaceId, navigate])

  useEffect(() => { fetchWorkspace() }, [fetchWorkspace])

  const handleCreateChat = async (title: string, model: string) => {
    setCreating(true)
    try {
      const res = await authFetch(`${API_BASE}/api/workspaces/${workspaceId}/chats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || t('workspace:newChat.title'),
          model,
        }),
      })
      if (!res.ok) throw new Error()
      const chat: Chat = await res.json()
      setNewChatModalOpen(false)
      navigate(`/workspace/${workspaceId}/chat/${chat.id}`, {
        state: { isNew: true, agentId: workspace?.agentTeam?.primaryAgentId },
      })
    } catch {
      toast.error(t('workspace:newChat.createFailed'))
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteChat = (chatId: string) => {
    setDeleteChatId(chatId)
    setDeleteConfirmOpen(true)
  }

  const confirmDeleteChat = async () => {
    if (!deleteChatId) return
    try {
      await authFetch(`${API_BASE}/api/chats/${deleteChatId}`, { method: 'DELETE' })
      setChats((prev) => prev.filter((c) => c.id !== deleteChatId))
      closeTab(deleteChatId)
      setPendingChangesKey((k) => k + 1)
    } catch {
      toast.error(t('workspace:deleteChat.deleteFailed'))
    } finally {
      setDeleteConfirmOpen(false)
      setDeleteChatId(null)
    }
  }

  const handleUpdateTeam = async (team: { primaryAgentId: string; teamAgentIds: string[] }) => {
    try {
      const res = await authFetch(`${API_BASE}/api/workspaces/${workspaceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentTeam: team }),
      })
      if (res.ok) {
        setWorkspace((prev) => prev ? { ...prev, agentTeam: team } : prev)
      }
    } catch {
      toast.error(t('workspace:updateTeamFailed'))
    }
  }

  const startRenamingWorkspace = () => {
    if (!workspace) return
    setNameDraft(workspace.name)
    setIsEditingName(true)
    setTimeout(() => nameInputRef.current?.focus(), 0)
  }

  const handleNameSave = async () => {
    const trimmed = nameDraft.trim()
    setIsEditingName(false)
    if (!trimmed || !workspace || trimmed === workspace.name) return
    try {
      const res = await authFetch(`${API_BASE}/api/workspaces/${workspaceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      if (!res.ok) throw new Error()
      setWorkspace((prev) => prev ? { ...prev, name: trimmed } : prev)
      toast.success(t('workspace:renamed'))
    } catch {
      toast.error(t('workspace:renameFailed'))
    }
  }

  const handleNameCancel = () => {
    setIsEditingName(false)
  }

  const handleWorktreeToggle = async (enabled: boolean) => {
    try {
      const res = await authFetch(`${API_BASE}/api/workspaces/${workspaceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worktreeEnabled: enabled }),
      })
      if (!res.ok) throw new Error()
      setWorkspace((prev) => prev ? { ...prev, worktreeEnabled: enabled } : prev)
      toast.success(enabled ? t('workspace:worktreeEnabledOn') : t('workspace:worktreeEnabledOff'))
    } catch {
      toast.error(t('workspace:worktreeToggleFailed'))
    }
  }

  // Repo management handlers

  const handleRepoSearchChange = (value: string) => {
    setRepoSearch(value)
    setSelectedPath(null)
    setIsGitRepo(null)

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    if (!value.trim()) {
      setSearchResults([])
      return
    }

    searchTimerRef.current = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const endpoint = value.startsWith('/')
          ? `${API_BASE}/api/search-dirs?q=${encodeURIComponent(value)}`
          : `${API_BASE}/api/search-dirs?q=${encodeURIComponent(value)}`
        const res = await authFetch(endpoint)
        if (res.ok) {
          const data = await res.json()
          setSearchResults(data.results || data.dirs || [])
        }
      } catch { /* ignore */ } finally {
        setSearchLoading(false)
      }
    }, 300)
  }

  const handleSelectPath = async (path: string) => {
    setSelectedPath(path)
    setDetecting(true)
    setIsGitRepo(null)
    try {
      const res = await authFetch(`${API_BASE}/api/git/detect?path=${encodeURIComponent(path)}`)
      if (res.ok) {
        const info = await res.json()
        setIsGitRepo(info.isGit)
      }
    } catch { /* ignore */ } finally {
      setDetecting(false)
    }
  }

  const handleAddRepo = async () => {
    if (!selectedPath || !workspaceId) return
    setAddingRepo(true)
    try {
      const res = await authFetch(`${API_BASE}/api/workspaces/${workspaceId}/repositories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: selectedPath }),
      })
      if (res.status === 409) {
        toast.error(t('workspace:repo.alreadyExists'))
        return
      }
      if (!res.ok) throw new Error()
      const updated = await res.json()
      setWorkspace(updated)
      setAddRepoOpen(false)
      setRepoSearch('')
      setSearchResults([])
      setSelectedPath(null)
      setIsGitRepo(null)
      toast.success(t('workspace:repo.addSuccess'))
    } catch {
      toast.error(t('workspace:repo.addFailed'))
    } finally {
      setAddingRepo(false)
    }
  }

  const handleRemoveRepo = async () => {
    if (!removeRepoConfirm || !workspaceId) return
    try {
      const res = await authFetch(`${API_BASE}/api/workspaces/${workspaceId}/repositories/${removeRepoConfirm.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      setWorkspace(updated)
      toast.success(t('workspace:repo.removeSuccess'))
    } catch {
      toast.error(t('workspace:repo.removeFailed'))
    } finally {
      setRemoveRepoConfirm(null)
    }
  }

  const handleCleanWorktrees = async () => {
    if (!cleanRepoConfirm) return
    setCleaning(true)
    try {
      const res = await authFetch(`${API_BASE}/api/worktree/clean`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoRoot: cleanRepoConfirm.path }),
      })
      if (!res.ok) throw new Error()
      const { cleaned } = await res.json()
      toast.success(t('workspace:repo.cleanSuccess', { count: cleaned }))
      setPendingChangesKey((k) => k + 1)
    } catch {
      toast.error(t('workspace:repo.cleanFailed'))
    } finally {
      setCleaning(false)
      setCleanRepoConfirm(null)
    }
  }

  const handleOpenAddRepo = () => {
    setRepoSearch('')
    setSearchResults([])
    setSelectedPath(null)
    setIsGitRepo(null)
    setAddRepoOpen(true)
  }

  const pendingRepos = useMemo(
    () => workspace?.repositories.map((r) => ({ path: r.path, name: r.name })) ?? [],
    [workspace?.repositories],
  )

  return {
    // Core data
    workspace,
    chats,
    loading,
    t,
    navigate,

    // Rename
    isEditingName,
    nameDraft,
    setNameDraft,
    nameInputRef,
    startRenamingWorkspace,
    handleNameSave,
    handleNameCancel,

    // New chat
    newChatModalOpen,
    setNewChatModalOpen,
    creating,
    handleCreateChat,

    // Delete chat
    deleteConfirmOpen,
    setDeleteConfirmOpen,
    deleteChatId,
    handleDeleteChat,
    confirmDeleteChat,

    // Team
    handleUpdateTeam,

    // Worktree
    handleWorktreeToggle,

    // Repos
    reposExpanded,
    setReposExpanded,
    addRepoOpen,
    setAddRepoOpen,
    repoSearch,
    searchResults,
    searchLoading,
    selectedPath,
    detecting,
    isGitRepo,
    addingRepo,
    removeRepoConfirm,
    setRemoveRepoConfirm,
    cleanRepoConfirm,
    setCleanRepoConfirm,
    cleaning,
    pendingChangesKey,
    handleRepoSearchChange,
    handleSelectPath,
    handleAddRepo,
    handleRemoveRepo,
    handleCleanWorktrees,
    handleOpenAddRepo,
    pendingRepos,
  }
}
