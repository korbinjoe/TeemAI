/**
 * InlineDiffViewer — Monaco DiffEditor
 *
 * Phase 2:  diff
 * Phase 3:  + Cmd+S  + Diff/Code
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import '@/lib/monaco'
import { DiffEditor, Editor } from '@monaco-editor/react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Lock, Pencil, Save, Loader2, FileCode, FileDiff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { API_BASE, authFetch } from '@/config/api'
import type { editor as MonacoEditor } from 'monaco-editor/esm/vs/editor/editor.api'

interface InlineDiffViewerProps {
  worktreePath: string
  filePath: string | null
  baseBranch: string
  readOnly?: boolean
  className?: string
  onSaved?: (filePath: string) => void
  refreshKey?: number
}

import { getLanguage } from '@/components/ide/utils'

const InlineDiffViewer = ({
  worktreePath,
  filePath,
  baseBranch,
  readOnly = true,
  className,
  onSaved,
  refreshKey,
}: InlineDiffViewerProps) => {
  const { t } = useTranslation('chat')
  const [original, setOriginal] = useState('')
  const [modified, setModified] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [viewMode, _setViewMode] = useState<'diff' | 'code'>('diff')
  const setViewMode = useCallback((mode: 'diff' | 'code') => {
    if (mode !== 'diff' && diffEditorRef.current) {
      try { diffEditorRef.current.setModel(null) } catch { /* ignore */ }
      diffEditorRef.current = null
    }
    _setViewMode(mode)
  }, [])
  const [dirty, setDirty] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const diffEditorRef = useRef<MonacoEditor.IStandaloneDiffEditor | null>(null)

  const language = useMemo(() => filePath ? getLanguage(filePath) : 'plaintext', [filePath])

  const handleSave = useCallback(async () => {
    if (!filePath || !worktreePath || readOnly || saving) return

    let content: string | undefined
    if (viewMode === 'code' && editorRef.current) {
      content = editorRef.current.getValue()
    } else if (viewMode === 'diff' && diffEditorRef.current) {
      content = diffEditorRef.current.getModifiedEditor().getValue()
    }
    if (content === undefined) return

    setSaving(true)
    try {
      const res = await authFetch(`${API_BASE}/api/worktree/save-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worktreePath, filePath, content }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Save failed')
      }
      setModified(content)
      setDirty(false)
      const fileName = filePath.split('/').pop() || filePath
      toast.success(t('changes.saved', { file: fileName, defaultValue: `${fileName} saved` }))
      onSaved?.(filePath)
    } catch (err) {
      toast.error(t('changes.saveFailed', { defaultValue: 'Save failed' }))
    } finally {
      setSaving(false)
    }
  }, [filePath, worktreePath, readOnly, saving, viewMode, t, onSaved])

  useEffect(() => {
    if (!filePath || !worktreePath) {
      setOriginal('')
      setModified('')
      setDirty(false)
      return
    }

    if (abortRef.current) abortRef.current.abort()
    const abort = new AbortController()
    abortRef.current = abort

    setLoading(true)
    setDirty(false)

    const params = new URLSearchParams({ path: worktreePath, file: filePath, base: baseBranch })

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
        if (err.name !== 'AbortError') console.warn('[InlineDiffViewer] Load error:', err)
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false)
      })

    return () => abort.abort()
  }, [filePath, worktreePath, baseBranch, refreshKey])

  useEffect(() => {
    return () => {
      if (diffEditorRef.current) {
        try { diffEditorRef.current.setModel(null) } catch { /* ignore */ }
        diffEditorRef.current = null
      }
      if (editorRef.current) {
        editorRef.current = null
      }
    }
  }, [])

  // DiffEditor mount — Register Cmd+S
  const handleDiffEditorMount = useCallback((editor: MonacoEditor.IStandaloneDiffEditor) => {
    diffEditorRef.current = editor
    const modifiedEditor = editor.getModifiedEditor()
    const originalEditor = editor.getOriginalEditor()

    originalEditor.updateOptions({ lineNumbers: 'off', lineNumbersMinChars: 0, glyphMargin: false })

    modifiedEditor.onDidChangeModelContent(() => {
      setDirty(true)
    })
  }, [])

  // Code Editor mount — Register Cmd+S
  const handleCodeEditorMount = useCallback((editor: MonacoEditor.IStandaloneCodeEditor) => {
    editorRef.current = editor

    editor.onDidChangeModelContent(() => {
      setDirty(true)
    })
  }, [])

  useEffect(() => {
    if (readOnly) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [readOnly, handleSave])

  if (!filePath) {
    return (
      <div className={cn('flex items-center justify-center text-text-secondary text-sm h-full select-none', className)}>
        {t('changes.selectFile', { defaultValue: 'Select a file to view diff' })}
      </div>
    )
  }

  if (loading) {
    return (
      <div className={cn('flex items-center justify-center gap-2 text-text-secondary text-sm h-full', className)}>
        <Loader2 size={14} className="animate-spin" />
        {t('changes.loading', { defaultValue: 'Loading...' })}
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      <div className="flex items-center gap-2 px-3 py-1 border-b border-border-subtle/50 shrink-0 bg-bg-secondary/50">
        <span className="text-xs font-mono text-text-secondary truncate" title={filePath}>
          {filePath}
        </span>
        {dirty && !readOnly && (
          <span className="text-xs text-accent-yellow font-medium">
            {t('changes.unsaved', { defaultValue: 'Unsaved' })}
          </span>
        )}
        <span className="flex-1" />

        {/* Diff / Code Switch */}
        <div className="flex items-center rounded overflow-hidden border border-border-subtle/50">
          <button
            type="button"
            onClick={() => setViewMode('diff')}
            className={cn(
              'flex items-center gap-1 px-1.5 py-0.5 text-xs border-none cursor-pointer transition-colors',
              viewMode === 'diff'
                ? 'bg-accent-brand/15 text-accent-brand'
                : 'bg-transparent text-text-secondary hover:text-text-secondary',
            )}
            tabIndex={0}
            aria-label="Diff view"
          >
            <FileDiff size={10} />
            Diff
          </button>
          <button
            type="button"
            onClick={() => setViewMode('code')}
            className={cn(
              'flex items-center gap-1 px-1.5 py-0.5 text-xs border-none cursor-pointer transition-colors',
              viewMode === 'code'
                ? 'bg-accent-brand/15 text-accent-brand'
                : 'bg-transparent text-text-secondary hover:text-text-secondary',
            )}
            tabIndex={0}
            aria-label="Code view"
          >
            <FileCode size={10} />
            Code
          </button>
        </div>

        {/* SaveButton */}
        {!readOnly && dirty && (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1 px-1.5 py-0.5 text-xs text-accent-brand bg-accent-brand/10 rounded border-none cursor-pointer hover:bg-accent-brand/20 transition-colors disabled:opacity-50"
            tabIndex={0}
            aria-label="Save file"
          >
            {saving ? <Loader2 size={9} className="animate-spin" /> : <Save size={9} />}
            {t('changes.save', { defaultValue: 'Save' })}
          </button>
        )}

        {readOnly ? (
          <span className="flex items-center gap-1 text-xs text-text-secondary">
            <Lock size={9} />
            {t('changes.readOnly', { defaultValue: 'Read-only' })}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-accent-green">
            <Pencil size={9} />
            {t('changes.editable', { defaultValue: 'Editable' })}
          </span>
        )}
      </div>

      {/* Monaco Editor */}
      <style>{`
        .inline-diff-wrap .margin-view-overlays .insert-sign,
        .inline-diff-wrap .margin-view-overlays .delete-sign,
        .inline-diff-wrap .margin-view-overlays .cgmr {
          display: none !important;
        }
      `}</style>
      <div className="flex-1 min-h-0 inline-diff-wrap">
        {viewMode === 'diff' ? (
          <DiffEditor
            original={original}
            modified={modified}
            language={language}
            theme="vs-dark"
            onMount={handleDiffEditorMount}
            options={{
              readOnly,
              renderSideBySide: false,
              minimap: { enabled: false },
              fontSize: 12,
              lineNumbers: 'on',
              glyphMargin: false,
              folding: false,
              lineDecorationsWidth: 8,
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              diffWordWrap: 'on',
              renderOverviewRuler: true,
              renderMarginRevertIcon: false,
              renderIndicators: false,
              renderGutterMenu: false,
              contextmenu: false,
            }}
          />
        ) : (
          <Editor
            value={modified}
            language={language}
            theme="vs-dark"
            onMount={handleCodeEditorMount}
            onChange={(value) => {
              if (value !== undefined) setModified(value)
            }}
            options={{
              readOnly,
              minimap: { enabled: false },
              fontSize: 12,
              lineNumbers: 'on',
              glyphMargin: false,
              folding: false,
              lineDecorationsWidth: 8,
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              contextmenu: false,
            }}
          />
        )}
      </div>
    </div>
  )
}

export default InlineDiffViewer
