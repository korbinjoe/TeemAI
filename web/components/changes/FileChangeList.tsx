/**
 * FileChangeList —  + Git commit
 *
 *  commit
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FilePlus2, FilePen, FileX2, FileSymlink,
  ChevronDown, ChevronRight, GitCommitHorizontal,
  Maximize2, Folder, FolderOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { API_BASE, authFetch } from '@/config/api'
import { buildChangeTree, type ChangeTreeNode } from '@/lib/changeTree'

interface DiffEntry {
  file: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  insertions: number
  deletions: number
}

interface CommitInfo {
  hash: string
  shortHash: string
  message: string
  author: string
  timestamp: number
}

interface FileChangeListProps {
  diffEntries: DiffEntry[]
  worktreePath: string
  baseBranch: string
  selectedFile: string | null
  onSelectFile: (path: string) => void
  onFullScreen?: () => void
}

const STATUS_ICONS = {
  added: FilePlus2,
  modified: FilePen,
  deleted: FileX2,
  renamed: FileSymlink,
}

const STATUS_COLORS = {
  added: 'text-accent-green',
  modified: 'text-accent-brand',
  deleted: 'text-accent-red',
  renamed: 'text-accent-purple',
}

const ChangeTreeItem = ({
  node, depth, selectedFile, onSelectFile, expandedDirs, onToggleDir,
}: {
  node: ChangeTreeNode
  depth: number
  selectedFile: string | null
  onSelectFile: (path: string) => void
  expandedDirs: Set<string>
  onToggleDir: (path: string) => void
}) => {
  const isDir = node.type === 'directory'
  const isExpanded = expandedDirs.has(node.path)

  if (isDir) {
    return (
      <>
        <button
          type="button"
          onClick={() => onToggleDir(node.path)}
          className="flex items-center gap-1.5 w-full py-0.5 px-1 text-left text-xs hover:bg-bg-hover transition-colors rounded-sm bg-transparent border-none cursor-pointer"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          {isExpanded
            ? <FolderOpen size={12} className="shrink-0 text-accent-brand/70" />
            : <Folder size={12} className="shrink-0 text-accent-brand/70" />
          }
          <span className="truncate text-text-secondary">{node.name}</span>
        </button>
        {isExpanded && node.children?.map(child => (
          <ChangeTreeItem
            key={child.path}
            node={child}
            depth={depth + 1}
            selectedFile={selectedFile}
            onSelectFile={onSelectFile}
            expandedDirs={expandedDirs}
            onToggleDir={onToggleDir}
          />
        ))}
      </>
    )
  }

  const Icon = STATUS_ICONS[node.status!] || FilePen
  const colorClass = STATUS_COLORS[node.status!] || 'text-text-secondary'
  const isSelected = selectedFile === node.path

  return (
    <button
      type="button"
      onClick={() => onSelectFile(node.path)}
      className={cn(
        'flex items-center gap-2 w-full py-0.5 px-1 text-left border-none transition-colors cursor-pointer rounded-sm',
        isSelected
          ? 'bg-accent-brand/10 text-text-primary'
          : 'bg-transparent text-text-secondary hover:bg-bg-hover-subtle',
      )}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
      tabIndex={0}
      aria-label={node.path}
    >
      <Icon size={12} className={cn(colorClass, 'shrink-0')} />
      <span className="text-xs truncate flex-1 min-w-0">{node.name}</span>
      {((node.insertions || 0) > 0 || (node.deletions || 0) > 0) && (
        <span className="text-xs font-mono shrink-0 flex items-center gap-1">
          {(node.insertions || 0) > 0 && <span className="text-accent-green">+{node.insertions}</span>}
          {(node.deletions || 0) > 0 && <span className="text-accent-red">-{node.deletions}</span>}
        </span>
      )}
    </button>
  )
}

const collectDirPaths = (nodes: ChangeTreeNode[]): string[] => {
  const dirs: string[] = []
  for (const n of nodes) {
    if (n.type === 'directory') {
      dirs.push(n.path)
      if (n.children) dirs.push(...collectDirPaths(n.children))
    }
  }
  return dirs
}

const FileChangeList = ({
  diffEntries,
  worktreePath,
  baseBranch,
  selectedFile,
  onSelectFile,
  onFullScreen,
}: FileChangeListProps) => {
  const { t } = useTranslation('chat')
  const [commitsExpanded, setCommitsExpanded] = useState(false)
  const [commits, setCommits] = useState<CommitInfo[]>([])
  const [loadingCommits, setLoadingCommits] = useState(false)
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())

  const changeTree = useMemo(() => buildChangeTree(diffEntries), [diffEntries])

  useEffect(() => {
    setExpandedDirs(new Set(collectDirPaths(changeTree)))
  }, [changeTree])

  const handleToggleDir = useCallback((path: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  useEffect(() => {
    if (!commitsExpanded || !worktreePath) return

    setLoadingCommits(true)
    const params = new URLSearchParams({ path: worktreePath, base: baseBranch })
    authFetch(`${API_BASE}/api/worktree/commits?${params}`)
      .then((res) => res.ok ? res.json() : Promise.reject(new Error()))
      .then((data) => setCommits(data.commits || []))
      .catch(() => setCommits([]))
      .finally(() => setLoadingCommits(false))
  }, [commitsExpanded, worktreePath, baseBranch])

  return (
    <div className="flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border-subtle/50 shrink-0">
        <span className="text-xs font-medium text-text-secondary">
          {t('changes.files', { defaultValue: 'Files' })}
        </span>
        <span className="text-xs text-text-secondary">
          ({diffEntries.length})
        </span>
        <span className="flex-1" />
        {onFullScreen && (
          <button
            type="button"
            onClick={onFullScreen}
            className="p-0.5 rounded text-text-secondary hover:text-text-primary transition-colors bg-transparent border-none cursor-pointer"
            tabIndex={0}
            aria-label="Full screen review"
          >
            <Maximize2 size={12} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 py-0.5">
        {changeTree.map(node => (
          <ChangeTreeItem
            key={node.path}
            node={node}
            depth={0}
            selectedFile={selectedFile}
            onSelectFile={onSelectFile}
            expandedDirs={expandedDirs}
            onToggleDir={handleToggleDir}
          />
        ))}
      </div>

      <div className="border-t border-border-subtle/50 shrink-0">
        <button
          type="button"
          onClick={() => setCommitsExpanded((p) => !p)}
          className="flex items-center gap-1.5 w-full px-3 py-1.5 text-left bg-transparent border-none cursor-pointer hover:bg-bg-hover-subtle transition-colors"
          tabIndex={0}
          aria-label="Toggle commits"
        >
          {commitsExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          <GitCommitHorizontal size={11} className="text-text-secondary opacity-60" />
          <span className="text-xs text-text-secondary font-medium">
            {t('changes.commits', { defaultValue: 'Commits' })}
          </span>
        </button>

        {commitsExpanded && (
          <div className="max-h-32 overflow-y-auto px-3 pb-1.5">
            {loadingCommits && (
              <div className="text-xs text-text-secondary py-1">Loading...</div>
            )}
            {!loadingCommits && commits.length === 0 && (
              <div className="text-xs text-text-secondary py-1">
                {t('changes.noCommits', { defaultValue: 'No commits yet' })}
              </div>
            )}
            {commits.map((commit) => (
              <div key={commit.hash} className="flex items-start gap-2 py-0.5">
                <span className="text-xs font-mono text-accent-brand shrink-0 mt-px">{commit.shortHash}</span>
                <span className="text-xs text-text-secondary truncate flex-1 min-w-0" title={commit.message}>
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
  )
}

export default FileChangeList
