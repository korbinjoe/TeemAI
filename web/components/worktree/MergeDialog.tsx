
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { GitMerge, AlertTriangle, CheckCircle, FileText, FilePlus, FileMinus, FileEdit, Loader2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'

import { API_BASE, authFetch } from '@/config/api'

interface DiffEntry {
  file: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  insertions: number
  deletions: number
}

interface MergeDialogProps {
  open: boolean
  worktreePath: string
  branch: string
  baseBranch: string
  chatId?: string
  onClose: () => void
  onMerged: () => void
}

const MergeDialog = ({ open, worktreePath, branch, baseBranch, chatId, onClose, onMerged }: MergeDialogProps) => {
  const { t } = useTranslation(['workspace', 'common'])
  const [files, setFiles] = useState<DiffEntry[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [merging, setMerging] = useState(false)
  const [autoResolving, setAutoResolving] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message?: string; conflicts?: string[]; autoResolving?: boolean } | null>(null)

  useEffect(() => {
    if (!open) return
    setResult(null)
    setLoadingFiles(true)
    authFetch(`${API_BASE}/api/worktree/diff?path=${encodeURIComponent(worktreePath)}&base=${encodeURIComponent(baseBranch)}`)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error()))
      .then((data) => setFiles(data.files || []))
      .catch(() => setFiles([]))
      .finally(() => setLoadingFiles(false))
  }, [open, worktreePath, baseBranch])

  const handleMerge = async () => {
    setMerging(true)
    setAutoResolving(false)
    try {
      const res = await authFetch(`${API_BASE}/api/worktree/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worktreePath, targetBranch: baseBranch, chatId }),
      })
      const data = await res.json()
      if (data.autoResolving) {
        setAutoResolving(true)
        setResult(null)
      } else {
        setResult(data)
        if (data.success) {
          setTimeout(() => onMerged(), 1500)
        }
      }
    } catch {
      setResult({ success: false, message: t('workspace:merge.networkError') })
    } finally {
      setMerging(false)
    }
  }

  const statusIcon = (status: DiffEntry['status']) => {
    switch (status) {
      case 'added': return <FilePlus size={12} className="text-accent-green" />
      case 'deleted': return <FileMinus size={12} className="text-accent-red" />
      case 'modified': return <FileEdit size={12} className="text-accent-yellow" />
      case 'renamed': return <FileText size={12} className="text-accent-brand" />
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5 text-sm">
            <GitMerge size={16} />
            {t('workspace:merge.title', { source: branch, target: baseBranch })}
          </DialogTitle>
          <DialogDescription>{t('workspace:merge.desc')}</DialogDescription>
        </DialogHeader>

        {/* Auto-resolving banner */}
        {autoResolving && (
          <div className="flex items-center gap-2 rounded-md border p-2.5 mb-3 bg-[rgba(59,130,246,0.1)] border-[rgba(59,130,246,0.3)]">
            <Loader2 size={16} className="text-accent-brand shrink-0 animate-spin" />
            <div>
              <div className="text-[13px] font-medium text-accent-brand">
                {t('workspace:merge.autoResolving', { defaultValue: 'Resolving conflicts...' })}
              </div>
              <div className="text-xs text-text-secondary mt-0.5">
                {t('workspace:merge.autoResolvingDesc', { defaultValue: 'An agent is resolving the merge conflicts. You can close this dialog — merge will complete automatically.' })}
              </div>
            </div>
          </div>
        )}

        {/* ResultTip */}
        {result && (
          <div className={`flex items-start gap-2 rounded-md border p-2.5 mb-3 ${
            result.success
              ? 'bg-[rgba(52,211,153,0.1)] border-[rgba(52,211,153,0.3)]'
              : 'bg-[rgba(229,72,77,0.1)] border-[rgba(229,72,77,0.3)]'
          }`}>
            {result.success ? (
              <CheckCircle size={16} className="text-accent-green shrink-0 mt-px" />
            ) : (
              <AlertTriangle size={16} className="text-accent-red shrink-0 mt-px" />
            )}
            <div>
              <div className={`text-[13px] font-medium ${result.success ? 'text-accent-green' : 'text-accent-red'}`}>
                {result.message || (result.success ? t('workspace:merge.success') : t('workspace:merge.failed'))}
              </div>
              {result.conflicts && result.conflicts.length > 0 && (
                <div className="mt-1.5 text-xs text-text-secondary">
                  <div className="mb-1 font-medium">{t('workspace:merge.conflictFiles')}</div>
                  {result.conflicts.map((f) => (
                    <div key={f} className="font-mono text-xs py-px">{f}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {loadingFiles ? (
          <div className="p-4 text-center text-text-secondary text-xs">
            {t('workspace:merge.loadingFiles')}
          </div>
        ) : files.length === 0 ? (
          <div className="p-4 text-center text-text-secondary text-xs">
            {t('workspace:merge.noChanges')}
          </div>
        ) : (
          <div className="max-h-[300px] overflow-y-auto border border-border-subtle rounded-md">
            <div className="px-2.5 py-1.5 text-xs text-text-secondary border-b border-border-subtle bg-bg-hover-subtle">
              {t('workspace:merge.fileChanges', { count: files.length })}
            </div>
            {files.map((f) => (
              <div
                key={f.file}
                className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-border-subtle text-xs"
              >
                {statusIcon(f.status)}
                <span className="flex-1 font-mono text-xs text-text-primary overflow-hidden text-ellipsis whitespace-nowrap">
                  {f.file}
                </span>
                <span className="text-xs text-text-secondary shrink-0">
                  {f.insertions > 0 && <span className="text-accent-green">+{f.insertions}</span>}
                  {f.insertions > 0 && f.deletions > 0 && ' '}
                  {f.deletions > 0 && <span className="text-accent-red">-{f.deletions}</span>}
                </span>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <button
            className="rounded-md border border-border bg-bg-primary px-3 py-1.5 text-xs text-text-primary hover:bg-bg-hover transition-colors"
            onClick={onClose}
            aria-label={t('common:action.cancel')}
            tabIndex={0}
          >
            {t('common:action.cancel')}
          </button>
          <button
            className="rounded-md bg-accent-brand px-3 py-1.5 text-xs text-white hover:bg-accent-brand/90 transition-colors disabled:opacity-50"
            onClick={handleMerge}
            disabled={merging || !!result?.success}
            aria-label={t('workspace:merge.confirmMerge')}
            tabIndex={0}
          >
            {merging ? t('workspace:merge.merging') : t('workspace:merge.confirmMerge')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default MergeDialog
