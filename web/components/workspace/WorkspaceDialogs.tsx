import { useState } from 'react'
import type { TFunction } from 'i18next'
import {
  FolderOpen, Search, Loader2, GitBranch,
} from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { DEFAULT_MODELS, DEFAULT_MODEL } from '@/lib/models'
import type { Chat, Repository } from './types'

/* ── NewChatDialog ─────────────────────────────────────── */

interface NewChatDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  creating: boolean
  onCreateChat: (title: string, model: string) => void
  t: TFunction
}

export const NewChatDialog = ({ open, onOpenChange, creating, onCreateChat, t }: NewChatDialogProps) => {
  const [title, setTitle] = useState('')
  const [model, setModel] = useState(DEFAULT_MODEL)

  const handleOpenChange = (v: boolean) => {
    if (!v) {
      setTitle('')
      setModel(DEFAULT_MODEL)
    }
    onOpenChange(v)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('workspace:newChat.title')}</DialogTitle>
          <DialogDescription>{t('workspace:newChat.desc')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 mt-3">
          <div>
            <div className="text-xs mb-1 text-text-secondary">{t('workspace:newChat.titleLabel')}</div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('workspace:newChat.titlePlaceholder')}
              className="w-full rounded-md border border-border bg-bg-input px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-brand"
            />
          </div>
          <div>
            <div className="text-xs mb-1 text-text-secondary">{t('workspace:newChat.modelLabel')}</div>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEFAULT_MODELS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <button
            onClick={() => handleOpenChange(false)}
            className="rounded px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            {t('common:action.cancel')}
          </button>
          <button
            onClick={() => onCreateChat(title, model)}
            disabled={creating}
            className="rounded bg-accent-brand px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? t('workspace:newChat.creating') : t('common:action.create')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ── DeleteChatDialog ──────────────────────────────────── */

interface DeleteChatDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  chats: Chat[]
  deleteChatId: string | null
  onConfirm: () => void
  t: TFunction
}

export const DeleteChatDialog = ({ open, onOpenChange, chats, deleteChatId, onConfirm, t }: DeleteChatDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t('workspace:deleteChat.title')}</DialogTitle>
        <DialogDescription>
          {t('workspace:deleteChat.desc')}
          {(() => {
            const chat = chats.find((c) => c.id === deleteChatId)
            const wtCount = chat?.worktreeSessions?.length ?? 0
            if (wtCount > 0) {
              return (
                <span className="block mt-1 text-accent-red">
                  {t('workspace:deleteChat.willCleanWorktrees', { count: wtCount })}
                </span>
              )
            }
            return null
          })()}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <button
          onClick={() => onOpenChange(false)}
          className="rounded px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
        >
          {t('common:action.cancel')}
        </button>
        <button
          onClick={onConfirm}
          className="rounded bg-accent-red px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition-opacity"
        >
          {t('common:action.delete')}
        </button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
)

/* ── AddRepoDialog ─────────────────────────────────────── */

interface AddRepoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  repoSearch: string
  onSearchChange: (v: string) => void
  searchLoading: boolean
  searchResults: Array<{ name: string; path: string }>
  selectedPath: string | null
  detecting: boolean
  isGitRepo: boolean | null
  addingRepo: boolean
  onSelectPath: (path: string) => void
  onAddRepo: () => void
  t: TFunction
}

