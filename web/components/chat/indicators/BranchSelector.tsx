/**
 * BranchSelector —
 *
 *  GitStatusBar fetch local/remote
 *  Pill
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Search, RefreshCw, Check, Globe, HardDrive } from 'lucide-react'
import { cn } from '@/lib/utils'
import { API_BASE, authFetch } from '@/config/api'
import { GitStatusData } from '@/hooks/useGitStatus'

interface Branch {
  name: string
  isCurrent: boolean
  isRemote: boolean
  lastCommit?: string
}

interface BranchSelectorProps {
  repoPath: string
  currentBranch: string
  onClose: () => void
  repositories?: Array<{ path: string; name: string }>
  multiGitStatus?: Map<string, GitStatusData>
}

const BranchSelector = ({ repoPath, currentBranch, onClose, repositories, multiGitStatus }: BranchSelectorProps) => {
  const { t } = useTranslation('workspace')
  const isMultiRepo = repositories && repositories.length > 1
  const [selectedRepoPath, setSelectedRepoPath] = useState(repoPath)
  const [branchCache, setBranchCache] = useState<Map<string, Branch[]>>(new Map())
  const [search, setSearch] = useState('')
  const [backgroundLoading, setBackgroundLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [switching, setSwitching] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const effectiveCurrentBranch = multiGitStatus?.get(selectedRepoPath)?.branch ?? currentBranch

  const branches = branchCache.get(selectedRepoPath) ?? []

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  const fetchBranchesForRepo = useCallback(async (targetRepoPath: string) => {
    setBackgroundLoading(true)
    try {
      const params = new URLSearchParams({ path: targetRepoPath })
      const res = await authFetch(`${API_BASE}/api/git/branches?${params}`)
      if (!res.ok) throw new Error('Failed to fetch branches')
      const data = await res.json()
      const fetchedBranches: Branch[] = data.branches || []
      setBranchCache(prev => {
        const next = new Map(prev)
        next.set(targetRepoPath, fetchedBranches)
        return next
      })
    } catch {
      toast.error(t('branch.fetchError'))
    } finally {
      setBackgroundLoading(false)
    }
  }, [])

  const handleFetch = useCallback(async () => {
    setFetching(true)
    try {
      const res = await authFetch(`${API_BASE}/api/git/fetch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: selectedRepoPath }),
      })
      if (!res.ok) throw new Error('Fetch failed')
    } catch {
      toast.warning(t('branch.fetchWarning'))
    } finally {
      setFetching(false)
      await fetchBranchesForRepo(selectedRepoPath)
    }
  }, [selectedRepoPath, fetchBranchesForRepo])

  useEffect(() => {
    fetchBranchesForRepo(selectedRepoPath)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRepoSelect = useCallback((targetRepoPath: string) => {
    setSelectedRepoPath(targetRepoPath)
    setSearch('')
    if (!branchCache.has(targetRepoPath)) {
      fetchBranchesForRepo(targetRepoPath)
    }
  }, [branchCache, fetchBranchesForRepo])

  const handleCheckout = useCallback(async (branchName: string) => {
    if (branchName === effectiveCurrentBranch) return
    setSwitching(branchName)
    try {
      const res = await authFetch(`${API_BASE}/api/git/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: selectedRepoPath, branch: branchName }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Checkout failed')
      const repoName = repositories?.find(r => r.path === selectedRepoPath)?.name
      toast.success(`${repoName ? `[${repoName}] ` : ''}${t('branch.switchedTo', { branch: branchName })}`)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Checkout failed')
    } finally {
      setSwitching(null)
    }
  }, [selectedRepoPath, effectiveCurrentBranch, onClose, repositories])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  const filteredBranches = branches.filter((b) =>
    b.name.toLowerCase().includes(search.toLowerCase())
  )
  const localBranches = filteredBranches.filter((b) => !b.isRemote)
  const remoteBranches = filteredBranches.filter((b) => b.isRemote)

  return (
    <div
      ref={panelRef}
      className="absolute bottom-full left-0 mb-1 w-72 max-h-96 bg-bg-primary border border-border-subtle rounded-md shadow-lg overflow-hidden z-50 flex flex-col"
      onKeyDown={handleKeyDown}
    >
      {isMultiRepo && (
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border-subtle overflow-x-auto">
          {repositories.map(repo => {
            const isSelected = repo.path === selectedRepoPath
            const repoBranch = multiGitStatus?.get(repo.path)?.branch
            return (
              <button
                key={repo.path}
                type="button"
                onClick={() => handleRepoSelect(repo.path)}
                className={cn(
                  'px-2 py-0.5 rounded text-[11px] whitespace-nowrap shrink-0 border-none cursor-pointer transition-colors',
                  isSelected
                    ? 'bg-accent-brand/15 text-accent-brand font-medium'
                    : 'bg-transparent text-text-secondary hover:bg-bg-hover-subtle',
                )}
              >
                {repo.name}{repoBranch ? `: ${repoBranch}` : ''}
              </button>
            )
          })}
        </div>
      )}

      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border-subtle">
        <Search size={12} className="text-text-secondary opacity-60 shrink-0" />
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search branches..."
          className="flex-1 bg-transparent text-xs text-text-primary outline-none placeholder:text-text-secondary/50"
        />
        <button
          type="button"
          onClick={handleFetch}
          disabled={fetching}
          className="p-0.5 rounded hover:bg-bg-hover-subtle text-text-secondary shrink-0"
          title="Refresh"
        >
          <RefreshCw size={12} className={cn(fetching && 'animate-spin')} />
        </button>
      </div>

      {/* BranchList */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Local */}
        {localBranches.length > 0 && (
          <div>
            <div className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-text-secondary bg-bg-secondary">
              <HardDrive size={10} className="opacity-60" />
              Local
            </div>
            {localBranches.map((b) => (
              <BranchItem
                key={`local:${b.name}`}
                branch={b}
                currentBranch={effectiveCurrentBranch}
                switching={switching}
                onCheckout={handleCheckout}
              />
            ))}
          </div>
        )}

        {/* Remote */}
        {remoteBranches.length > 0 && (
          <div>
            <div className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-text-secondary bg-bg-secondary">
              <Globe size={10} className="opacity-60" />
              Remote
            </div>
            {remoteBranches.map((b) => (
              <BranchItem
                key={`remote:${b.name}`}
                branch={b}
                currentBranch={effectiveCurrentBranch}
                switching={switching}
                onCheckout={handleCheckout}
              />
            ))}
          </div>
        )}

        {branches.length === 0 && backgroundLoading && (
          <div className="flex items-center justify-center py-4 text-xs text-text-secondary opacity-60">
            Loading...
          </div>
        )}

        {branches.length > 0 && filteredBranches.length === 0 && (
          <div className="flex items-center justify-center py-4 text-xs text-text-secondary opacity-60">
            No matching branches
          </div>
        )}

        {branches.length > 0 && (backgroundLoading || fetching) && (
          <div className="flex items-center justify-center py-1 text-[10px] text-text-secondary opacity-50">
            <RefreshCw size={10} className="animate-spin mr-1" />
            Refreshing...
          </div>
        )}
      </div>
    </div>
  )
}

