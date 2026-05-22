/**
 * PendingChangesPanel —  Workspace  Worktree
 *  diffMerge / Discard
 *
 * Phase 4: Commits  Diff
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  GitBranch, GitMerge, Trash2, ChevronDown, ChevronRight,
  FileText, FilePlus, FileMinus, FileEdit, Loader2, MessageSquare, Eraser,
  GitCommitHorizontal,
} from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import InlineDiffViewer from '@/components/changes/InlineDiffViewer'

import { API_BASE, authFetch } from '@/config/api'

interface DiffEntry {
  file: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  insertions?: number
  deletions?: number
}

interface CommitInfo {
  hash: string
  shortHash: string
  message: string
  author: string
  timestamp: number
}

interface WorktreeInfo {
  path: string
  branch: string
  isMain: boolean
}

interface RepoWorktreeState {
  repoPath: string
  repoName: string
  worktrees: Array<{
    path: string
    branch: string
    files: DiffEntry[]
  }>
}

interface ChatMapEntry {
  chatId: string
  chatTitle: string
}

interface Props {
  repositories: Array<{ path: string; name: string }>
  workspaceId?: string
}

type ConfirmAction = {
  type: 'merge' | 'discard'
  worktreePath: string
}

type CleanConfirm = {
  repoPath: string
  repoName: string
}

const PendingChangesPanel = ({ repositories, workspaceId }: Props) => {
  const navigate = useNavigate()
  const { t } = useTranslation(['workspace', 'common'])
  const [repoStates, setRepoStates] = useState<RepoWorktreeState[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedWorktrees, setExpandedWorktrees] = useState<Set<string>>(new Set())
  const [merging, setMerging] = useState<Set<string>>(new Set())
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [cleanConfirm, setCleanConfirm] = useState<CleanConfirm | null>(null)
  const [cleaning, setCleaning] = useState(false)
  const [chatMap, setChatMap] = useState<Record<string, ChatMapEntry>>({})
  const [commitsExpanded, setCommitsExpanded] = useState<Set<string>>(new Set())
  const [commitsCache, setCommitsCache] = useState<Record<string, CommitInfo[]>>({})
  const [loadingCommits, setLoadingCommits] = useState<Set<string>>(new Set())
  const [expandedDiffFile, setExpandedDiffFile] = useState<{ worktreePath: string; file: string } | null>(null)

  const reposKey = useMemo(
    () => repositories.map((r) => r.path).sort().join('\n'),
    [repositories],
  )
  const repositoriesRef = useRef(repositories)
  repositoriesRef.current = repositories

  useEffect(() => {
    if (!workspaceId) return
    authFetch(`${API_BASE}/api/workspaces/${workspaceId}/worktree-chat-map`)
      .then((res) => res.ok ? res.json() : {})
      .then(setChatMap)
      .catch(() => {})
  }, [workspaceId])

  const fetchWorktrees = useCallback(async () => {
    const repos = repositoriesRef.current
    setLoading(true)
    try {
      const listResults = await Promise.all(
        repos.map(async (repo) => {
          try {
            const res = await authFetch(`${API_BASE}/api/worktree/list?repo=${encodeURIComponent(repo.path)}`)
            if (!res.ok) return { repo, worktrees: [] as WorktreeInfo[] }
            const { worktrees } = await res.json() as { worktrees: WorktreeInfo[] }
            return { repo, worktrees: worktrees.filter((wt) => !wt.isMain) }
          } catch {
            return { repo, worktrees: [] as WorktreeInfo[] }
          }
        }),
      )

      const reposWithWorktrees = listResults.filter(({ worktrees }) => worktrees.length > 0)
      if (reposWithWorktrees.length === 0) {
        setRepoStates([])
        return
      }

      const batchRes = await authFetch(`${API_BASE}/api/worktree/diff-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          withStats: true,
          repos: reposWithWorktrees.map(({ repo, worktrees }) => ({
            repoRoot: repo.path,
            base: 'main',
            worktrees: worktrees.map((wt) => ({ path: wt.path, branch: wt.branch })),
          })),
        }),
      })

      const diffMap = new Map<string, DiffEntry[]>()
      if (batchRes.ok) {
        const { results } = await batchRes.json() as {
          results: Array<{ path: string; files: DiffEntry[] }>
        }
        for (const r of results) {
          diffMap.set(r.path, r.files || [])
        }
      }

      const states: RepoWorktreeState[] = []
      for (const { repo, worktrees } of listResults) {
        if (worktrees.length === 0) continue
        const wtStates: RepoWorktreeState['worktrees'] = []
        for (const wt of worktrees) {
          const files = diffMap.get(wt.path) || []
          wtStates.push({ path: wt.path, branch: wt.branch, files })
        }
        if (wtStates.length > 0) {
          states.push({ repoPath: repo.path, repoName: repo.name, worktrees: wtStates })
        }
      }

      setRepoStates(states)
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [reposKey])

  useEffect(() => { fetchWorktrees() }, [fetchWorktrees])

  // Load commits
  const loadCommits = useCallback(async (worktreePath: string, baseBranch = 'main') => {
    if (commitsCache[worktreePath] || loadingCommits.has(worktreePath)) return

    setLoadingCommits((prev) => new Set(prev).add(worktreePath))
    try {
      const params = new URLSearchParams({ path: worktreePath, base: baseBranch })
      const res = await authFetch(`${API_BASE}/api/worktree/commits?${params}`)
      if (res.ok) {
        const data = await res.json()
        setCommitsCache((prev) => ({ ...prev, [worktreePath]: data.commits || [] }))
      }
    } catch { /* ignore */ }
    finally {
      setLoadingCommits((prev) => { const s = new Set(prev); s.delete(worktreePath); return s })
    }
  }, [commitsCache, loadingCommits])

  const toggleCommits = useCallback((worktreePath: string) => {
    setCommitsExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(worktreePath)) {
        next.delete(worktreePath)
      } else {
        next.add(worktreePath)
        loadCommits(worktreePath)
      }
      return next
    })
  }, [loadCommits])

  const handleMerge = (worktreePath: string) => {
    setConfirmAction({ type: 'merge', worktreePath })
  }

  const handleDiscard = (worktreePath: string) => {
    setConfirmAction({ type: 'discard', worktreePath })
  }

  const handleConfirmAction = async () => {
    if (!confirmAction) return
    const { type, worktreePath } = confirmAction
    setConfirmAction(null)

    if (type === 'merge') {
      setMerging((prev) => new Set(prev).add(worktreePath))
      try {
        const res = await authFetch(`${API_BASE}/api/worktree/merge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ worktreePath }),
        })
        if (!res.ok) throw new Error()
        toast.success(t('workspace:merge.success'))
        fetchWorktrees()
      } catch {
        toast.error(t('workspace:merge.failed'))
      } finally {
        setMerging((prev) => { const s = new Set(prev); s.delete(worktreePath); return s })
      }
    } else {
      try {
        const res = await authFetch(`${API_BASE}/api/worktree/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ worktreePath, force: true }),
        })
        if (!res.ok) throw new Error()
        toast.success(t('workspace:pendingChanges.discarded'))
        fetchWorktrees()
      } catch {
        toast.error(t('workspace:pendingChanges.discardFailed'))
      }
    }
  }

  const toggleExpand = (path: string) => {
    setExpandedWorktrees((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const handleCleanAll = async () => {
    if (!cleanConfirm) return
    setCleaning(true)
    try {
      const res = await authFetch(`${API_BASE}/api/worktree/clean`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoRoot: cleanConfirm.repoPath }),
      })
      if (!res.ok) throw new Error()
      const { cleaned } = await res.json()
      toast.success(t('workspace:repo.cleanSuccess', { count: cleaned }))
      fetchWorktrees()
    } catch {
      toast.error(t('workspace:repo.cleanFailed'))
    } finally {
      setCleaning(false)
      setCleanConfirm(null)
    }
  }

  const totalWorktrees = repoStates.reduce((s, r) => s + r.worktrees.length, 0)
  const isEmpty = !loading && repoStates.length === 0

  const getWorktreeStats = (files: DiffEntry[]) => {
    let insertions = 0
    let deletions = 0
    for (const f of files) {
      insertions += f.insertions || 0
      deletions += f.deletions || 0
    }
    return { insertions, deletions }
  }

  return (
    <>
      <div className="border border-border rounded-lg overflow-hidden mb-5">
        <div className="px-3.5 py-2.5 flex items-center gap-2 text-xs font-semibold text-text-emphasis">
          <GitBranch size={13} />
          {t('workspace:pendingChanges.title')}
          {loading ? (
            <Loader2 size={11} className="animate-spin text-text-secondary" />
          ) : (
            <span className="text-text-secondary font-normal">
              ({t('workspace:pendingChanges.worktreeCount', { count: totalWorktrees })})
            </span>
          )}
        </div>

        {isEmpty && (
          <div className="px-3.5 py-4 text-xs text-text-secondary text-center border-t border-border-subtle">
            {t('workspace:pendingChanges.empty', { defaultValue: 'No pending worktree changes' })}
          </div>
        )}

        {repoStates.map((repo) => (
          <div key={repo.repoPath} className="border-t border-border-subtle">
            <div className="group/repo-header px-3.5 py-2 flex items-center gap-2 text-xs font-medium text-text-primary bg-bg-hover-subtle">
              <span className="flex-1">{repo.repoName}</span>
              <span className="text-text-secondary font-normal">
                {t('workspace:pendingChanges.worktreeCount', { count: repo.worktrees.length })}
              </span>
              <button
                onClick={() => setCleanConfirm({ repoPath: repo.repoPath, repoName: repo.repoName })}
                tabIndex={0}
                aria-label={t('workspace:repo.cleanWorktrees')}
                title={t('workspace:repo.cleanWorktrees')}
                className="opacity-0 group-hover/repo-header:opacity-100 bg-transparent border-none cursor-pointer text-text-muted hover:text-accent-red p-0.5 rounded-sm transition-all"
              >
                <Eraser size={11} />
              </button>
            </div>

            {repo.worktrees.map((wt) => {
              const expanded = expandedWorktrees.has(wt.path)
              const stats = getWorktreeStats(wt.files)
              const showCommits = commitsExpanded.has(wt.path)
              const commits = commitsCache[wt.path] || []
              const isLoadingCommits = loadingCommits.has(wt.path)

              return (
                <div key={wt.path} className="border-t border-border-subtle">
                  <div
                    className="flex items-center gap-2 cursor-pointer py-2 pr-3.5 pl-7"
                    onClick={() => toggleExpand(wt.path)}
                    role="button"
                    tabIndex={0}
                    aria-label={t('workspace:pendingChanges.toggleDiff', { branch: wt.branch })}
                    onKeyDown={(e) => { if (e.key === 'Enter') toggleExpand(wt.path) }}
                  >
                    {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    <span className="text-xs px-1.5 py-px rounded bg-[rgba(82,196,26,0.1)] text-accent-green flex items-center gap-1">
                      <GitBranch size={10} />
                      {wt.branch}
                    </span>
                    <span className="text-xs text-text-secondary">
                      {t('workspace:pendingChanges.fileCount', { count: wt.files.length })}
                    </span>

                    {(stats.insertions > 0 || stats.deletions > 0) && (
                      <span className="text-xs font-mono flex items-center gap-1">
                        {stats.insertions > 0 && <span className="text-accent-green">+{stats.insertions}</span>}
                        {stats.deletions > 0 && <span className="text-accent-red">-{stats.deletions}</span>}
                      </span>
                    )}

                    {chatMap[wt.path] && workspaceId && (
                      <button
                        className="inline-flex items-center gap-1 text-xs text-accent-brand hover:underline bg-transparent border-none cursor-pointer p-0 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(`/workspace/${workspaceId}/chat/${chatMap[wt.path].chatId}`)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.stopPropagation()
                            navigate(`/workspace/${workspaceId}/chat/${chatMap[wt.path].chatId}`)
                          }
                        }}
                        tabIndex={0}
                        aria-label={`${t('workspace:pendingChanges.fromChat')}: ${chatMap[wt.path].chatTitle}`}
                        title={`${t('workspace:pendingChanges.fromChat')}: ${chatMap[wt.path].chatTitle}`}
                      >
                        <MessageSquare size={10} />
                        <span className="max-w-[120px] truncate">{chatMap[wt.path].chatTitle}</span>
                      </button>
                    )}

                    <span className="flex-1" />

                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-primary px-2 py-1 text-xs text-text-primary hover:bg-bg-hover transition-colors disabled:opacity-50"
                        disabled={merging.has(wt.path)}
                        onClick={() => handleMerge(wt.path)}
                        aria-label={t('workspace:pendingChanges.mergeBranch', { branch: wt.branch })}
                        tabIndex={0}
                      >
                        {merging.has(wt.path) ? <Loader2 size={11} className="animate-spin" /> : <GitMerge size={11} />}
                        {t('workspace:worktree.merge')}
                      </button>
                      <button
                        className="inline-flex items-center gap-1 rounded-md border border-accent-red/30 bg-bg-primary px-2 py-1 text-xs text-accent-red hover:bg-accent-red/10 transition-colors"
                        onClick={() => handleDiscard(wt.path)}
                        aria-label={t('workspace:pendingChanges.discardBranch', { branch: wt.branch })}
                        tabIndex={0}
                      >
                        <Trash2 size={11} />
                        {t('workspace:pendingChanges.discard')}
                      </button>
                    </div>
                  </div>

                  {expanded && (
                    <div className="pb-2 pr-3.5 pl-[42px]">
                      {/* FileList */}
                      {wt.files.map((file) => {
                        const isDiffOpen = expandedDiffFile?.worktreePath === wt.path && expandedDiffFile?.file === file.file
                        return (
                          <div key={file.file}>
                            <div
                              className="flex items-center gap-1.5 py-0.5 text-xs cursor-pointer hover:bg-bg-hover-subtle rounded px-1 -mx-1 transition-colors"
                              onClick={() => {
                                setExpandedDiffFile(
                                  isDiffOpen ? null : { worktreePath: wt.path, file: file.file },
                                )
                              }}
                              role="button"
                              tabIndex={0}
                              aria-label={`View diff for ${file.file}`}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  setExpandedDiffFile(
                                    isDiffOpen ? null : { worktreePath: wt.path, file: file.file },
                                  )
                                }
                              }}
                            >
                              {isDiffOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                              <FileStatusIcon status={file.status} />
                              <span className="text-text-primary flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                                {file.file}
                              </span>
                              {((file.insertions || 0) > 0 || (file.deletions || 0) > 0) && (
                                <span className="text-xs font-mono shrink-0 flex items-center gap-1">
                                  {(file.insertions || 0) > 0 && <span className="text-accent-green">+{file.insertions}</span>}
                                  {(file.deletions || 0) > 0 && <span className="text-accent-red">-{file.deletions}</span>}
                                </span>
                              )}
                            </div>

                            {isDiffOpen && (
                              <div className="my-1 border border-border-subtle rounded overflow-hidden" style={{ height: 300 }}>
                                <InlineDiffViewer
                                  worktreePath={wt.path}
                                  filePath={file.file}
                                  baseBranch="main"
                                  readOnly
                                />
                              </div>
                            )}
                          </div>
                        )
                      })}

                      <div className="border-t border-border-subtle/50 mt-1.5 pt-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleCommits(wt.path)
                          }}
                          className="flex items-center gap-1.5 w-full px-1 py-1 text-left bg-transparent border-none cursor-pointer hover:bg-bg-hover-subtle rounded transition-colors"
                          tabIndex={0}
                          aria-label="Toggle commits"
                        >
                          {showCommits ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                          <GitCommitHorizontal size={11} className="text-text-secondary opacity-60" />
                          <span className="text-xs text-text-secondary font-medium">
                            Commits
                          </span>
                          {commits.length > 0 && (
                            <span className="text-xs text-text-secondary">({commits.length})</span>
                          )}
                        </button>

                        {showCommits && (
                          <div className="max-h-32 overflow-y-auto px-1 pb-1">
                            {isLoadingCommits && (
                              <div className="flex items-center gap-1 text-xs text-text-secondary py-1">
                                <Loader2 size={10} className="animate-spin" />
                                Loading...
                              </div>
                            )}
                            {!isLoadingCommits && commits.length === 0 && (
                              <div className="text-xs text-text-secondary py-1">
                                No commits yet
                              </div>
                            )}
                            {commits.map((commit) => (
                              <div key={commit.hash} className="flex items-start gap-2 py-0.5">
                                <span className="text-xs font-mono text-accent-brand shrink-0 mt-px">
                                  {commit.shortHash}
                                </span>
                                <span
                                  className="text-xs text-text-secondary truncate flex-1 min-w-0"
                                  title={commit.message}
                                >
                                  {commit.message}
                                </span>
                                <span className="text-xs text-text-secondary shrink-0">
                                  {new Date(commit.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <Dialog open={!!confirmAction} onOpenChange={(open) => { if (!open) setConfirmAction(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmAction?.type === 'merge' ? t('workspace:pendingChanges.mergeTitle') : t('workspace:pendingChanges.discardTitle')}
            </DialogTitle>
            <DialogDescription>
              {confirmAction?.type === 'merge'
                ? t('workspace:pendingChanges.mergeDesc')
                : t('workspace:pendingChanges.discardDesc')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              className="rounded-md border border-border bg-bg-primary px-3 py-1.5 text-xs text-text-primary hover:bg-bg-hover transition-colors"
              onClick={() => setConfirmAction(null)}
              aria-label={t('common:action.cancel')}
              tabIndex={0}
            >
              {t('common:action.cancel')}
            </button>
            <button
              className={`rounded-md px-3 py-1.5 text-xs text-white transition-colors ${
                confirmAction?.type === 'discard'
                  ? 'bg-accent-red hover:bg-accent-red/90'
                  : 'bg-accent-brand hover:bg-accent-brand/90'
              }`}
              onClick={handleConfirmAction}
              aria-label={confirmAction?.type === 'merge' ? t('workspace:worktree.merge') : t('workspace:pendingChanges.discard')}
              tabIndex={0}
            >
              {confirmAction?.type === 'merge' ? t('workspace:worktree.merge') : t('workspace:pendingChanges.discard')}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!cleanConfirm} onOpenChange={(open) => { if (!open) setCleanConfirm(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('workspace:repo.cleanConfirmTitle')}</DialogTitle>
            <DialogDescription>
              {t('workspace:repo.cleanConfirmDesc', { name: cleanConfirm?.repoName })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              className="rounded-md border border-border bg-bg-primary px-3 py-1.5 text-xs text-text-primary hover:bg-bg-hover transition-colors"
              onClick={() => setCleanConfirm(null)}
              aria-label={t('common:action.cancel')}
              tabIndex={0}
            >
              {t('common:action.cancel')}
            </button>
            <button
              className="rounded-md bg-accent-red px-3 py-1.5 text-xs text-white hover:bg-accent-red/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleCleanAll}
              disabled={cleaning}
              aria-label={t('workspace:repo.cleanWorktrees')}
              tabIndex={0}
            >
              {cleaning ? <Loader2 size={12} className="animate-spin" /> : t('workspace:repo.cleanWorktrees')}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

const FileStatusIcon = ({ status }: { status: string }) => {
  const iconMap: Record<string, { icon: typeof FileText; color: string }> = {
    added: { icon: FilePlus, color: 'rgb(var(--accent-green))' },
    modified: { icon: FileEdit, color: 'rgb(var(--accent-brand))' },
    deleted: { icon: FileMinus, color: 'rgb(var(--accent-red))' },
    renamed: { icon: FileText, color: 'rgb(var(--text-muted))' },
  }
  const { icon: Icon, color } = iconMap[status] || iconMap.modified
  return <Icon size={12} className="shrink-0" style={{ color }} />
}

export default PendingChangesPanel
