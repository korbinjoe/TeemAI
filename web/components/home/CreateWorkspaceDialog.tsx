import { useTranslation } from 'react-i18next'
import { FolderOpen, FolderPlus, Plus, Loader2, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface CreateWorkspaceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  name: string
  onNameChange: (name: string) => void
  repos: string[]
  creating: boolean
  dirHistory: string[]
  onAddRepo: () => void
  onRemoveRepo: (path: string) => void
  onQuickSelectRepo: (path: string) => void
  onCreate: (andStart: boolean) => void
}

const CreateWorkspaceDialog = ({
  open, onOpenChange,
  name, onNameChange,
  repos,
  creating,
  dirHistory,
  onAddRepo,
  onRemoveRepo,
  onQuickSelectRepo,
  onCreate,
}: CreateWorkspaceDialogProps) => {
  const { t } = useTranslation(['home', 'common'])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader className="mb-4">
          <DialogTitle>{t('home:createWorkspace')}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 mt-2">
          {/* Workspace Name */}
          <div>
            <label className="text-xs text-text-secondary mb-1 block">{t('home:workspaceName')}</label>
            <input
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder={t('home:workspaceNamePlaceholder')}
              autoFocus
              className="w-full h-8 rounded-md border border-border bg-bg-input px-3 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-brand"
              aria-label={t('home:workspaceName')}
            />
          </div>

          {/* Repo list */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-text-secondary">{t('home:repoList')}</label>
              <button
                onClick={onAddRepo}
                aria-label={t('home:addRepo')}
                tabIndex={0}
                className="inline-flex items-center gap-1 text-xs text-accent-brand hover:opacity-80 transition-opacity"
              >
                <FolderPlus size={12} />
                {t('home:addRepo')}
              </button>
            </div>

            {repos.length === 0 ? (
              <div className="rounded-md border border-dashed border-border px-3 py-4 text-center">
                <div className="text-xs text-text-secondary">{t('home:noRepoSelected')}</div>
              </div>
            ) : (
              <div className="rounded-md border border-border divide-y divide-border-subtle">
                {repos.map((path) => (
                  <div key={path} className="flex items-center gap-2 px-3 py-2">
                    <FolderOpen size={12} className="shrink-0 text-text-secondary" />
                    <span className="flex-1 text-xs text-text-primary truncate" title={path}>
                      {path}
                    </span>
                    <button
                      onClick={() => onRemoveRepo(path)}
                      aria-label={`${t('common:action.delete')} ${path}`}
                      tabIndex={0}
                      className="shrink-0 p-0.5 rounded-sm text-text-muted hover:text-accent-red hover:bg-bg-hover transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Quick select from dir history */}
            {dirHistory.length > 0 && repos.length < 5 && (
              <div className="mt-2">
                <div className="text-xs text-text-secondary mb-1">{t('home:quickSelect')}</div>
                <div className="flex flex-wrap gap-1">
                  {dirHistory
                    .filter((p) => !repos.includes(p))
                    .slice(0, 6)
                    .map((path) => (
                      <button
                        key={path}
                        onClick={() => onQuickSelectRepo(path)}
                        aria-label={`${t('home:addRepo')} ${path}`}
                        tabIndex={0}
                        className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-xs text-text-secondary hover:border-accent-brand/30 hover:text-text-primary transition-colors"
                      >
                        <Plus size={9} />
                        <span className="truncate max-w-[100px]">{path.split('/').pop()}</span>
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer buttons */}
        <div className="flex items-center justify-end gap-2 mt-4">
          <button
            onClick={() => onOpenChange(false)}
            aria-label={t('common:action.cancel')}
            tabIndex={0}
            className="rounded-md border border-border bg-bg-primary px-3 py-1.5 text-xs text-text-primary hover:bg-bg-hover transition-colors"
          >
            {t('common:action.cancel')}
          </button>
          <button
            onClick={() => onCreate(false)}
            disabled={!name.trim() || repos.length === 0 || creating}
            aria-label={t('home:createOnly')}
            tabIndex={0}
            className="rounded-md border border-border bg-bg-primary px-3 py-1.5 text-xs text-text-primary hover:bg-bg-hover transition-colors disabled:opacity-50"
          >
            {t('home:createOnly')}
          </button>
          <button
            onClick={() => onCreate(true)}
            disabled={!name.trim() || repos.length === 0 || creating}
            aria-label={t('home:createAndStart')}
            tabIndex={0}
            className="rounded-md bg-accent-brand px-3 py-1.5 text-xs text-primary-foreground hover:bg-accent-brand/90 transition-colors disabled:opacity-50"
          >
            {creating ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 size={12} className="animate-spin" />
                {t('home:creating')}
              </span>
            ) : (
              t('home:createAndStart')
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default CreateWorkspaceDialog
