/**
 * CommitPanel — VS Code Source Control  Git
 *
 * Staged+ Changes
 * + stage / − unstage / ⤺ discard
 *  +  + Push
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  Plus,
  Minus,
  Undo2,
  ChevronDown,
  ChevronRight,
  Check,
  ArrowUp,
  File,
  Folder,
  FolderOpen,
  Sparkles,
  Loader2,
  Settings2,
  RefreshCcw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { API_BASE } from '@/config/api'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import type { GitStatusData } from '@/hooks/useGitStatus'

interface CommitPanelProps {
  gitStatus: GitStatusData
  onSelectFile?: (file: string, staged: boolean) => void
  selectedFile?: string | null
  onOptimisticUpdate?: (updater: (prev: GitStatusData) => GitStatusData) => void
  className?: string
  onPushed?: () => void
}

type DiffEntry = GitStatusData['diffEntries'][number]

const STATUS_LETTER: Record<DiffEntry['status'], string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
  renamed: 'R',
}

const STATUS_COLOR: Record<DiffEntry['status'], string> = {
  added: 'text-green-500',
  modified: 'text-amber-500',
  deleted: 'text-red-500',
  renamed: 'text-blue-500',
}

const groupByFolder = (entries: DiffEntry[]): Map<string, DiffEntry[]> => {
  const groups = new Map<string, DiffEntry[]>()
  for (const entry of entries) {
    const lastSlash = entry.file.lastIndexOf('/')
    const folder = lastSlash === -1 ? '' : entry.file.slice(0, lastSlash)
    const existing = groups.get(folder) || []
    existing.push(entry)
    groups.set(folder, existing)
  }
  return groups
}

const fireApi = async (url: string, body: Record<string, unknown>) => {
  try {
    const res = await fetch(`${API_BASE}${url}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Request failed')
    return data
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Git operation failed')
    throw err
  }
}

const CommitPanel = ({ gitStatus, onSelectFile, selectedFile, onOptimisticUpdate, className, onPushed }: CommitPanelProps) => {
  const { t } = useTranslation('workspace')
  const { worktreePath, aheadCount, diffEntries } = gitStatus

  const [commitMessage, setCommitMessage] = useState('')
  const [committing, setCommitting] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [showPromptEditor, setShowPromptEditor] = useState(false)
  const [commitPrompt, setCommitPrompt] = useState(() => localStorage.getItem('commit-msg-prompt') || DEFAULT_COMMIT_PROMPT)
  const commitTextareaRef = useRef<HTMLTextAreaElement>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [stagedCollapsed, setStagedCollapsed] = useState(false)
  const [changesCollapsed, setChangesCollapsed] = useState(false)
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set())

  useEffect(() => {
    const el = commitTextareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [commitMessage])

  const stagedEntries = useMemo(() => diffEntries.filter((e) => e.staged), [diffEntries])
  const unstagedEntries = useMemo(() => diffEntries.filter((e) => !e.staged), [diffEntries])

  const handleStage = useCallback((files: string[]) => {
    fireApi('/api/git/stage', { path: worktreePath, files })
  }, [worktreePath])

  const handleUnstage = useCallback((files: string[]) => {
    fireApi('/api/git/unstage', { path: worktreePath, files })
  }, [worktreePath])

  const handleDiscard = useCallback((files: string[]) => {
    const confirmed = window.confirm(
      t('commitPanel.discardConfirm', { count: files.length })
    )
    if (!confirmed) return
    fireApi('/api/git/discard', { path: worktreePath, files })
  }, [worktreePath])

  const handleCommit = useCallback(async () => {
    if (!commitMessage.trim() || stagedEntries.length === 0) return
    setCommitting(true)
    try {
      const result = await fireApi('/api/git/commit', { path: worktreePath, message: commitMessage.trim() })
      setCommitMessage('')
      toast.success(t('commitPanel.committed', { hash: result.commitHash }))
      onOptimisticUpdate?.((prev) => ({
        ...prev,
        diffEntries: prev.diffEntries.filter((e) => !e.staged),
        changedFiles: prev.diffEntries.filter((e) => !e.staged).length,
        aheadCount: prev.aheadCount + 1,
        insertions: prev.diffEntries.filter((e) => !e.staged).reduce((s, e) => s + e.insertions, 0),
        deletions: prev.diffEntries.filter((e) => !e.staged).reduce((s, e) => s + e.deletions, 0),
      }))
    } finally {
      setCommitting(false)
    }
  }, [commitMessage, stagedEntries.length, worktreePath, onOptimisticUpdate])

  const handlePush = useCallback(async () => {
    setPushing(true)
    try {
      await fireApi('/api/git/push', { path: worktreePath })
      toast.success(t('commitPanel.pushSuccess'))
      onOptimisticUpdate?.((prev) => ({ ...prev, aheadCount: 0 }))
      onPushed?.()
    } finally {
      setPushing(false)
    }
  }, [worktreePath, onPushed, onOptimisticUpdate])

  const handleSavePrompt = useCallback((value: string) => {
    setCommitPrompt(value)
    localStorage.setItem('commit-msg-prompt', value)
    setShowPromptEditor(false)
  }, [])

  const handleGenerateMessage = useCallback(async () => {
    if (generating || stagedEntries.length === 0) return
    setGenerating(true)
    try {
      const data = await fireApi('/api/git/generate-commit-message', {
        path: worktreePath,
        customPrompt: commitPrompt || undefined,
      })
      if (data.message) setCommitMessage(data.message)
    } finally {
      setGenerating(false)
    }
  }, [generating, stagedEntries.length, worktreePath, commitPrompt])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleCommit()
    }
  }, [handleCommit])

  const handleRefreshStatus = useCallback(async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      const params = new URLSearchParams({ path: worktreePath })
      const res = await fetch(`${API_BASE}/api/git/working-changes?${params}`)
      if (res.ok) {
        const snapshot = await res.json()
        onOptimisticUpdate?.(() => snapshot)
      }
    } catch { /* ignore */ }
    finally { setRefreshing(false) }
  }, [refreshing, worktreePath, onOptimisticUpdate])

  const toggleFolder = useCallback((folder: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folder)) next.delete(folder)
      else next.add(folder)
      return next
    })
  }, [])

  const renderFileList = (entries: DiffEntry[], mode: 'staged' | 'changes') => {
    const groups = groupByFolder(entries)
    const sortedFolders = Array.from(groups.keys()).sort()

    return sortedFolders.map((folder) => {
      const files = groups.get(folder)!
      const folderKey = `${mode}:${folder}`
      const isCollapsed = collapsedFolders.has(folderKey)

      if (folder === '') {
        return files.map((entry) => (
          <FileRow
            key={`${mode}:${entry.file}`}
            entry={entry}
            mode={mode}
            depth={1}
            selected={selectedFile === entry.file}
            onStage={() => handleStage([entry.file])}
            onUnstage={() => handleUnstage([entry.file])}
            onDiscard={() => handleDiscard([entry.file])}
            onSelect={() => onSelectFile?.(entry.file, entry.staged)}
          />
        ))
      }

      return (
        <div key={folderKey}>
          <button
            type="button"
            className="group flex items-center gap-1 w-full text-left py-0.5 px-1 text-xs hover:bg-bg-hover transition-colors rounded-sm"
            style={{ paddingLeft: `${1 * 12 + 4}px` }}
            onClick={() => toggleFolder(folderKey)}
          >
            {isCollapsed
              ? <ChevronRight size={12} className="shrink-0 text-text-muted" />
              : <ChevronDown size={12} className="shrink-0 text-text-muted" />
            }
            {isCollapsed
              ? <Folder size={13} className="shrink-0 text-accent-brand/70" />
              : <FolderOpen size={13} className="shrink-0 text-accent-brand/70" />
            }
            <span className="text-text-primary truncate flex-1">{folder}</span>
            <span className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
              {mode === 'changes' && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="p-0.5 rounded hover:bg-bg-hover text-text-muted hover:text-red-400"
                        onClick={(e) => { e.stopPropagation(); handleDiscard(files.map((f) => f.file)) }}
                      >
                        <Undo2 size={12} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">{t('commitPanel.discardFolder')}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="p-0.5 rounded hover:bg-bg-hover text-text-muted hover:text-green-400"
                        onClick={(e) => { e.stopPropagation(); handleStage(files.map((f) => f.file)) }}
                      >
                        <Plus size={12} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">{t('commitPanel.stageFolder')}</TooltipContent>
                  </Tooltip>
                </>
              )}
              {mode === 'staged' && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="p-0.5 rounded hover:bg-bg-hover text-text-muted hover:text-yellow-400"
                      onClick={(e) => { e.stopPropagation(); handleUnstage(files.map((f) => f.file)) }}
                    >
                      <Minus size={12} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{t('commitPanel.unstageFolder')}</TooltipContent>
                </Tooltip>
              )}
            </span>
          </button>
          {!isCollapsed && files.map((entry) => (
            <FileRow
              key={`${mode}:${entry.file}`}
              entry={entry}
              mode={mode}
              depth={2}
              selected={selectedFile === entry.file}
              onStage={() => handleStage([entry.file])}
              onUnstage={() => handleUnstage([entry.file])}
              onDiscard={() => handleDiscard([entry.file])}
              onSelect={() => onSelectFile?.(entry.file, entry.staged)}
            />
          ))}
        </div>
      )
    })
  }

  return (
    <div className={cn('flex flex-col h-full overflow-hidden', className)}>
      {/* Commit Message Input */}
      <div className="px-2 pt-2 pb-1 shrink-0 relative">
        <textarea
          ref={commitTextareaRef}
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Commit message"
          rows={1}
          className="w-full bg-bg-primary border border-border-subtle rounded px-2 py-1.5 pr-11 text-xs text-text-primary resize-none focus:outline-none focus:border-accent-brand/50 placeholder:text-text-muted overflow-hidden"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setShowPromptEditor(!showPromptEditor)}
                className={cn(
                  'p-0.5 rounded transition-colors',
                  commitPrompt !== DEFAULT_COMMIT_PROMPT ? 'text-accent-brand' : 'text-text-muted hover:text-accent-brand',
                )}
              >
                <Settings2 size={12} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">{t('commitPanel.customizePrompt')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleGenerateMessage}
                disabled={generating || stagedEntries.length === 0}
                className="p-0.5 rounded text-text-muted hover:text-accent-brand transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">{t('commitPanel.aiGenerate')}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Prompt EditPanel */}
      {showPromptEditor && (
        <PromptEditor
          value={commitPrompt}
          onSave={handleSavePrompt}
          onCancel={() => setShowPromptEditor(false)}
        />
      )}

      {/* SubmitButton + Push */}
      <div className="px-2 pb-2 shrink-0 flex gap-1">
        <button
          type="button"
          onClick={handleCommit}
          disabled={committing || stagedEntries.length === 0 || !commitMessage.trim()}
          className={cn(
            'flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors',
            stagedEntries.length > 0 && commitMessage.trim()
              ? 'bg-accent-brand text-white hover:bg-accent-brand/90 cursor-pointer'
              : 'bg-bg-secondary text-text-secondary cursor-not-allowed',
          )}
        >
          <Check size={12} />
          {committing ? t('commitPanel.committing') : stagedEntries.length > 0 ? t('commitPanel.commitCount', { count: stagedEntries.length }) : t('commitPanel.commit')}
        </button>
        {aheadCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handlePush}
                disabled={pushing}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all cursor-pointer',
                  pushing
                    ? 'bg-bg-secondary text-text-muted cursor-not-allowed'
                    : 'bg-accent-brand/15 text-accent-brand hover:bg-accent-brand/25 border border-accent-brand/20 hover:border-accent-brand/40',
                )}
              >
                <ArrowUp size={12} className={cn(pushing && 'animate-bounce')} />
                {pushing ? t('commitPanel.pushing') : t('commitPanel.push')}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">{t('commitPanel.pushTooltip', { count: aheadCount })}</TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 py-1">
        {stagedEntries.length > 0 && (
          <div>
            <div
              className="group flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium text-text-secondary uppercase tracking-wider border-b border-border-subtle bg-bg-primary cursor-pointer select-none"
              onClick={() => setStagedCollapsed(!stagedCollapsed)}
            >
              {stagedCollapsed
                ? <ChevronRight size={12} className="shrink-0 text-text-muted" />
                : <ChevronDown size={12} className="shrink-0 text-text-muted" />
              }
              <span>{t('commitPanel.stagedChanges')}</span>
              <span className="text-[10px] font-normal opacity-60">{stagedEntries.length}</span>
              <span className="flex-1" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="p-0.5 rounded hover:bg-bg-hover text-text-muted hover:text-yellow-400"
                    onClick={(e) => { e.stopPropagation(); handleUnstage(stagedEntries.map((e) => e.file)) }}
                  >
                    <Minus size={12} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">{t('commitPanel.unstageAll')}</TooltipContent>
              </Tooltip>
            </div>
            {!stagedCollapsed && renderFileList(stagedEntries, 'staged')}
          </div>
        )}

        {unstagedEntries.length > 0 && (
          <div>
            <div
              className="group flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium text-text-secondary uppercase tracking-wider border-b border-border-subtle bg-bg-primary cursor-pointer select-none"
              onClick={() => setChangesCollapsed(!changesCollapsed)}
            >
              {changesCollapsed
                ? <ChevronRight size={12} className="shrink-0 text-text-muted" />
                : <ChevronDown size={12} className="shrink-0 text-text-muted" />
              }
              <span>{t('commitPanel.changes')}</span>
              <span className="text-[10px] font-normal opacity-60">{unstagedEntries.length}</span>
              <span className="flex-1" />
              <span className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="p-0.5 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary"
                      onClick={(e) => { e.stopPropagation(); handleRefreshStatus() }}
                    >
                      <RefreshCcw size={12} className={cn(refreshing && 'animate-spin')} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{t('commitPanel.refreshStatus')}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="p-0.5 rounded hover:bg-bg-hover text-text-muted hover:text-red-400"
                      onClick={(e) => { e.stopPropagation(); handleDiscard(unstagedEntries.map((e) => e.file)) }}
                    >
                      <Undo2 size={12} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{t('commitPanel.discardAll')}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="p-0.5 rounded hover:bg-bg-hover text-text-muted hover:text-green-400"
                      onClick={(e) => { e.stopPropagation(); handleStage(unstagedEntries.map((e) => e.file)) }}
                    >
                      <Plus size={12} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{t('commitPanel.stageAll')}</TooltipContent>
                </Tooltip>
              </span>
            </div>
            {!changesCollapsed && renderFileList(unstagedEntries, 'changes')}
          </div>
        )}

        {diffEntries.length === 0 && (
          <div className="flex items-center justify-center py-8 text-text-muted text-xs">
            No changes
          </div>
        )}
      </div>
    </div>
  )
}