export const AddRepoDialog = ({
  open, onOpenChange, repoSearch, onSearchChange, searchLoading,
  searchResults, selectedPath, detecting, isGitRepo, addingRepo,
  onSelectPath, onAddRepo, t,
}: AddRepoDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t('workspace:repo.addRepo')}</DialogTitle>
        <DialogDescription>{t('workspace:repo.addRepoDesc')}</DialogDescription>
      </DialogHeader>
      <div className="mt-3">
        <div className="flex items-center gap-1.5 border border-border rounded-md px-2.5 py-1.5 bg-bg-input">
          <Search size={12} className="text-text-secondary shrink-0" />
          <input
            value={repoSearch}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('workspace:repo.searchPlaceholder')}
            className="bg-transparent border-none outline-none text-text-primary text-xs w-full"
            autoFocus
          />
          {searchLoading && <Loader2 size={12} className="animate-spin text-text-secondary shrink-0" />}
        </div>

        {searchResults.length > 0 && (
          <div className="mt-2 max-h-[200px] overflow-y-auto border border-border rounded-md">
            {searchResults.map((dir) => (
              <button
                key={dir.path}
                onClick={() => onSelectPath(dir.path)}
                tabIndex={0}
                aria-label={`${t('workspace:repo.select')} ${dir.path}`}
                className={cn(
                  'w-full text-left px-3 py-2 text-xs border-b border-border-subtle last:border-b-0 cursor-pointer transition-colors',
                  'bg-transparent border-none hover:bg-bg-hover-subtle',
                  selectedPath === dir.path && 'bg-accent-brand/10',
                )}
              >
                <div className="flex items-center gap-1.5">
                  <FolderOpen size={11} className="text-text-secondary shrink-0" />
                  <span className="text-text-primary font-medium">{dir.name}</span>
                </div>
                <div className="text-xs text-text-secondary mt-0.5 pl-[17px] truncate">
                  {dir.path}
                </div>
              </button>
            ))}
          </div>
        )}

        {selectedPath && (
          <div className="mt-2 px-3 py-2 rounded-md border border-border-subtle bg-bg-hover-subtle">
            <div className="text-xs text-text-primary font-medium truncate">{selectedPath}</div>
            <div className="mt-1 text-xs flex items-center gap-1">
              {detecting ? (
                <span className="text-text-secondary flex items-center gap-1">
                  <Loader2 size={10} className="animate-spin" />
                  {t('workspace:repo.detecting')}
                </span>
              ) : isGitRepo === true ? (
                <span className="text-accent-green flex items-center gap-1">
                  <GitBranch size={10} />
                  Git
                </span>
              ) : isGitRepo === false ? (
                <span className="text-accent-red">{t('workspace:repo.notGitRepo')}</span>
              ) : null}
            </div>
          </div>
        )}
      </div>
      <DialogFooter>
        <button
          onClick={() => onOpenChange(false)}
          className="rounded px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
        >
          {t('common:action.cancel')}
        </button>
        <button
          onClick={onAddRepo}
          disabled={!selectedPath || addingRepo || detecting}
          className="rounded bg-accent-brand px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {addingRepo ? <Loader2 size={12} className="animate-spin" /> : t('workspace:repo.addRepo')}
        </button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
)

/* ── RemoveRepoDialog ──────────────────────────────────── */

interface RemoveRepoDialogProps {
  repo: Repository | null
  onClose: () => void
  onConfirm: () => void
  t: TFunction
}

export const RemoveRepoDialog = ({ repo, onClose, onConfirm, t }: RemoveRepoDialogProps) => (
  <Dialog open={!!repo} onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t('workspace:repo.removeConfirmTitle')}</DialogTitle>
        <DialogDescription>
          {t('workspace:repo.removeConfirmDesc', { name: repo?.name })}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <button
          onClick={onClose}
          className="rounded px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
        >
          {t('common:action.cancel')}
        </button>
        <button
          onClick={onConfirm}
          className="rounded bg-accent-red px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition-opacity"
        >
          {t('workspace:repo.removeRepo')}
        </button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
)

/* ── CleanWorktreesDialog ──────────────────────────────── */

interface CleanWorktreesDialogProps {
  repo: Repository | null
  cleaning: boolean
  onClose: () => void
  onConfirm: () => void
  t: TFunction
}

export const CleanWorktreesDialog = ({ repo, cleaning, onClose, onConfirm, t }: CleanWorktreesDialogProps) => (
  <Dialog open={!!repo} onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t('workspace:repo.cleanConfirmTitle')}</DialogTitle>
        <DialogDescription>
          {t('workspace:repo.cleanConfirmDesc', { name: repo?.name })}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <button
          onClick={onClose}
          className="rounded px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
        >
          {t('common:action.cancel')}
        </button>
        <button
          onClick={onConfirm}
          disabled={cleaning}
          className="rounded bg-accent-red px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {cleaning ? <Loader2 size={12} className="animate-spin" /> : t('workspace:repo.cleanWorktrees')}
        </button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
)
