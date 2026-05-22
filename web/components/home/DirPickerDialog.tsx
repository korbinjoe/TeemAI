import { useTranslation } from 'react-i18next'
import { FolderOpen, FolderPlus, ChevronRight, Search, Check, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { DirEntry } from './types'
import DirBtn from './DirBtn'

interface DirPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  browsePath: string
  homeDir: string
  dirs: DirEntry[]
  loadingDirs: boolean
  dirSearch: string
  onDirSearchChange: (v: string) => void
  searchResults: DirEntry[]
  searchLoading: boolean
  newFolderMode: boolean
  onNewFolderModeChange: (v: boolean) => void
  newFolderName: string
  onNewFolderNameChange: (v: string) => void
  newFolderError: string
  onNewFolderErrorChange: (v: string) => void
  pickingForCreateWs: boolean
  onLoadDirs: (path: string) => void
  onPickAndLaunch: (path: string) => void
  onCreateFolder: () => void
}

const DirPickerDialog = ({
  open, onOpenChange,
  browsePath, homeDir,
  dirs, loadingDirs,
  dirSearch, onDirSearchChange,
  searchResults, searchLoading,
  newFolderMode, onNewFolderModeChange,
  newFolderName, onNewFolderNameChange,
  newFolderError, onNewFolderErrorChange,
  pickingForCreateWs,
  onLoadDirs, onPickAndLaunch, onCreateFolder,
}: DirPickerDialogProps) => {
  const { t } = useTranslation(['home', 'common'])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[700px]">
        <DialogHeader className="mb-4">
          <DialogTitle>{t('home:dirPicker.browse', { path: browsePath })}</DialogTitle>
        </DialogHeader>
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="flex items-center gap-1.5 border-b border-border p-2">
            <Search size={13} className="text-text-secondary" />
            <input
              value={dirSearch}
              onChange={(e) => onDirSearchChange(e.target.value)}
              placeholder={t('home:dirPicker.searchFolder')}
              className="w-full rounded-md border border-border bg-bg-input px-2 py-1 text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-accent-brand"
              aria-label={t('home:dirPicker.searchFolder')}
            />
          </div>
          <div className="flex gap-2 border-b border-border p-2">
            <DirBtn onClick={() => onLoadDirs(homeDir)}>Home</DirBtn>
            <DirBtn onClick={() => onLoadDirs(browsePath.split('/').slice(0, -1).join('/') || '/')}>{t('home:dirPicker.parent')}</DirBtn>
            <DirBtn variant="primary" onClick={() => onPickAndLaunch(browsePath)}>
              {pickingForCreateWs ? t('home:addRepo') : t('home:dirPicker.selectAndStart')}
            </DirBtn>
            <DirBtn onClick={() => { onNewFolderModeChange(true); onNewFolderNameChange(''); onNewFolderErrorChange('') }}>
              <FolderPlus size={13} />
              {t('home:dirPicker.newFolder')}
            </DirBtn>
          </div>
          {newFolderMode && (
            <div className="flex items-center gap-1.5 border-b border-border p-2">
              <FolderPlus size={14} className="shrink-0 text-text-secondary" />
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => { onNewFolderNameChange(e.target.value); onNewFolderErrorChange('') }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onCreateFolder()
                  if (e.key === 'Escape') onNewFolderModeChange(false)
                }}
                placeholder={t('home:dirPicker.folderName')}
                className={cn(
                  'flex-1 rounded-md border bg-bg-input px-2 py-1 text-xs text-text-primary outline-none',
                  newFolderError ? 'border-accent-red' : 'border-border',
                )}
                aria-label={t('home:dirPicker.newFolderName')}
              />
              <DirBtn variant="primary" onClick={onCreateFolder} disabled={!newFolderName.trim()}>
                <Check size={13} />
              </DirBtn>
              <DirBtn onClick={() => onNewFolderModeChange(false)}>
                <X size={13} />
              </DirBtn>
              {newFolderError && (
                <span className="whitespace-nowrap text-xs text-accent-red">{newFolderError}</span>
              )}
            </div>
          )}
          <div className="max-h-[360px] overflow-y-auto">
            {dirSearch.trim().length > 0 ? (
              <>
                {searchLoading && <div className="p-3 text-xs text-text-secondary">{t('home:dirPicker.searching')}</div>}
                {!searchLoading && searchResults.length === 0 && (
                  <div className="p-3 text-xs text-text-secondary">{t('home:dirPicker.noMatchFolder')}</div>
                )}
                {!searchLoading && searchResults.map((d) => (
                  <button
                    key={`search-${d.path}`}
                    onClick={() => onPickAndLaunch(d.path)}
                    className="flex w-full items-center justify-between border-b border-border-subtle bg-transparent px-3 py-2 text-left text-xs text-text-primary cursor-pointer hover:bg-bg-hover-subtle"
                    title={d.path}
                  >
                    <span className="flex items-center gap-1.5">
                      <FolderOpen size={12} />
                      {d.path}
                    </span>
                    <ChevronRight size={12} className="opacity-60" />
                  </button>
                ))}
              </>
            ) : (
              <>
                {loadingDirs && <div className="p-3 text-xs text-text-secondary">{t('home:dirPicker.loadingDirs')}</div>}
                {!loadingDirs && dirs.length === 0 && <div className="p-3 text-xs text-text-secondary">{t('home:dirPicker.emptyOrNoPermission')}</div>}
                {!loadingDirs && dirs.map((d) => (
                  <button
                    key={d.path}
                    onClick={() => onLoadDirs(d.path)}
                    className="flex w-full items-center justify-between border-b border-border-subtle bg-transparent px-3 py-2 text-left text-xs text-text-primary cursor-pointer hover:bg-bg-hover-subtle"
                  >
                    <span className="flex items-center gap-1.5">
                      <FolderOpen size={12} />
                      {d.name}
                    </span>
                    <ChevronRight size={12} className="opacity-60" />
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default DirPickerDialog
