/**
 * WhiteboardSidebar — chat
 *
 *  useWhiteboard hook 7
 *   goal → open_question → handoff → constraint → decision → progress → artifact
 *
 *   -  Agent  /  /
 *   -  active
 *   -  entryId / by / refs
 */

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Target,
  HelpCircle,
  ArrowRightLeft,
  Lock,
  CheckCircle2,
  Activity,
  Package,
  Archive,
  Loader2,
  AlertCircle,
  RefreshCw,
  List,
  GanttChart,
} from 'lucide-react'
import { useWhiteboard } from '@/hooks/useWhiteboard'
import { cn } from '@/lib/utils'
import type { WhiteboardEntry, WhiteboardEntryType } from '@shared/whiteboard-types'
import WhiteboardFlowView from '../whiteboard/flow/WhiteboardFlowView'

type ViewMode = 'list' | 'canvas'
const VIEW_STORAGE_KEY = 'whiteboard.view'

const readStoredView = (): ViewMode => {
  if (typeof window === 'undefined') return 'list'
  const v = window.localStorage.getItem(VIEW_STORAGE_KEY)
  return v === 'canvas' ? 'canvas' : 'list'
}

interface WhiteboardSidebarProps {
  chatId: string | undefined
  actor?: string
  className?: string
}

const TYPE_META: Record<WhiteboardEntryType, { labelKey: string; icon: typeof Target; tone: string }> = {
  goal:          { labelKey: 'whiteboard.goal',         icon: Target,         tone: 'text-accent-brand' },
  open_question: { labelKey: 'whiteboard.openQuestion', icon: HelpCircle,     tone: 'text-amber-500' },
  handoff:       { labelKey: 'whiteboard.handoff',      icon: ArrowRightLeft, tone: 'text-sky-500' },
  constraint:    { labelKey: 'whiteboard.constraint',   icon: Lock,           tone: 'text-rose-500' },
  decision:      { labelKey: 'whiteboard.decision',     icon: CheckCircle2,   tone: 'text-emerald-500' },
  progress:      { labelKey: 'whiteboard.progress',     icon: Activity,       tone: 'text-text-secondary' },
  artifact:      { labelKey: 'whiteboard.artifact',     icon: Package,        tone: 'text-violet-500' },
}

const RENDER_ORDER: WhiteboardEntryType[] = [
  'open_question', 'handoff', 'constraint', 'decision', 'progress', 'artifact',
]

const formatRelative = (iso: string, t: (key: string, opts?: Record<string, unknown>) => string): string => {
  if (!iso) return ''
  const ts = new Date(iso).getTime()
  if (!Number.isFinite(ts)) return ''
  const diffMs = Date.now() - ts
  const sec = Math.max(0, Math.floor(diffMs / 1000))
  if (sec < 60) return t('whiteboard.timeAgo.seconds', { count: sec })
  const min = Math.floor(sec / 60)
  if (min < 60) return t('whiteboard.timeAgo.minutes', { count: min })
  const hr = Math.floor(min / 60)
  if (hr < 24) return t('whiteboard.timeAgo.hours', { count: hr })
  const day = Math.floor(hr / 24)
  return t('whiteboard.timeAgo.days', { count: day })
}

interface EntryRowProps {
  entry: WhiteboardEntry
  onArchive: (id: string) => void
  archivingId: string | null
  t: (key: string, opts?: Record<string, unknown>) => string
}

const EntryRow = ({ entry, onArchive, archivingId, t }: EntryRowProps) => {
  const meta = TYPE_META[entry.type]
  const Icon = meta.icon
  const isArchiving = archivingId === entry.id
  return (
    <div className="group flex items-start gap-2 px-2 py-1.5 rounded hover:bg-bg-hover transition-colors">
      <Icon size={13} className={cn('mt-0.5 shrink-0', meta.tone)} />
      <div className="min-w-0 flex-1">
        <div className="text-xs text-text-primary leading-snug break-words">{entry.summary}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-text-muted">
          <span>{entry.by}</span>
          <span>·</span>
          <span>{formatRelative(entry.timestamp, t)}</span>
          {entry.refs?.files?.length ? (
            <>
              <span>·</span>
              <span title={entry.refs.files.join(', ')}>files {entry.refs.files.length}</span>
            </>
          ) : null}
          {entry.tags?.length ? (
            <>
              <span>·</span>
              <span className="truncate" title={entry.tags.join(', ')}>{entry.tags.join(',')}</span>
            </>
          ) : null}
        </div>
      </div>
      <button
        onClick={() => onArchive(entry.id)}
        disabled={isArchiving}
        className="opacity-0 group-hover:opacity-100 shrink-0 p-1 rounded text-text-muted hover:text-text-primary hover:bg-bg-secondary disabled:opacity-50 transition-opacity"
        title={t('whiteboard.archive')}
        aria-label={t('whiteboard.archiveEntry')}
      >
        {isArchiving ? <Loader2 size={11} className="animate-spin" /> : <Archive size={11} />}
      </button>
    </div>
  )
}

