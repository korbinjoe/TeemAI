import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  ArrowLeft, FolderGit2, MessageSquare, Plus, Pencil,
  Trash2, GitBranch, ExternalLink, Copy, Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { API_BASE, authFetch } from '@/config/api'
import WorkspaceIcon from '@/components/icons/WorkspaceIcon'
import EditWorkspaceDialog from '@/components/workspace/EditWorkspaceDialog'
import DirPickerDialog from '@/components/home/DirPickerDialog'
import { loadDirHistory } from '@/components/home/storage'
import { useDirPicker } from '../hooks/useDirPicker'
import { isElectron, ELECTRON_TITLEBAR_PADDING } from '../utils/env'

interface Repository {
  id: string
  path: string
  name: string
}

interface WorkspaceDetail {
  id: string
  name: string
  repositories: Repository[]
  agentTeam?: { primaryAgentId: string; teamAgentIds: string[] }
  worktreeEnabled?: boolean
  lastAccessedAt: string
  createdAt: string
  chatCount?: number
}

const WorkspaceDetailPage = () => {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation(['workspace', 'common'])
  const [workspace, setWorkspace] = useState<WorkspaceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [dirHistory] = useState<string[]>(() => loadDirHistory())
  const dirPicker = useDirPicker(dirHistory)
  const [pendingDirCallback, setPendingDirCallback] = useState<((path: string) => void) | null>(null)

  const fetchWorkspace = useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    try {
      const res = await authFetch(`${API_BASE}/api/workspaces/${workspaceId}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      const countRes = await authFetch(`${API_BASE}/api/workspaces`)
      if (countRes.ok) {
        const all = await countRes.json()
        const match = all.find((w: { id: string; chatCount?: number }) => w.id === workspaceId)
        if (match) data.chatCount = match.chatCount
      }
      setWorkspace(data)
    } catch {
      toast.error('Failed to load workspace')
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => { fetchWorkspace() }, [fetchWorkspace])

  const handleNewMission = () => {
    if (workspaceId) navigate(`/workspace/${workspaceId}`)
  }

  const handleViewMissions = () => {
    if (workspaceId) navigate(`/workspace/${workspaceId}`)
  }

  const handleToggleWorktree = async () => {
    if (!workspaceId || !workspace) return
    const next = !workspace.worktreeEnabled
    try {
      const res = await authFetch(`${API_BASE}/api/workspaces/${workspaceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worktreeEnabled: next }),
      })
      if (!res.ok) throw new Error()
      setWorkspace({ ...workspace, worktreeEnabled: next })
      toast.success(`Worktree isolation ${next ? 'enabled' : 'disabled'}`)
    } catch {
      toast.error('Failed to update worktree setting')
    }
  }

  const handleEditSave = async (name: string, repos: Repository[]) => {
    if (!workspaceId) return
    setEditSaving(true)
    try {
      const res = await authFetch(`${API_BASE}/api/workspaces/${workspaceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, repositories: repos }),
      })
      if (!res.ok) throw new Error()
      toast.success(t('workspace:editDialog.saved'))
      setEditOpen(false)
      fetchWorkspace()
    } catch {
      toast.error(t('workspace:editDialog.saveFailed'))
    } finally {
      setEditSaving(false)
    }
  }

  const handleBrowseDir = (onPick: (path: string) => void) => {
    if (isElectron && window.teemaiBridge?.pickDirectory) {
      window.teemaiBridge.pickDirectory().then((path) => {
        if (path) onPick(path)
      })
    } else {
      setPendingDirCallback(() => onPick)
      dirPicker.openDirPicker()
    }
  }

  const handleDirPicked = (path: string) => {
    dirPicker.setDirModalOpen(false)
    if (pendingDirCallback) {
      pendingDirCallback(path)
      setPendingDirCallback(null)
    }
  }

  const handleDelete = async () => {
    if (!workspaceId || workspace?.id === 'default') return
    if (!confirm(`Delete workspace "${workspace?.name}"? This cannot be undone.`)) return
    try {
      const res = await authFetch(`${API_BASE}/api/workspaces/${workspaceId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Workspace deleted')
      navigate('/workspaces')
    } catch {
      toast.error('Failed to delete workspace')
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
        <div className="w-5 h-5 border-2 border-border-subtle border-t-accent-brand rounded-full animate-spin" />
      </div>
    )
  }

  if (!workspace) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-text-muted">
        <WorkspaceIcon size={32} className="opacity-30" />
        <span className="text-sm">Workspace not found</span>
        <button
          onClick={() => navigate('/workspaces')}
          className="text-xs text-accent-brand hover:underline"
        >
          Back to workspaces
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-bg-primary">
      {/* Header bar */}
      <div
        className={cn(
          'h-9 border-b border-border-subtle flex items-center px-2.5 gap-2 shrink-0',
          isElectron && '-webkit-app-region-drag',
        )}
        style={{ paddingLeft: isElectron ? ELECTRON_TITLEBAR_PADDING : 14 }}
      >
        <button
          onClick={() => navigate('/workspaces')}
          className="-webkit-app-region-no-drag flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary transition-colors"
        >
          <ArrowLeft size={12} />
          Workspaces
        </button>
        <span className="text-text-muted/50 text-xs">/</span>
        <WorkspaceIcon size={13} className="text-text-emphasis" />
        <span className="text-xs font-semibold text-text-emphasis truncate">
          {workspace.name}
        </span>
        <span className="flex-1" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[680px] mx-auto px-6 py-8">
          {/* Hero */}
          <div className="mb-8">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-accent-brand/20 to-accent-purple/20 border border-accent-brand/20 flex items-center justify-center">
                  <WorkspaceIcon size={20} className="text-accent-brand-light" />
                </div>
                <div>
                  <h1 className="text-[18px] font-bold text-text-emphasis leading-tight">{workspace.name}</h1>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[11px] text-text-muted">
                      Created {formatRelative(workspace.createdAt)}
                    </span>
                    <span className="text-text-muted/30">·</span>
                    <span className="text-[11px] text-text-muted">
                      Active {formatRelative(workspace.lastAccessedAt)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditOpen(true)}
                  title="Edit workspace"
                  className="-webkit-app-region-no-drag inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-[13px] font-medium text-text-primary hover:bg-bg-hover transition-colors"
                >
                  <Pencil size={13} />
                  Edit
                </button>
                <button
                  onClick={handleNewMission}
                  className="-webkit-app-region-no-drag inline-flex items-center gap-1.5 rounded-md bg-accent-brand px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-brand-light transition-colors shadow-sm shadow-accent-brand/20"
                >
                  <Plus size={14} />
                  New Mission
                </button>
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 gap-3 mb-8">
            <StatCard
              icon={<FolderGit2 size={14} />}
              label="Repos"
              value={workspace.repositories.length}
              color="brand"
            />
            <button onClick={handleViewMissions} className="text-left">
              <StatCard
                icon={<MessageSquare size={14} />}
                label="Missions"
                value={workspace.chatCount ?? 0}
                color="purple"
                clickable
              />
            </button>
          </div>

          {/* Repositories */}
          <section className="mb-7">
            <SectionHeader icon={<FolderGit2 size={12} />} title="Repositories" />
            {workspace.repositories.length === 0 ? (
              <EmptyState text="No repositories linked" />
            ) : (
              <div className="space-y-2">
                {workspace.repositories.map((repo) => (
                  <RepoCard key={repo.id} repo={repo} />
                ))}
              </div>
            )}
          </section>

          {/* Metadata */}
          <section className="mb-7">
            <SectionHeader icon={<GitBranch size={12} />} title="Details" />
            <div className="rounded-lg border border-border-subtle bg-bg-secondary/50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle/50">
                <div>
                  <span className="text-[11px] text-text-muted">Worktree Isolation</span>
                  <p className="text-[10px] text-text-muted/70 mt-0.5">Each mission gets its own git branch</p>
                </div>
                <Toggle checked={!!workspace.worktreeEnabled} onChange={handleToggleWorktree} />
              </div>
              <MetaRow label="Workspace ID" value={workspace.id} mono copyable />
              <MetaRow label="Created" value={formatDate(workspace.createdAt)} />
              <MetaRow label="Last Active" value={formatDate(workspace.lastAccessedAt)} last />
            </div>
          </section>

          {/* Danger zone */}
          {workspace.id !== 'default' && (
            <section>
              <div className="rounded-lg border border-accent-red/20 bg-accent-red/[0.03] p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-text-primary">Delete this workspace</span>
                    <p className="text-[11px] text-text-muted mt-0.5">
                      Permanently removes the workspace and its configuration. Missions are preserved.
                    </p>
                  </div>
                  <button
                    onClick={handleDelete}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-accent-red/30 text-xs font-medium text-accent-red hover:bg-accent-red/10 transition-colors"
                  >
                    <Trash2 size={11} />
                    Delete
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>

      {workspace && (
        <EditWorkspaceDialog
          open={editOpen}
          onOpenChange={(open) => {
            if (!open && dirPicker.dirModalOpen) return
            setEditOpen(open)
          }}
          workspaceId={workspace.id}
          initialName={workspace.name}
          initialRepos={workspace.repositories}
          saving={editSaving}
          onSave={handleEditSave}
          onBrowseDir={handleBrowseDir}
        />
      )}

      <DirPickerDialog
        open={dirPicker.dirModalOpen}
        onOpenChange={dirPicker.setDirModalOpen}
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
        pickingForCreateWs={false}
        onLoadDirs={dirPicker.loadDirs}
        onPickAndLaunch={handleDirPicked}
        onCreateFolder={() => dirPicker.handleCreateFolder(handleDirPicked)}
      />
    </div>
  )
}

const StatCard = ({ icon, label, value, color, clickable }: {
  icon: React.ReactNode
  label: string
  value: number
  color: 'brand' | 'purple'
  clickable?: boolean
}) => {
  const colorMap = {
    brand: 'from-accent-brand/10 to-accent-brand/5 border-accent-brand/15',
    purple: 'from-accent-purple/10 to-accent-purple/5 border-accent-purple/15',
  }
  const iconColorMap = {
    brand: 'text-accent-brand-light',
    purple: 'text-accent-purple',
  }
  return (
    <div className={cn(
      'relative rounded-lg border bg-gradient-to-br px-4 py-3.5 overflow-hidden',
      colorMap[color],
      clickable && 'hover:brightness-125 transition-all cursor-pointer',
    )}>
      <div className={cn('mb-1', iconColorMap[color])}>{icon}</div>
      <div className="text-[22px] font-bold text-text-emphasis tabular-nums leading-none">{value}</div>
      <div className="text-[10px] text-text-muted mt-1 uppercase tracking-wider font-medium">{label}</div>
    </div>
  )
}

const SectionHeader = ({ icon, title }: { icon: React.ReactNode; title: string }) => (
  <div className="flex items-center gap-1.5 mb-3">
    <span className="text-text-muted">{icon}</span>
    <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">{title}</span>
  </div>
)

const EmptyState = ({ text }: { text: string }) => (
  <div className="rounded-lg border border-dashed border-border-subtle py-6 flex items-center justify-center">
    <span className="text-xs text-text-muted">{text}</span>
  </div>
)

const RepoCard = ({ repo }: { repo: Repository }) => (
  <div className="group flex items-center gap-3 px-3.5 py-2.5 rounded-lg border border-border-subtle bg-bg-secondary/50 hover:bg-bg-hover-subtle hover:border-border transition-all">
    <div className="w-8 h-8 rounded-md bg-bg-hover flex items-center justify-center shrink-0">
      <FolderGit2 size={14} className="text-text-secondary" />
    </div>
    <div className="flex flex-col min-w-0 flex-1">
      <span className="text-[13px] font-semibold text-text-primary truncate">{repo.name}</span>
      <span className="text-[11px] text-text-muted truncate font-mono">{repo.path}</span>
    </div>
    <ExternalLink size={12} className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
  </div>
)

const MetaRow = ({ label, value, mono, copyable, last }: {
  label: string
  value: string
  mono?: boolean
  copyable?: boolean
  last?: boolean
}) => {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className={cn(
      'flex items-center justify-between px-4 py-2.5',
      !last && 'border-b border-border-subtle/50',
    )}>
      <span className="text-[11px] text-text-muted">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className={cn(
          'text-[12px] text-text-primary',
          mono && 'font-mono text-[11px] text-text-secondary',
        )}>
          {value}
        </span>
        {copyable && (
          <button
            onClick={handleCopy}
            className="p-0.5 rounded text-text-muted hover:text-text-primary transition-colors"
            title="Copy"
          >
            {copied ? <Check size={10} className="text-accent-green" /> : <Copy size={10} />}
          </button>
        )}
      </div>
    </div>
  )
}

const Toggle = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={onChange}
    className={cn(
      'relative inline-flex h-[18px] w-[32px] shrink-0 rounded-full transition-colors',
      checked ? 'bg-accent-brand' : 'bg-bg-hover border border-border-subtle',
    )}
  >
    <span className={cn(
      'pointer-events-none inline-block h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform mt-[1.5px]',
      checked ? 'translate-x-[15px]' : 'translate-x-[2px]',
    )} />
  </button>
)

const formatDate = (dateStr: string | undefined): string => {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const formatRelative = (dateStr: string | undefined): string => {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`
  return formatDate(dateStr)
}

export default WorkspaceDetailPage
