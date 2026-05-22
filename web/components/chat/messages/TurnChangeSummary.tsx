/**
 * TurnChangeSummary —
 *
 *  toolUse /
 */

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { FilePlus2, FilePen, FolderGit2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Message } from '@/types/chat'

export interface FileChange {
  path: string
  fileName: string
  operation: 'created' | 'modified'
}

interface TurnChangeSummaryProps {
  messages?: Message[]
  fileChanges?: FileChange[]
  onViewChanges?: () => void
  className?: string
}

export const extractFileChanges = (messages: Message[]): FileChange[] => {
  const changeMap = new Map<string, FileChange>()

  for (const msg of messages) {
    if (msg.type !== 'toolUse' || !msg.toolUse) continue
    const { toolName, input } = msg.toolUse
    try {
      const parsed = JSON.parse(input)
      const filePath: string | undefined = parsed.file_path
      if (!filePath) continue

      if (toolName === 'Write' || toolName === 'Edit' || toolName === 'MultiEdit') {
        const existing = changeMap.get(filePath)
        if (existing) {
          if (toolName === 'Edit' || toolName === 'MultiEdit') {
            existing.operation = 'modified'
          }
        } else {
          changeMap.set(filePath, {
            path: filePath,
            fileName: filePath.split('/').pop() || filePath,
            operation: (toolName === 'Edit' || toolName === 'MultiEdit') ? 'modified' : 'created',
          })
        }
      }
    } catch {
      /* ignore parse errors */
    }
  }
  return Array.from(changeMap.values())
}

const TurnChangeSummary = ({ messages, fileChanges: fileChangesProp, onViewChanges, className }: TurnChangeSummaryProps) => {
  const { t } = useTranslation('chat')
  const changes = useMemo(() => fileChangesProp ?? extractFileChanges(messages ?? []), [fileChangesProp, messages])

  if (changes.length === 0) return null

  const createdCount = changes.filter((c) => c.operation === 'created').length
  const modifiedCount = changes.filter((c) => c.operation === 'modified').length

  return (
    <div className={cn(
      'mx-4 my-1 rounded-lg border border-border-subtle bg-bg-elevated/50 overflow-hidden',
      className,
    )}>
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border-subtle/50">
        <FolderGit2 size={12} className="text-text-secondary opacity-60" />
        <span className="text-xs font-medium text-text-secondary">
          {t('turnChanges.title')}
        </span>
        <span className="text-xs text-text-secondary">
          {t('turnChanges.filesChanged', { count: changes.length })}
        </span>
        <span className="flex-1" />
        {onViewChanges && (
          <button
            type="button"
            onClick={onViewChanges}
            className="text-xs text-accent-brand hover:text-accent-brand/80 transition-colors cursor-pointer bg-transparent border-none"
            tabIndex={0}
            aria-label={t('turnChanges.viewChanges')}
          >
            {t('turnChanges.viewChanges')}
          </button>
        )}
      </div>

      {/* FileList */}
      <div className="px-3 py-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
        {changes.map((change) => (
          <button
            key={change.path}
            type="button"
            className="flex items-center gap-1.5 py-0.5 cursor-pointer hover:text-text-primary transition-colors bg-transparent border-none"
            title={change.path}
            onClick={() => window.dispatchEvent(new CustomEvent('ide:open-file', { detail: { filePath: change.path } }))}
          >
            {change.operation === 'created' ? (
              <FilePlus2 size={11} className="text-accent-green shrink-0" />
            ) : (
              <FilePen size={11} className="text-accent-brand shrink-0" />
            )}
            <span className="text-xs text-text-secondary truncate max-w-[200px] hover:text-text-primary">
              {change.fileName}
            </span>
          </button>
        ))}
      </div>

      {(createdCount > 0 || modifiedCount > 0) && (
        <div className="px-3 py-1 border-t border-border-subtle/30 flex items-center gap-3">
          {createdCount > 0 && (
            <span className="text-xs text-accent-green flex items-center gap-1">
              <FilePlus2 size={9} />
              {createdCount} {t('turnChanges.created')}
            </span>
          )}
          {modifiedCount > 0 && (
            <span className="text-xs text-accent-brand flex items-center gap-1">
              <FilePen size={9} />
              {modifiedCount} {t('turnChanges.modified')}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export default TurnChangeSummary