const WhiteboardSidebar = ({ chatId, actor = 'user', className }: WhiteboardSidebarProps) => {
  const { t } = useTranslation('chat')
  const { loading, error, goal, active, archivedCount, workflowTasks, refresh, archive } = useWhiteboard(chatId)
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>(readStoredView)

  useEffect(() => {
    window.localStorage.setItem(VIEW_STORAGE_KEY, view)
  }, [view])

  const grouped = useMemo(() => {
    const map = new Map<WhiteboardEntryType, WhiteboardEntry[]>()
    for (const e of active) {
      const list = map.get(e.type) ?? []
      list.push(e)
      map.set(e.type, list)
    }
    return map
  }, [active])

  const handleArchive = async (entryId: string) => {
    setArchivingId(entryId)
    try {
      await archive(entryId, actor)
    } catch (e) {
      console.error('whiteboard.archive failed', e)
    } finally {
      setArchivingId(null)
    }
  }

  if (!chatId) {
    return (
      <div className={cn('h-full flex items-center justify-center text-text-muted text-xs', className)}>
        {t('whiteboard.selectChat')}
      </div>
    )
  }

  return (
    <div className={cn('h-full flex flex-col bg-bg-primary', className)}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border-subtle shrink-0">
        <div className="flex items-center gap-2 text-xs text-text-secondary min-w-0">
          <span className="font-medium text-text-primary shrink-0">{t('whiteboard.warRoom')}</span>
          {archivedCount > 0 && (
            <span className="text-[10px] text-text-muted truncate">{t('whiteboard.archived', { count: archivedCount })}</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* ViewSwitch segmented */}
          <div
            className="inline-flex rounded-md border border-border-subtle bg-bg-secondary p-0.5"
            role="tablist"
            aria-label={t('whiteboard.viewLabel')}
          >
            <button
              role="tab"
              aria-selected={view === 'list'}
              onClick={() => setView('list')}
              className={cn(
                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors',
                view === 'list'
                  ? 'bg-bg-primary text-text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-primary',
              )}
              title={t('whiteboard.listView')}
              aria-label={t('whiteboard.listViewLabel')}
            >
              <List size={11} />
              <span>{t('whiteboard.listView')}</span>
            </button>
            <button
              role="tab"
              aria-selected={view === 'canvas'}
              onClick={() => setView('canvas')}
              className={cn(
                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors',
                view === 'canvas'
                  ? 'bg-bg-primary text-text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-primary',
              )}
              title={t('whiteboard.timelineView')}
              aria-label={t('whiteboard.timelineViewLabel')}
            >
              <GanttChart size={11} />
              <span>{t('whiteboard.timelineView')}</span>
            </button>
          </div>
          <button
            onClick={() => void refresh()}
            disabled={loading}
            className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-bg-hover disabled:opacity-50 transition-colors"
            title={t('whiteboard.refreshLabel')}
            aria-label={t('whiteboard.refreshWarRoom')}
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          </button>
        </div>
      </div>

      {view === 'canvas' && (
        <div className="flex-1 min-h-0">
          {error ? (
            <div className="m-3 p-2 rounded border border-rose-500/30 bg-rose-500/10 text-xs text-rose-500 flex items-start gap-2">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              <span className="break-words">{error}</span>
            </div>
          ) : (
            <WhiteboardFlowView
              entries={active}
              goal={goal}
              archivingId={archivingId}
              onArchive={handleArchive}
              workflowTasks={workflowTasks}
            />
          )}
        </div>
      )}

      {/* List view body */}
      {view === 'list' && (
      <div className="flex-1 min-h-0 overflow-auto">
        {error && (
          <div className="m-3 p-2 rounded border border-rose-500/30 bg-rose-500/10 text-xs text-rose-500 flex items-start gap-2">
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            <span className="break-words">{error}</span>
          </div>
        )}

        {!error && !goal && active.length === 0 && !loading && (
          <div className="h-full flex flex-col items-center justify-center px-6 text-center">
            <div className="text-xs text-text-muted">
              {t('whiteboard.emptyState')}
            </div>
          </div>
        )}

        {goal && (
          <div className="px-3 pt-3">
            <div className="rounded-md border border-accent-brand/30 bg-accent-brand/5 px-3 py-2">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-accent-brand">
                <Target size={11} />
                <span>{t('whiteboard.currentGoal')}</span>
              </div>
              <div className="mt-1 text-sm text-text-primary leading-snug break-words">{goal.summary}</div>
              <div className="mt-1 text-[10px] text-text-muted">
                {goal.by} · {formatRelative(goal.timestamp, t)}
              </div>
            </div>
          </div>
        )}

        {/* GroupList */}
        <div className="px-1 py-2 space-y-3">
          {RENDER_ORDER.map((type) => {
            const list = grouped.get(type)
            if (!list || list.length === 0) return null
            const meta = TYPE_META[type]
            return (
              <div key={type}>
                <div className="flex items-center gap-1.5 px-2 mb-1 text-[10px] uppercase tracking-wide text-text-muted">
                  <meta.icon size={10} className={meta.tone} />
                  <span>{t(meta.labelKey)}</span>
                  <span className="ml-1">{list.length}</span>
                </div>
                <div>
                  {list.map((e) => (
                    <EntryRow key={e.id} entry={e} onArchive={handleArchive} archivingId={archivingId} t={t} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      )}
    </div>
  )
}

export default WhiteboardSidebar
