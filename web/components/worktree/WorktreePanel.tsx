/**
 * WorktreePanel —  worktree
 *  worktree
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  GitBranch, ChevronDown, ChevronRight, RefreshCw, Trash2,
  GitMerge, ExternalLink, Loader2, FolderOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WorktreeSession } from '@/types/chat'
import MergeDialog from './MergeDialog'

import { API_BASE, authFetch } from '@/config/api'

interface Repository {
  id: string
  path: string
  name: string
}

interface StatusInfo {
  branch: string
  baseBranch: string
  aheadCount: number
  behindCount: number
  changedFiles: number
  untrackedFiles: number
}

interface WorktreePanelProps {
  sessions: WorktreeSession[]
  repositories: Repository[]
}

interface RepoGroup {
  repo: Repository
  sessions: WorktreeSession[]
}

const WorktreePanel = ({ sessions, repositories }: WorktreePanelProps) => {
  const { t } = useTranslation(['workspace', 'common'])
  const [expanded, setExpanded] = useState(false)
  const [statusMap, setStatusMap] = useState<Record<string, StatusInfo>>({})
  const [loadingStatus, setLoadingStatus] = useState(false)
  const [mergeTarget, setMergeTarget] = useState<{ path: string; branch: string; baseBranch: string } | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const groups = useMemo<RepoGroup[]>(() => {
    const map = new Map<string, WorktreeSession[]>()
    for (const s of sessions) {
      const list = map.get(s.repositoryId) ?? []
      list.push(s)
      map.set(s.repositoryId, list)
    }
    return Array.from(map.entries()).map(([repoId, repoSessions]) => ({
      repo: repositories.find((r) => r.id === repoId) ?? { id: repoId, path: '', name: repoId.slice(0, 8) },
      sessions: repoSessions,
    }))
  }, [sessions, repositories])

  const summaryText = useMemo(() => {
    const names = groups.map((g) => g.repo.name)
    return names.join(', ')
  }, [groups])

  const fetchAllStatus = useCallback(async () => {
    if (sessions.length === 0) return
    setLoadingStatus(true)
    try {
      const results = await Promise.allSettled(
        sessions.map(async (s) => {
          const res = await authFetch(`${API_BASE}/api/worktree/status?path=${encodeURIComponent(s.worktreePath)}`)
          if (!res.ok) return null
          const status: StatusInfo = await res.json()
          return { path: s.worktreePath, status }
        })
      )
      const newMap: Record<string, StatusInfo> = {}
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          newMap[r.value.path] = r.value.status
        }
      }
      setStatusMap(newMap)
    } catch { /* ignore */ } finally {
      setLoadingStatus(false)
    }
  }, [sessions])

  useEffect(() => {
    if (expanded) fetchAllStatus()
  }, [expanded, fetchAllStatus])

  if (sessions.length === 0) return null

  const handleDelete = async (path: string, force = false) => {
    const status = statusMap[path]
    if (!force && status && (status.changedFiles > 0 || status.untrackedFiles > 0)) {
      if (!window.confirm(t('workspace:worktree.confirmDeleteModified', { changed: status.changedFiles, untracked: status.untrackedFiles }))) return
      return handleDelete(path, true)
    }
    if (!force && status && status.aheadCount > 0) {
      if (!window.confirm(t('workspace:worktree.confirmDeleteUnmerged', { count: status.aheadCount }))) return
      return handleDelete(path, true)
    }

    setDeleting(path)
    try {
      await authFetch(`${API_BASE}/api/worktree/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worktreePath: path, force }),
      })
    } catch { /* ignore */ } finally {
      setDeleting(null)
    }
  }

  const handleMergeClick = (session: WorktreeSession) => {
    const status = statusMap[session.worktreePath]
    setMergeTarget({
      path: session.worktreePath,
      branch: session.branch,
      baseBranch: status?.baseBranch || session.baseBranch,
    })
  }

  return (
    <>
      <div className={cn(
        'shrink-0 border-b border-border-subtle bg-bg-secondary',
        expanded && 'shadow-sm',
      )}>
        <div className="w-full flex items-center gap-1.5 px-3 py-1.5 hover:bg-bg-hover transition-colors">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? 'Collapse worktrees' : 'Expand worktrees'}
            aria-expanded={expanded}
            className="min-w-0 flex flex-1 items-center gap-1.5 bg-transparent border-none cursor-pointer text-left"
          >
            {expanded ? <ChevronDown size={10} className="text-text-secondary shrink-0" /> : <ChevronRight size={10} className="text-text-secondary shrink-0" />}
            <GitBranch size={11} className="text-accent-green shrink-0" />
            <span className="text-xs text-text-secondary font-medium">{sessions.length}</span>
            <span className="text-xs text-text-secondary opacity-40">|</span>
            <span className="text-xs text-text-secondary truncate">{summaryText}</span>
          </button>
          <button
            type="button"
            onClick={() => fetchAllStatus()}
            aria-label={t('workspace:worktree.refresh')}
            title={t('workspace:worktree.refresh')}
            className="shrink-0 bg-transparent border-none cursor-pointer text-text-secondary p-0.5 rounded hover:text-text-primary transition-colors"
          >
            <RefreshCw size={10} className={cn(loadingStatus && 'animate-spin')} />
          </button>
        </div>

        {expanded && (
          <div className="px-3 pb-2 pt-0.5">
            {groups.map((group) => (
              group.sessions.map((session) => {
                const status = statusMap[session.worktreePath]
                const isActive = session.status === 'active'
                const isDeleting = deleting === session.worktreePath

                return (
                  <div
                    key={session.id}
                    className="group/wt relative flex items-center gap-1.5 rounded px-2 py-1 hover:bg-bg-hover transition-colors overflow-hidden"
                  >
                    {/* Repository/Branch */}
                    <FolderOpen size={10} className="text-text-secondary shrink-0" />
                    <span className="text-xs text-text-secondary truncate max-w-[90px] shrink-0">
                      {group.repo.name}
                    </span>
                    <span className="text-text-secondary opacity-30 text-xs shrink-0">/</span>
                    <GitBranch size={10} className={cn('shrink-0', isActive ? 'text-accent-green' : 'text-text-secondary')} />
                    <span className={cn(
                      'text-xs font-mono font-medium truncate',
                      isActive ? 'text-accent-green' : 'text-text-primary',
                    )} title={session.branch}>
                      {session.branch}
                    </span>
                    {session.status !== 'active' && (
                      <span className={cn(
                        'text-xs px-1 rounded-sm shrink-0',
                        session.status === 'merged' ? 'text-accent-brand bg-accent-brand/10' : 'text-text-secondary bg-bg-hover-muted',
                      )}>
                        {session.status}
                      </span>
                    )}
                    <span className="text-xs text-text-secondary shrink-0" title={session.baseBranch}>← {session.baseBranch}</span>
                    {status?.aheadCount ? <span className="text-xs text-accent-green shrink-0">+{status.aheadCount}</span> : null}
                    {status?.changedFiles ? <span className="text-xs text-text-secondary shrink-0">{status.changedFiles}f</span> : null}
                    <div
                      className={cn(
                        'absolute right-0 top-0 bottom-0 flex items-center gap-0.5 px-1.5',
                        'opacity-0 group-hover/wt:opacity-100 transition-opacity',
                      )}
                      style={{ background: 'linear-gradient(to left, rgb(var(--bg-secondary)) 60%, transparent)' }}
                    >
                      <SmallBtn onClick={() => handleOpenIde(session.worktreePath)} title="Open in IDE" aria-label="Open in IDE">
                        <ExternalLink size={10} />
                      </SmallBtn>
                      {isActive && (
                        <>
                          <SmallBtn onClick={() => handleMergeClick(session)} title={t('workspace:worktree.mergeToMain')} aria-label={`Merge ${session.branch}`}>
                            <GitMerge size={10} />
                          </SmallBtn>
                          <SmallBtn onClick={() => handleDelete(session.worktreePath)} title={t('workspace:worktree.deleteWorktree')} aria-label={`Delete ${session.branch}`} danger disabled={isDeleting}>
                            {isDeleting ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
                          </SmallBtn>
                        </>
                      )}
                    </div>
                  </div>
                )
              })
            ))}
          </div>
        )}
      </div>

      {mergeTarget && (
        <MergeDialog
          open={!!mergeTarget}
          worktreePath={mergeTarget.path}
          branch={mergeTarget.branch}
          baseBranch={mergeTarget.baseBranch}
          onClose={() => setMergeTarget(null)}
          onMerged={() => { setMergeTarget(null); fetchAllStatus() }}
        />
      )}
    </>
  )
}

// ── helpers ──

const handleOpenIde = async (path: string) => {
  try {
    await authFetch(`${API_BASE}/api/open-in-ide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    })
  } catch { /* ignore */ }
}

const SmallBtn = ({ children, onClick, title, danger, disabled, ...rest }: {
  children: React.ReactNode
  onClick: () => void
  title: string
  danger?: boolean
  disabled?: boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    onClick={(e) => { e.stopPropagation(); onClick() }}
    title={title}
    disabled={disabled}
    tabIndex={0}
    className={cn(
      'p-1 rounded-sm transition-colors bg-transparent border-none',
      disabled
        ? 'cursor-not-allowed opacity-40'
        : cn(
            'cursor-pointer',
            danger
              ? 'text-text-muted hover:text-accent-red hover:bg-accent-red/[0.08]'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover-muted',
          ),
    )}
    onKeyDown={(e) => { if (e.key === 'Enter') onClick() }}
    {...rest}
  >
    {children}
  </button>
)

export default WorktreePanel
