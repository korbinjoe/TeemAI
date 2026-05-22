/**
 * Worktree
 *  worktreesIDE
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { GitBranch, ChevronLeft, ChevronRight, RefreshCw, Trash2, GitMerge, ExternalLink, Loader2, FolderOpen } from 'lucide-react'
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

interface WorktreeSidebarProps {
  sessions: WorktreeSession[]
  repositories: Repository[]
  collapsed: boolean
  onToggle: () => void
}

interface RepoGroup {
  repo: Repository
  sessions: WorktreeSession[]
}

const SIDEBAR_WIDTH = 220

const WorktreeSidebar = ({
  sessions,
  repositories,
  collapsed,
  onToggle,
}: WorktreeSidebarProps) => {
  const { t } = useTranslation(['workspace', 'common'])
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

  useEffect(() => { fetchAllStatus() }, [fetchAllStatus])

  const handleDelete = async (path: string, force = false) => {
    const status = statusMap[path]
    if (!force && status && (status.changedFiles > 0 || status.untrackedFiles > 0)) {
      const confirmed = window.confirm(
        t('workspace:worktree.confirmDeleteModified', { changed: status.changedFiles, untracked: status.untrackedFiles })
      )
      if (!confirmed) return
      return handleDelete(path, true)
    }

    if (!force && status && status.aheadCount > 0) {
      const confirmed = window.confirm(
        t('workspace:worktree.confirmDeleteUnmerged', { count: status.aheadCount })
      )
      if (!confirmed) return
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

  const handleMerged = () => {
    setMergeTarget(null)
    fetchAllStatus()
  }

  if (collapsed) {
    return (
      <div className="w-7 shrink-0 border-r border-border-subtle flex flex-col items-center pt-2">
        <button
          onClick={onToggle}
          title={t('workspace:worktree.expandPanel')}
          aria-label="Expand worktrees panel"
          tabIndex={0}
          className="bg-transparent border-none cursor-pointer text-text-secondary p-1 flex rounded"
          onKeyDown={(e) => { if (e.key === 'Enter') onToggle() }}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="shrink-0 border-r border-border-subtle flex flex-col overflow-hidden" style={{ width: SIDEBAR_WIDTH }}>
        {/* Title bar */}
        <div className="h-8 shrink-0 flex items-center justify-between px-2 border-b border-border-subtle">
          <span className="flex items-center gap-1 text-xs text-text-secondary font-semibold">
            <GitBranch size={12} />
            Worktrees
            <span className="text-text-secondary font-normal">({sessions.length})</span>
          </span>
          <div className="flex gap-0.5">
            <SidebarBtn onClick={fetchAllStatus} title={t('workspace:worktree.refresh')} loading={loadingStatus}>
              <RefreshCw size={12} className={cn(loadingStatus && 'animate-spin')} />
            </SidebarBtn>
            <SidebarBtn onClick={onToggle} title={t('workspace:worktree.collapse')}>
              <ChevronLeft size={12} />
            </SidebarBtn>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {groups.map((group, gIdx) => (
            <div key={group.repo.id} className={cn(gIdx > 0 && 'mt-1 pt-1 border-t border-border-subtle')}>
              <div className="flex items-center gap-1.5 px-2.5 py-1.5">
                <FolderOpen size={11} className="text-text-secondary shrink-0" />
                <span className="text-xs font-medium text-text-secondary truncate">
                  {group.repo.name}
                </span>
              </div>

              {group.sessions.map((session) => {
                const status = statusMap[session.worktreePath]
                const isDeleting = deleting === session.worktreePath
                const isActive = session.status === 'active'

                return (
                  <div
                    key={session.id}
                    className={cn(
                      'group/item py-2 px-2 mx-1 rounded-md transition-colors border-l-2',
                      isActive
                        ? 'bg-accent-green/[0.06] border-l-accent-green'
                        : session.status === 'merged'
                          ? 'bg-accent-brand/[0.06] border-l-accent-brand'
                          : 'bg-transparent border-l-transparent',
                      'hover:bg-bg-hover-subtle',
                    )}
                  >
                    <div className="flex items-center gap-1.5 pl-1">
                      <GitBranch size={10} className={cn(
                        'shrink-0',
                        isActive ? 'text-accent-green' : 'text-text-secondary',
                      )} />
                      <span className={cn(
                        'text-xs font-mono font-medium truncate flex-1',
                        isActive ? 'text-accent-green' : 'text-text-primary',
                      )}>
                        {session.branch}
                      </span>
                      {session.status !== 'active' && (
                        <span className={cn(
                          'text-xs px-1 rounded-sm shrink-0',
                          session.status === 'merged'
                            ? 'text-accent-brand bg-accent-brand/10'
                            : 'text-text-secondary bg-bg-hover-muted',
                        )}>
                          {session.status}
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-text-secondary mt-0.5 pl-5">
                      <span>base: {session.baseBranch}</span>
                      {status && status.aheadCount > 0 && (
                        <span className="text-accent-green ml-1">+{status.aheadCount}</span>
                      )}
                      {status && status.changedFiles > 0 && (
                        <span className="ml-1">{status.changedFiles} files</span>
                      )}
                      {status && status.untrackedFiles > 0 && (
                        <span className="ml-1">{status.untrackedFiles} new</span>
                      )}
                    </div>

                    <div className="hidden group-hover/item:flex items-center gap-1 mt-1.5 pl-5">
                      <OpenInIdeBtn path={session.worktreePath} />
                      {session.status === 'active' && (
                        <>
                          <ActionBtn
                            onClick={() => handleMergeClick(session)}
                            title={t('workspace:worktree.mergeToMain')}
                            aria-label={`Merge ${session.branch}`}
                          >
                            <GitMerge size={10} /> {t('workspace:worktree.merge')}
                          </ActionBtn>
                          <ActionBtn
                            onClick={() => handleDelete(session.worktreePath)}
                            title={t('workspace:worktree.deleteWorktree')}
                            aria-label={`Delete ${session.branch}`}
                            danger
                            disabled={isDeleting}
                          >
                            <Trash2 size={10} /> {isDeleting ? '...' : t('workspace:worktree.deleteBtn')}
                          </ActionBtn>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}

          {sessions.length === 0 && (
            <div className="py-4 px-3 text-xs text-text-secondary text-center">
              {t('workspace:worktree.noWorktrees')}
            </div>
          )}
        </div>
      </div>

      {mergeTarget && (
        <MergeDialog
          open={!!mergeTarget}
          worktreePath={mergeTarget.path}
          branch={mergeTarget.branch}
          baseBranch={mergeTarget.baseBranch}
          onClose={() => setMergeTarget(null)}
          onMerged={handleMerged}
        />
      )}
    </>
  )
}

const OpenInIdeBtn = ({ path }: { path: string }) => {
  const [opening, setOpening] = useState(false)

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setOpening(true)
    try {
      await authFetch(`${API_BASE}/api/open-in-ide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      })
    } catch { /* ignore */ } finally {
      setOpening(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={opening}
      tabIndex={0}
      aria-label={`Open ${path} in IDE`}
      title="Open in IDE"
      className="bg-transparent border border-border-subtle rounded text-xs py-0.5 px-1.5 flex items-center gap-1 text-text-secondary cursor-pointer transition-all hover:text-text-primary hover:bg-bg-hover-muted disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {opening ? <Loader2 size={10} className="animate-spin" /> : <ExternalLink size={10} />}
      IDE
    </button>
  )
}

const SidebarBtn = ({ children, onClick, title, loading: _loading }: {
  children: React.ReactNode; onClick: () => void; title: string; loading?: boolean
}) => (
  <button
    onClick={onClick} title={title}
    aria-label={title} tabIndex={0}
    className="bg-transparent border-none cursor-pointer text-text-secondary p-1 flex items-center rounded transition-colors hover:text-text-primary"
    onKeyDown={(e) => { if (e.key === 'Enter') onClick() }}
  >
    {children}
  </button>
)

const ActionBtn = ({ children, onClick, title, danger, disabled, ...rest }: {
  children: React.ReactNode; onClick: () => void; title: string
  danger?: boolean; disabled?: boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    onClick={onClick} title={title} disabled={disabled}
    tabIndex={0}
    className={cn(
      'bg-transparent border border-border-subtle rounded text-xs py-0.5 px-1.5 flex items-center gap-1 transition-all',
      'text-text-secondary',
      disabled
        ? 'cursor-not-allowed opacity-50'
        : cn('cursor-pointer', danger ? 'hover:text-accent-red hover:border-accent-red/30 hover:bg-accent-red/[0.08]' : 'hover:text-text-primary hover:bg-bg-hover-muted')
    )}
    onKeyDown={(e) => { if (e.key === 'Enter') onClick() }}
    {...rest}
  >
    {children}
  </button>
)

export default WorktreeSidebar
