/**
 * GitStatusBar —  Git
 *
 *  worktree  Git
 *  BranchSelector
 */

import { useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { GitBranch, ArrowUp, FileDiff, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GitStatusData } from '@/hooks/useGitStatus'
import type { MultiRepoGitStatusAggregate } from '@/hooks/useMultiRepoGitStatus'
import BranchSelector from './BranchSelector'

interface GitStatusBarProps {
  gitStatus: GitStatusData
  aggregate?: MultiRepoGitStatusAggregate
  onViewChanges: () => void
  className?: string
  repositories?: Array<{ path: string; name: string }>
  multiGitStatus?: Map<string, GitStatusData>
}

const GitStatusBar = ({ gitStatus, aggregate, onViewChanges, className, repositories, multiGitStatus }: GitStatusBarProps) => {
  const { t } = useTranslation('chat')
  const { worktreePath, branch, baseBranch, aheadCount } = gitStatus
  const changedFiles = aggregate?.totalChangedFiles ?? gitStatus.changedFiles
  const insertions = aggregate?.totalInsertions ?? gitStatus.insertions
  const deletions = aggregate?.totalDeletions ?? gitStatus.deletions
  const [branchSelectorOpen, setBranchSelectorOpen] = useState(false)
  const [selectorInitialRepo, setSelectorInitialRepo] = useState(worktreePath)
  const [repoDropdownOpen, setRepoDropdownOpen] = useState(false)
  const repoDropdownRef = useRef<HTMLDivElement>(null)

  const isMultiRepo = repositories && repositories.length > 1
  const shortBranch = branch.length > 20 ? `${branch.slice(0, 18)}…` : branch

  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleRepoMouseEnter = useCallback(() => {
    if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null }
    setRepoDropdownOpen(true)
  }, [])
  const handleRepoMouseLeave = useCallback(() => {
    hoverTimerRef.current = setTimeout(() => setRepoDropdownOpen(false), 150)
  }, [])

  const handleBranchClick = useCallback((clickedRepoPath?: string) => {
    const targetRepo = clickedRepoPath ?? worktreePath
    setRepoDropdownOpen(false)
    setBranchSelectorOpen(prev => {
      if (prev && clickedRepoPath && clickedRepoPath !== selectorInitialRepo) {
        setSelectorInitialRepo(targetRepo)
        return true
      }
      setSelectorInitialRepo(targetRepo)
      return !prev
    })
  }, [worktreePath, selectorInitialRepo])

  const handleBranchSelectorClose = useCallback(() => {
    setBranchSelectorOpen(false)
  }, [])

  return (
    <div className={cn(
      'flex items-center gap-3 px-3 py-1 h-7 shrink-0',
      'bg-bg-secondary border-t border-border-subtle text-xs',
      className,
    )}>
      <span className="relative flex items-center gap-1.5 text-text-secondary">
        <GitBranch size={11} className="opacity-60" />
        {isMultiRepo && multiGitStatus ? (
          <span
            ref={repoDropdownRef}
            className="relative"
            onMouseEnter={handleRepoMouseEnter}
            onMouseLeave={handleRepoMouseLeave}
          >
            <button
              type="button"
              onClick={() => { setBranchSelectorOpen(false); setRepoDropdownOpen(v => !v) }}
              className="flex items-center gap-1 font-mono text-[11px] hover:text-accent-brand transition-colors cursor-pointer bg-transparent border-none p-0"
            >
              <span className="font-medium text-text-primary">{repositories.length} repos</span>
              <ChevronDown size={10} className={cn('opacity-50 transition-transform', repoDropdownOpen && 'rotate-180')} />
            </button>

            {repoDropdownOpen && (
              <div className="absolute bottom-full left-0 mb-1 w-56 bg-bg-primary border border-border-subtle rounded-md shadow-lg z-50 overflow-hidden">
                {repositories.map((repo, idx) => {
                  const repoBranch = multiGitStatus.get(repo.path)?.branch ?? '—'
                  return (
                    <button
                      key={repo.path}
                      type="button"
                      onClick={() => handleBranchClick(repo.path)}
                      className={cn(
                        'w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left hover:bg-bg-hover-subtle transition-colors cursor-pointer bg-transparent border-none',
                        idx > 0 && 'border-t border-border-subtle/50',
                      )}
                    >
                      <span className="text-text-secondary truncate min-w-0 shrink-0">{repo.name}</span>
                      <span className="flex-1" />
                      <span className="flex items-center gap-1 font-mono text-[11px] text-text-primary shrink-0">
                        <GitBranch size={10} className="text-accent-green opacity-60" />
                        {repoBranch}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </span>
        ) : (
          <>
            <button
              type="button"
              onClick={() => handleBranchClick()}
              className="font-mono font-medium hover:text-accent-brand transition-colors cursor-pointer bg-transparent border-none p-0"
              title="Switch branch"
            >
              {shortBranch}
            </button>
            <span className="text-text-secondary opacity-60">← {baseBranch}</span>
          </>
        )}

        {/* BranchSelector Popover */}
        {branchSelectorOpen && (
          <BranchSelector
            key={selectorInitialRepo}
            repoPath={selectorInitialRepo}
            currentBranch={branch}
            onClose={handleBranchSelectorClose}
            repositories={repositories}
            multiGitStatus={multiGitStatus}
          />
        )}
      </span>

      <span className="w-px h-3 bg-border-subtle" />

      {changedFiles > 0 && (
        <span className="flex items-center gap-1.5 text-text-secondary">
          <FileDiff size={11} className="opacity-60" />
          <span>{changedFiles} {t('gitStatus.files', { defaultValue: 'files' })}</span>
          {insertions > 0 && (
            <span className="text-accent-green font-mono">+{insertions}</span>
          )}
          {deletions > 0 && (
            <span className="text-accent-red font-mono">-{deletions}</span>
          )}
        </span>
      )}

      {/* Commits ahead */}
      {aheadCount > 0 && (
        <>
          <span className="w-px h-3 bg-border-subtle" />
          <span className="flex items-center gap-1 text-text-secondary">
            <ArrowUp size={10} className="opacity-60" />
            {aheadCount} {t('gitStatus.ahead', { defaultValue: 'ahead' })}
          </span>
        </>
      )}

      <span className="flex-1" />

      {changedFiles > 0 && (
        <button
          type="button"
          onClick={onViewChanges}
          className="text-xs text-accent-brand hover:text-accent-brand/80 transition-colors cursor-pointer bg-transparent border-none px-1.5 py-0.5 rounded hover:bg-bg-hover-subtle"
          tabIndex={0}
          aria-label={t('gitStatus.viewChanges', { defaultValue: 'View Changes' })}
        >
          {t('gitStatus.viewChanges', { defaultValue: 'View Changes' })}
        </button>
      )}
    </div>
  )
}

export default GitStatusBar
