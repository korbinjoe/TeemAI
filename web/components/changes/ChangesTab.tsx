/**
 * ChangesTab — TerminalPanel  Changes Tab
 *
 * Web IDE  + commit  diff
 *  pill
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import InlineDiffViewer from './InlineDiffViewer'
import FullScreenReview from './FullScreenReview'
import CommitPanel from './CommitPanel'
import type { GitStatusData } from '@/hooks/useGitStatus'
import type { MultiRepoGitStatus } from '@/hooks/useMultiRepoGitStatus'

interface ChangesTabProps {
  gitStatus: GitStatusData
  multiGitStatus?: Map<string, GitStatusData>
  repositories?: Array<{ path: string; name: string }>
  agentActive: boolean
  onMultiOptimisticUpdate?: MultiRepoGitStatus['optimisticUpdate']
  className?: string
  onMerge?: () => void
  onDiscard?: () => void
  onPushed?: () => void
}

const MIN_LEFT_WIDTH = 160
const DEFAULT_SPLIT = 0.28
const STASH_PREFIX = 'edit-stash:'

const ChangesTab = ({ gitStatus, multiGitStatus, repositories, agentActive, onMultiOptimisticUpdate, className, onMerge, onDiscard, onPushed }: ChangesTabProps) => {
  const { t } = useTranslation('chat')

  const isMultiRepo = multiGitStatus && multiGitStatus.size > 1 && repositories && repositories.length > 1

  const defaultRepo = useMemo(() => {
    if (!isMultiRepo || !multiGitStatus || !repositories) return null
    const withChanges = repositories.find((r) => {
      const s = multiGitStatus.get(r.path)
      return s && s.diffEntries.length > 0
    })
    return withChanges?.path ?? repositories[0]?.path ?? null
  }, [isMultiRepo, multiGitStatus, repositories])

  const [selectedRepo, setSelectedRepo] = useState<string | null>(defaultRepo)

  useEffect(() => {
    if (defaultRepo && !selectedRepo) {
      setSelectedRepo(defaultRepo)
    }
  }, [defaultRepo, selectedRepo])

  const activeGitStatus = useMemo(() => {
    if (selectedRepo && multiGitStatus) {
      return multiGitStatus.get(selectedRepo) ?? gitStatus
    }
    return gitStatus
  }, [selectedRepo, multiGitStatus, gitStatus])

  const { worktreePath, branch, baseBranch, diffEntries } = activeGitStatus

  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [selectedFileStaged, setSelectedFileStaged] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [splitRatio, setSplitRatio] = useState(DEFAULT_SPLIT)
  const [fullScreenOpen, setFullScreenOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const prevAgentActive = useRef(agentActive)

  useEffect(() => {
    setSelectedFile(null)
  }, [selectedRepo])

  useEffect(() => {
    const wasInactive = !prevAgentActive.current
    prevAgentActive.current = agentActive

    if (agentActive && wasInactive && selectedFile) {
      const stashKey = `${STASH_PREFIX}${worktreePath}:${selectedFile}`
      const existingStash = localStorage.getItem(stashKey)
      if (existingStash) {
        toast.info(t('changes.editLocked', { defaultValue: 'Agent is active, edits stashed' }))
      }
    }
  }, [agentActive, selectedFile, worktreePath, t])

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    draggingRef.current = true

    const handleMouseMove = (ev: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const ratio = (ev.clientX - rect.left) / rect.width
      setSplitRatio(Math.max(0.15, Math.min(0.45, ratio)))
    }

    const handleMouseUp = () => {
      draggingRef.current = false
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [])

  const handleOptimisticUpdate = useCallback((updater: (prev: GitStatusData) => GitStatusData) => {
    if (onMultiOptimisticUpdate) {
      onMultiOptimisticUpdate(worktreePath, updater)
    }
  }, [onMultiOptimisticUpdate, worktreePath])

  const isEmpty = diffEntries.length === 0 && activeGitStatus.aheadCount === 0

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {isMultiRepo && repositories && (
        <div className="flex items-center gap-1 px-2 py-1 border-b border-border-subtle shrink-0">
          {repositories.map((repo) => {
            const status = multiGitStatus?.get(repo.path)
            const count = status?.diffEntries.length ?? 0
            return (
              <button
                key={repo.path}
                onClick={() => setSelectedRepo(repo.path)}
                className={cn(
                  'px-2 py-0.5 rounded text-xs transition-colors',
                  selectedRepo === repo.path ? 'bg-accent-brand/15 text-accent-brand' : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover',
                )}
              >
                {repo.name} ({count})
              </button>
            )
          })}
        </div>
      )}

      {isEmpty ? (
        <div className={cn('flex items-center justify-center flex-1 text-text-secondary text-sm select-none', className)}>
          <div className="text-center space-y-1">
            <div className="text-lg opacity-40">✓</div>
            <div>No changes</div>
            <div className="text-xs opacity-60">{branch} ← {baseBranch}</div>
          </div>
        </div>
      ) : (
        <>

      <div ref={containerRef} className={cn('flex flex-1 min-h-0 overflow-hidden', className)}>
        <div style={{ width: `${splitRatio * 100}%`, minWidth: MIN_LEFT_WIDTH }} className="overflow-hidden shrink-0 flex flex-col">
            <CommitPanel
              gitStatus={activeGitStatus}
              onSelectFile={(file, staged) => { setSelectedFile(file); setSelectedFileStaged(staged) }}
              selectedFile={selectedFile}
              onOptimisticUpdate={handleOptimisticUpdate}
              onPushed={onPushed}
              className="flex-1 min-h-0"
            />
        </div>

        <div
          onMouseDown={handleDividerMouseDown}
          className="w-1 shrink-0 cursor-col-resize bg-border-subtle hover:bg-accent-brand/50 transition-colors"
        />

        <div className="flex-1 min-w-0 overflow-hidden">
          <InlineDiffViewer
            worktreePath={worktreePath}
            filePath={selectedFile}
            baseBranch={baseBranch}
            readOnly={agentActive || selectedFileStaged}
            refreshKey={refreshKey}
            onSaved={() => setRefreshKey(k => k + 1)}
          />
        </div>
      </div>

      <FullScreenReview
        open={fullScreenOpen}
        onClose={() => setFullScreenOpen(false)}
        worktreePath={worktreePath}
        baseBranch={baseBranch}
        diffEntries={diffEntries}
        agentActive={agentActive}
        onMerge={onMerge}
        onDiscard={onDiscard}
      />
      </>
      )}
    </div>
  )
}

export default ChangesTab
