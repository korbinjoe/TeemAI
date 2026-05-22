import type { TFunction } from 'i18next'
import {
  Plus, GitBranch, FolderOpen, ChevronDown, ChevronRight, Trash2, Eraser,
} from 'lucide-react'
import type { Repository } from './types'

interface RepositorySectionProps {
  repositories: Repository[]
  expanded: boolean
  onToggleExpand: () => void
  onAddRepo: () => void
  onRemoveRepo: (repo: Repository) => void
  onCleanWorktrees: (repo: Repository) => void
  isDefault?: boolean
  t: TFunction
}

const RepositorySection = ({
  repositories,
  expanded,
  onToggleExpand,
  onAddRepo,
  onRemoveRepo,
  onCleanWorktrees,
  isDefault,
  t,
}: RepositorySectionProps) => (
  <div className="border border-border rounded-md mb-5 overflow-hidden">
    <div className="py-2.5 px-3.5 flex items-center gap-2">
      <button
        onClick={onToggleExpand}
        className="flex items-center gap-2 bg-transparent border-none cursor-pointer text-text-emphasis text-xs font-semibold p-0"
        tabIndex={0}
        aria-label={t('workspace:toggleRepos')}
      >
        {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        {t('workspace:repositoriesSection', { count: repositories.length })}
      </button>
      <span className="flex-1" />
      {!isDefault && (
        <button
          onClick={onAddRepo}
          tabIndex={0}
          aria-label={t('workspace:repo.addRepo')}
          title={t('workspace:repo.addRepo')}
          className="inline-flex items-center gap-1 rounded bg-transparent border-none cursor-pointer text-text-muted hover:text-accent-brand p-1 transition-colors"
        >
          <Plus size={13} />
        </button>
      )}
    </div>
    {expanded && repositories.map((repo) => (
      <div key={repo.id} className="group/repo py-2 pr-3.5 pl-9 border-t border-border-subtle flex items-center gap-2">
        <FolderOpen size={12} className="text-text-secondary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs text-text-primary">{repo.name}</div>
          <div className="text-xs text-text-secondary overflow-hidden text-ellipsis whitespace-nowrap">
            {repo.path}
          </div>
        </div>
        {repo.gitInfo?.currentBranch && (
          <span className="text-xs px-1.5 py-px rounded-[3px] bg-[rgba(82,196,26,0.1)] text-accent-green flex items-center gap-[3px] shrink-0">
            <GitBranch size={10} />
            {repo.gitInfo.currentBranch}
          </span>
        )}
        <button
          onClick={() => onCleanWorktrees(repo)}
          tabIndex={0}
          aria-label={t('workspace:repo.cleanWorktrees')}
          title={t('workspace:repo.cleanWorktrees')}
          className="opacity-0 group-hover/repo:opacity-100 bg-transparent border-none cursor-pointer text-text-muted hover:text-accent-brand p-1 rounded-sm transition-all shrink-0"
        >
          <Eraser size={11} />
        </button>
        {!isDefault && (
          <button
            onClick={() => onRemoveRepo(repo)}
            tabIndex={0}
            aria-label={t('workspace:repo.removeRepo')}
            title={t('workspace:repo.removeRepo')}
            className="opacity-0 group-hover/repo:opacity-100 bg-transparent border-none cursor-pointer text-text-muted hover:text-accent-red p-1 rounded-sm transition-all shrink-0"
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>
    ))}
  </div>
)

export default RepositorySection
