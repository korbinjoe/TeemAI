import { Clock3, X, Trash2, ImageIcon, AtSign } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { QueuedMessage } from '@/types/chat'

interface Props {
  queue: QueuedMessage[]
  onRemove: (id: string) => void
  onClear: () => void
}

const QueuedMessagesBar = ({ queue, onRemove, onClear }: Props) => {
  const { t } = useTranslation('chat')
  if (queue.length === 0) return null

  return (
    <div className="px-4 pt-1.5 pb-0.5 shrink-0">
      <div className="border border-border-subtle bg-bg-elevated rounded-md overflow-hidden">
        <div className="flex items-center justify-between gap-2 pl-3 pr-1.5 py-1 border-b border-border-subtle/70">
          <div className="min-w-0 flex items-center gap-1.5 text-[11px] text-text-muted">
            <Clock3 size={11} className="shrink-0 opacity-70" />
            <span>{t('queue.queuing')} <span className="font-medium text-text-secondary tabular-nums">{queue.length}</span></span>
          </div>
          <button
            type="button"
            onClick={onClear}
            title="Clear queue"
            aria-label="Clear queue"
            className="shrink-0 inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-accent-red hover:bg-bg-hover px-1.5 py-0.5 rounded transition-colors cursor-pointer"
          >
            <Trash2 size={11} />
            Clear
          </button>
        </div>

        <ul className="max-h-[180px] overflow-y-auto">
          {queue.map((item, idx) => {
            const preview = item.text.trim() || (item.images.length > 0 ? `[${t('queue.imageCount', { count: item.images.length })}]` : '')
            return (
              <li
                key={item.id}
                title={item.text}
                className={cn(
                  'group flex items-center gap-2 pl-3 pr-1.5 py-1 text-xs text-text-secondary',
                  'transition-colors hover:bg-bg-hover',
                )}
              >
                <span className="shrink-0 w-4 text-[10px] tabular-nums text-text-muted/60 text-right">{idx + 1}</span>
                <span className="flex-1 min-w-0 truncate">{preview}</span>
                {item.mentions.length > 0 && (
                  <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] text-text-muted/80" title={t('queue.mentionCount', { count: item.mentions.length })}>
                    <AtSign size={10} />
                    {item.mentions.length}
                  </span>
                )}
                {item.images.length > 0 && (
                  <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] text-text-muted/80" title={t('queue.imageCount', { count: item.images.length })}>
                    <ImageIcon size={10} />
                    {item.images.length}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  title="Remove"
                  aria-label={t('queue.removeItem')}
                  className={cn(
                    'shrink-0 w-5 h-5 rounded flex items-center justify-center cursor-pointer',
                    'text-text-muted hover:text-accent-red hover:bg-bg-hover',
                    'opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity',
                  )}
                >
                  <X size={12} />
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

export default QueuedMessagesBar
