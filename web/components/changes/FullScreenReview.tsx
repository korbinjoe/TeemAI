/**
 * FullScreenReview —  Code Review Overlay
 *
 *  240px  + Commits Monaco side-by-side DiffEditor
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import '@/lib/monaco'
import { DiffEditor } from '@monaco-editor/react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  X, GitMerge, ExternalLink, Trash2, Lock, Pencil, Save, Loader2,
} from 'lucide-react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { API_BASE, authFetch } from '@/config/api'
import FileChangeList from './FileChangeList'
import type { editor as MonacoEditor } from 'monaco-editor/esm/vs/editor/editor.api'

interface DiffEntry {
  file: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  insertions: number
  deletions: number
}

interface FullScreenReviewProps {
  open: boolean
  onClose: () => void
  worktreePath: string
  baseBranch: string
  diffEntries: DiffEntry[]
  agentActive: boolean
  onMerge?: () => void
  onDiscard?: () => void
}

import { getLanguage } from '@/components/ide/utils'

const FullScreenReview = ({
  open,
  onClose,
  worktreePath,
  baseBranch,
  diffEntries,
  agentActive,
  onMerge,
  onDiscard,
}: FullScreenReviewProps) => {
  const { t } = useTranslation('chat')
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [original, setOriginal] = useState('')
  const [modified, setModified] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const diffEditorRef = useRef<MonacoEditor.IStandaloneDiffEditor | null>(null)

  const readOnly = agentActive

  useEffect(() => {
    if (open && diffEntries.length > 0 && !selectedFile) {
      setSelectedFile(diffEntries[0].file)
    }
  }, [open, diffEntries, selectedFile])

  useEffect(() => {
    if (!open) {
      setSelectedFile(null)
      setOriginal('')
      setModified('')
      setDirty(false)
    }
  }, [open])

  useEffect(() => {
    if (!open || !selectedFile || !worktreePath) {
      setOriginal('')
      setModified('')
      return
    }

    if (abortRef.current) abortRef.current.abort()
    const abort = new AbortController()
    abortRef.current = abort

    setLoading(true)
    setDirty(false)

    const params = new URLSearchParams({ path: worktreePath, file: selectedFile, base: baseBranch })

    Promise.all([
      authFetch(`${API_BASE}/api/worktree/file-base-content?${params}`, { signal: abort.signal })
        .then((r) => r.ok ? r.json() : { content: '' }),
      authFetch(`${API_BASE}/api/worktree/file-content?${params}`, { signal: abort.signal })
        .then((r) => r.ok ? r.json() : { content: '' }),
    ])
      .then(([baseData, currentData]) => {
        if (abort.signal.aborted) return
        setOriginal(baseData.content || '')
        setModified(currentData.content || '')
      })
      .catch((err) => {
        if (err.name !== 'AbortError') console.warn('[FullScreenReview] Load error:', err)
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false)
      })

    return () => abort.abort()
  }, [open, selectedFile, worktreePath, baseBranch])

  const handleSave = useCallback(async () => {
    if (!selectedFile || !worktreePath || readOnly || saving) return
    const editor = diffEditorRef.current
    if (!editor) return

    const content = editor.getModifiedEditor().getValue()
    setSaving(true)
    try {
      const res = await authFetch(`${API_BASE}/api/worktree/save-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worktreePath, filePath: selectedFile, content }),
      })
      if (!res.ok) throw new Error('Save failed')
      setModified(content)
      setDirty(false)
      const fileName = selectedFile.split('/').pop() || selectedFile
      toast.success(t('changes.saved', { file: fileName, defaultValue: `${fileName} saved` }))
    } catch {
      toast.error(t('changes.saveFailed', { defaultValue: 'Save failed' }))
    } finally {
      setSaving(false)
    }
  }, [selectedFile, worktreePath, readOnly, saving, t])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!readOnly && (e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
        return
      }
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      if (e.key === '[' || e.key === ']') {
        e.preventDefault()
        const currentIdx = selectedFile ? diffEntries.findIndex((d) => d.file === selectedFile) : -1
        if (e.key === '[' && currentIdx > 0) {
          setSelectedFile(diffEntries[currentIdx - 1].file)
          setDirty(false)
        } else if (e.key === ']' && currentIdx < diffEntries.length - 1) {
          setSelectedFile(diffEntries[currentIdx + 1].file)
          setDirty(false)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, readOnly, handleSave, selectedFile, diffEntries])

  const handleDiffEditorMount = useCallback((editor: MonacoEditor.IStandaloneDiffEditor) => {
    diffEditorRef.current = editor
    editor.getModifiedEditor().onDidChangeModelContent(() => {
      setDirty(true)
    })
  }, [])

  const language = selectedFile ? getLanguage(selectedFile) : 'plaintext'

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80" />
        <DialogPrimitive.Content
          className="fixed inset-2 z-50 flex flex-col rounded-lg bg-bg-primary border border-border overflow-hidden"
          aria-label={t('changes.fullScreen', { defaultValue: 'Full Screen Review' })}
        >
          {/* Top bar */}
          <div className="flex items-center gap-3 px-4 py-2 border-b border-border shrink-0 bg-bg-secondary">
            <span className="text-sm font-medium text-text-emphasis">
              {t('changes.fullScreen', { defaultValue: 'Full Screen Review' })}
            </span>
            {selectedFile && (
              <span className="text-xs font-mono text-text-secondary truncate">
                {selectedFile}
              </span>
            )}
            <span className="flex-1" />

            {/* SaveStatus */}
            {!readOnly && dirty && (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1 px-2 py-1 text-xs text-accent-brand bg-accent-brand/10 rounded border-none cursor-pointer hover:bg-accent-brand/20 transition-colors disabled:opacity-50"
                tabIndex={0}
                aria-label="Save"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                {t('changes.save', { defaultValue: 'Save' })}
              </button>
            )}

            {readOnly ? (
              <span className="flex items-center gap-1 text-xs text-text-secondary">
                <Lock size={12} />
                {t('changes.readOnly', { defaultValue: 'Read-only' })}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-accent-green">
                <Pencil size={12} />
                {t('changes.editable', { defaultValue: 'Editable' })}
              </span>
            )}

            <DialogPrimitive.Close
              className="p-1 rounded hover:bg-bg-hover-subtle transition-colors bg-transparent border-none cursor-pointer"
              aria-label="Close"
              tabIndex={0}
            >
              <X size={16} className="text-text-secondary" />
            </DialogPrimitive.Close>
          </div>

          <div className="flex flex-1 min-h-0">
            <aside className="w-60 border-r border-border overflow-hidden shrink-0">
              <FileChangeList
                diffEntries={diffEntries}
                worktreePath={worktreePath}
                baseBranch={baseBranch}
                selectedFile={selectedFile}
                onSelectFile={(file) => {
                  setSelectedFile(file)
                  setDirty(false)
                }}
              />
            </aside>

            <main className="flex-1 min-w-0">
              {loading ? (
                <div className="flex items-center justify-center gap-2 text-text-secondary text-sm h-full">
                  <Loader2 size={14} className="animate-spin" />
                  {t('changes.loading', { defaultValue: 'Loading...' })}
                </div>
              ) : !selectedFile ? (
                <div className="flex items-center justify-center text-text-secondary text-sm h-full select-none">
                  {t('changes.selectFile', { defaultValue: 'Select a file to view diff' })}
                </div>
              ) : (
                <DiffEditor
                  original={original}
                  modified={modified}
                  language={language}
                  theme="vs-dark"
                  onMount={handleDiffEditorMount}
                  options={{
                    readOnly,
                    renderSideBySide: true,
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    wordWrap: 'off',
                    renderOverviewRuler: true,
                  }}
                />
              )}
            </main>
          </div>

          <div className="flex items-center gap-3 px-4 py-2 border-t border-border shrink-0 bg-bg-secondary">
            <span className="flex-1" />
            {onDiscard && (
              <button
                type="button"
                onClick={onDiscard}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-accent-red bg-transparent border border-accent-red/30 rounded cursor-pointer hover:bg-accent-red/10 transition-colors"
                tabIndex={0}
                aria-label={t('changes.discardChanges', { defaultValue: 'Discard Changes' })}
              >
                <Trash2 size={12} />
                {t('changes.discardChanges', { defaultValue: 'Discard Changes' })}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (selectedFile) {
                  window.open(`vscode://file${worktreePath}/${selectedFile}`, '_blank')
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-secondary bg-transparent border border-border rounded cursor-pointer hover:bg-bg-hover-subtle transition-colors"
              tabIndex={0}
              aria-label={t('changes.openInIde', { defaultValue: 'Open in IDE' })}
            >
              <ExternalLink size={12} />
              {t('changes.openInIde', { defaultValue: 'Open in IDE' })}
            </button>
            {onMerge && (
              <button
                type="button"
                onClick={onMerge}
                disabled={agentActive}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white bg-accent-brand rounded border-none cursor-pointer hover:bg-accent-brand/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                tabIndex={0}
                aria-label={t('changes.merge', { branch: baseBranch, defaultValue: `Merge to ${baseBranch}` })}
              >
                <GitMerge size={12} />
                {t('changes.merge', { branch: baseBranch, defaultValue: `Merge to ${baseBranch}` })}
              </button>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export default FullScreenReview
