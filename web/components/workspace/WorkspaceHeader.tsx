import type { Ref } from 'react'
import type { TFunction } from 'i18next'
import { Pencil, Check, X, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isElectron, ELECTRON_TITLEBAR_PADDING } from '@/utils/env'

interface WorkspaceHeaderProps {
  workspaceId: string
  workspaceName: string
  isEditingName: boolean
  nameDraft: string
  setNameDraft: (v: string) => void
  nameInputRef: Ref<HTMLInputElement>
  onStartRename: () => void
  onNameSave: () => void
  onNameCancel: () => void
  onNewChat: () => void
  t: TFunction
}

const WorkspaceHeader = ({
  workspaceId,
  workspaceName,
  isEditingName,
  nameDraft,
  setNameDraft,
  nameInputRef,
  onStartRename,
  onNameSave,
  onNameCancel,
  onNewChat,
  t,
}: WorkspaceHeaderProps) => (
  <div
    className={cn(
      'h-9 border-b border-border-subtle flex items-center px-2.5 gap-1.5 shrink-0',
      isElectron && '-webkit-app-region-drag',
    )}
    style={{ paddingLeft: isElectron ? ELECTRON_TITLEBAR_PADDING : 14 }}
  >
    <nav className="flex items-center gap-1 text-xs -webkit-app-region-no-drag">
      {isEditingName ? (
        <span className="flex items-center gap-1">
          <input
            ref={nameInputRef}
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onNameSave()
              if (e.key === 'Escape') onNameCancel()
            }}
            onBlur={onNameSave}
            className="text-xs font-semibold text-text-emphasis bg-bg-input border border-accent-brand rounded px-1.5 py-0.5 outline-none w-[180px]"
          />
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={onNameSave}
            aria-label={t('workspace:confirmRename')}
            tabIndex={0}
            className="p-0.5 rounded text-accent-green hover:bg-bg-hover-muted transition-colors"
          >
            <Check size={12} />
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={onNameCancel}
            aria-label={t('workspace:cancelRename')}
            tabIndex={0}
            className="p-0.5 rounded text-text-secondary hover:bg-bg-hover-muted transition-colors"
          >
            <X size={12} />
          </button>
        </span>
      ) : (
        <span
          role="button"
          tabIndex={0}
          onClick={onStartRename}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onStartRename() }}
          className="text-text-emphasis font-semibold flex items-center gap-1 cursor-pointer hover:text-accent-brand transition-colors group/name"
        >
          {workspaceName}
          {workspaceId === 'default' && (
            <span className="text-xs px-1.5 py-px rounded bg-accent-brand/10 text-accent-brand font-normal">
              Default
            </span>
          )}
          <Pencil size={10} className="text-text-secondary opacity-0 group-hover/name:opacity-100 transition-opacity" />
        </span>
      )}
    </nav>

    <span className="flex-1" />

    <button
      onClick={onNewChat}
      aria-label={t('workspace:newChat.button')}
      tabIndex={0}
      className="inline-flex items-center gap-1 rounded bg-accent-brand px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 transition-opacity -webkit-app-region-no-drag"
    >
      <Plus size={12} />
      {t('workspace:newChat.button')}
    </button>
  </div>
)

export default WorkspaceHeader