interface BranchItemProps {
  branch: Branch
  currentBranch: string
  switching: string | null
  onCheckout: (name: string) => void
}

const BranchItem = ({ branch, currentBranch, switching, onCheckout }: BranchItemProps) => {
  const isCurrent = branch.name === currentBranch
  const isSwitching = switching === branch.name

  return (
    <button
      type="button"
      onClick={() => onCheckout(branch.name)}
      disabled={isCurrent || isSwitching}
      className={cn(
        'w-full flex items-center gap-1.5 px-2 py-1 text-xs text-left transition-colors',
        isCurrent
          ? 'text-accent-brand bg-accent-brand/5 cursor-default'
          : 'text-text-primary hover:bg-bg-hover-subtle cursor-pointer',
      )}
    >
      {isCurrent ? (
        <Check size={12} className="text-accent-brand shrink-0" />
      ) : (
        <span className="w-3 shrink-0" />
      )}
      <span className="truncate flex-1 font-mono">{branch.name}</span>
      {branch.lastCommit && (
        <span className="text-[10px] font-mono text-text-secondary opacity-50 shrink-0">
          {branch.lastCommit}
        </span>
      )}
      {isSwitching && (
        <span className="text-[10px] text-text-secondary opacity-60 shrink-0">...</span>
      )}
    </button>
  )
}

export default BranchSelector
