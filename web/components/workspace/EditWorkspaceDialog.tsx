import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderOpen, FolderPlus, Trash2, Loader2, RefreshCw } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface RepoEntry {
  id: string
  path: string
  name: string
}

interface EditWorkspaceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  initialName: string
  initialRepos: RepoEntry[]
  saving: boolean
  onSave: (name: string, repos: RepoEntry[]) => void
  onBrowseDir: (onPick: (path: string) => void) => void
}

const EditWorkspaceDialog = ({
  open, onOpenChange,
  workspaceId: _workspaceId,
  initialName, initialRepos,
  saving,
  onSave, onBrowseDir,
}: EditWorkspaceDialogProps) => {
  const { t } = useTranslation(['workspace', 'common'])
  const [name, setName] = useState(initialName)
  const [repos, setRepos] = useState<RepoEntry[]>(initialRepos)

  useEffect(() => {
    if (open) {
      setName(initialName)
      setRepos(initialRepos)
    }
  }, [open, initialName, initialRepos])

  const handleAddRepo = () => {
    onBrowseDir((path) => {
      if (repos.some((r) => r.path === path)) return
      const id = path.split('/').filter(Boolean).pop() || 'repo'
      setRepos([...repos, { id: crypto.randomUUID?.() ?? id, path, name: path.split('/').pop() || path }])
    })
  }

  const handleChangeRepo = (index: number) => {
    onBrowseDir((path) => {
      setRepos(repos.map((r, i) =>
        i === index ? { ...r, path, name: path.split('/').pop() || path } : r
      ))
    })
  }

  const handleRemoveRepo = (index: number) => {
    setRepos(repos.filter((_, i) => i !== index))
  }

  const handleSave = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onSave(trimmed, repos)
  }

  const canSave = name.trim().length > 0 && repos.length > 0 && !saving

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader className="mb-4">
          <DialogTitle>{t('workspace:editDialog.title')}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 mt-2">
          {/* Name */}
          <div>
            <label className="text-xs text-text-secondary mb-1 block">
              {t('workspace:editDialog.nameLabel')}
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('workspace:editDialog.namePlaceholder')}
              autoFocus
              className="w-full h-8 rounded-md border border-border bg-bg-input px-3 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-brand"
            />
          </div>

          {/* Repos */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-text-secondary">
                {t('workspace:editDialog.reposLabel')}
              </label>
              <button
                onClick={handleAddRepo}
                className="inline-flex items-center gap-1 text-xs text-accent-brand hover:opacity-80 transition-opacity"
              >
                <FolderPlus size={12} />
                {t('workspace:editDialog.addRepo')}
              </button>
            </div>

            {repos.length === 0 ? (
              <div className="rounded-md border border-dashed border-border px-3 py-4 text-center">
                <div className="text-xs text-text-secondary">No directories configured</div>
              </div>
            ) : (
              <div className="rounded-md border border-border divide-y divide-border-subtle">
                {repos.map((repo, index) => (
                  <div key={repo.id} className="flex items-center gap-2 px-3 py-2">
                    <FolderOpen size={12} className="shrink-0 text-text-secondary" />
                    <span
                      className="flex-1 text-xs text-text-primary truncate"
                      title={repo.path}
                    >
                      {repo.path}
                    </span>
                    <button
                      onClick={() => handleChangeRepo(index)}
                      title={t('workspace:editDialog.changeRepo')}
                      className="shrink-0 p-0.5 rounded-sm text-text-muted hover:text-accent-brand hover:bg-bg-hover transition-colors"
                    >
                      <RefreshCw size={11} />
                    </button>
                    {repos.length > 1 && (
                      <button
                        onClick={() => handleRemoveRepo(index)}
                        title={t('workspace:editDialog.removeRepo')}
                        className="shrink-0 p-0.5 rounded-sm text-text-muted hover:text-accent-red hover:bg-bg-hover transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 mt-4">
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-md border border-border bg-bg-primary px-3 py-1.5 text-xs text-text-primary hover:bg-bg-hover transition-colors"
          >
            {t('common:action.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="rounded-md bg-accent-brand px-3 py-1.5 text-xs text-primary-foreground hover:bg-accent-brand/90 transition-colors disabled:opacity-50"
          >
            {saving ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 size={12} className="animate-spin" />
                {t('workspace:editDialog.saving')}
              </span>
            ) : (
              t('workspace:editDialog.save')
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default EditWorkspaceDialog