interface FileRowProps {
  entry: DiffEntry
  mode: 'staged' | 'changes'
  depth: number
  selected?: boolean
  onStage: () => void
  onUnstage: () => void
  onDiscard: () => void
  onSelect?: () => void
}

const FileRow = ({ entry, mode, depth, selected, onStage, onUnstage, onDiscard, onSelect }: FileRowProps) => {
  const { t } = useTranslation('workspace')
  const fileName = entry.file.includes('/') ? entry.file.split('/').pop() : entry.file
  const statusColor = STATUS_COLOR[entry.status] || ''
  const statusLetter = STATUS_LETTER[entry.status] || '?'

  return (
    <button
      type="button"
      className={cn(
        'group flex items-center gap-1 w-full text-left py-0.5 px-1 text-xs hover:bg-bg-hover transition-colors rounded-sm',
        selected && 'bg-accent-brand/15 text-accent-brand',
      )}
      style={{ paddingLeft: `${depth * 12 + 4}px` }}
      onClick={onSelect}
    >
      <span className="w-3 shrink-0" />
      <File size={13} className="shrink-0 text-text-muted" />
      <span className="truncate" title={entry.file}>
        {fileName}
      </span>
      {(entry.insertions > 0 || entry.deletions > 0) && (
        <span className="shrink-0 text-[10px] font-mono leading-none flex items-center gap-0.5">
          {entry.insertions > 0 && <span className="text-green-500">+{entry.insertions}</span>}
          {entry.deletions > 0 && <span className="text-red-500">-{entry.deletions}</span>}
        </span>
      )}
      <span className="flex-1" />
      <span className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity shrink-0">
        {mode === 'changes' && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="p-0.5 rounded hover:bg-bg-hover text-text-muted hover:text-red-400"
                  onClick={(e) => { e.stopPropagation(); onDiscard() }}
                >
                  <Undo2 size={12} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{t('commitPanel.discardFile')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="p-0.5 rounded hover:bg-bg-hover text-text-muted hover:text-green-400"
                  onClick={(e) => { e.stopPropagation(); onStage() }}
                >
                  <Plus size={12} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{t('commitPanel.stageFile')}</TooltipContent>
            </Tooltip>
          </>
        )}
        {mode === 'staged' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="p-0.5 rounded hover:bg-bg-hover text-text-muted hover:text-yellow-400"
                onClick={(e) => { e.stopPropagation(); onUnstage() }}
              >
                <Minus size={12} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">{t('commitPanel.unstageFile')}</TooltipContent>
          </Tooltip>
        )}
      </span>
      {/* StatusLabel */}
      <span className={cn('shrink-0 text-[10px] font-mono leading-none', statusColor)}>
        {statusLetter}
      </span>
    </button>
  )
}

const DEFAULT_COMMIT_PROMPT = `Based on the current Git staged changes, generate a commit message following Conventional Commits format (feat/fix/docs/style/refactor/perf/test/chore). Include functional and structural changes. Output only the message content without explanation. Use sub-list (-) format for multiple changes.`

interface PromptEditorProps {
  value: string
  onSave: (value: string) => void
  onCancel: () => void
}

const PromptEditor = ({ value, onSave, onCancel }: PromptEditorProps) => {
  const { t } = useTranslation('workspace')
  const [draft, setDraft] = useState(value)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [draft])

  return (
    <div className="px-2 pb-1.5 shrink-0 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-text-secondary">{t('commitPanel.promptLabel')}</span>
        <button
          type="button"
          onClick={() => setDraft(DEFAULT_COMMIT_PROMPT)}
          className="text-[10px] text-text-muted hover:text-accent-brand transition-colors"
        >
          {t('commitPanel.resetDefault')}
        </button>
      </div>
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={1}
        className="w-full bg-bg-primary border border-border-subtle rounded px-2 py-1.5 text-[11px] text-text-primary resize-none focus:outline-none focus:border-accent-brand/50 overflow-hidden"
      />
      <div className="flex items-center gap-1 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-2 py-0.5 rounded text-[11px] text-text-secondary hover:bg-bg-hover transition-colors"
        >
          {t('commitPanel.cancel')}
        </button>
        <button
          type="button"
          onClick={() => onSave(draft)}
          className="px-2 py-0.5 rounded text-[11px] bg-accent-brand/15 text-accent-brand hover:bg-accent-brand/25 transition-colors"
        >
          {t('commitPanel.save')}
        </button>
      </div>
    </div>
  )
}

export default CommitPanel
