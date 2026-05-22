
import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, CheckCircle2, AlertCircle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import AgentAvatar from '@/components/ui/agent-avatar'
import { useChatTabs } from '@/contexts/ChatTabContext'
import type { RecentChat } from './types'
import { relativeTime } from '../../utils/format'
import { useTranslation } from 'react-i18next'

interface RecapCardProps {
  chats: RecentChat[]
  lastVisitTime: number | null
  onDismiss: () => void
}

const formatAwayDuration = (ms: number, t: (key: string, opts?: Record<string, unknown>) => string): string => {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 60) return t('home:awayTime.minutes', { count: minutes })
  const hours = Math.floor(minutes / 60)
  const remainMinutes = minutes % 60
  if (hours < 24) {
    return remainMinutes > 0 ? t('home:awayTime.hoursMinutes', { hours, minutes: remainMinutes }) : t('home:awayTime.hours', { count: hours })
  }
  const days = Math.floor(hours / 24)
  const remainHours = hours % 24
  return remainHours > 0 ? t('home:awayTime.daysHours', { days, hours: remainHours }) : t('home:awayTime.days', { count: days })
}

const RecapCard = ({ chats, lastVisitTime, onDismiss }: RecapCardProps) => {
  const navigate = useNavigate()
  const { openTab } = useChatTabs()
  const { t } = useTranslation(['home'])
  const [expanded, setExpanded] = useState(false)

  const recap = useMemo(() => {
    if (!lastVisitTime) return null

    const awayMs = Date.now() - lastVisitTime
    if (awayMs < 5 * 60_000) return null

    const completed = chats.filter((c) =>
      c.taskStatus === 'success'
      && new Date(c.lastMessageAt).getTime() > lastVisitTime,
    )
    const errored = chats.filter((c) =>
      c.taskStatus === 'error'
      && new Date(c.lastMessageAt).getTime() > lastVisitTime,
    )
    const needsAction = chats.filter((c) =>
      (c.taskStatus === 'waiting_input' || c.taskStatus === 'waiting_confirm' || c.taskStatus === 'timeout')
      && new Date(c.lastMessageAt).getTime() > lastVisitTime,
    )
    const running = chats.filter((c) =>
      c.taskStatus === 'running' || (!c.taskStatus && c.status === 'running'),
    )

    const totalChanges = completed.length + errored.length + needsAction.length
    if (totalChanges === 0 && running.length === 0) return null

    return {
      awayMs,
      awayText: formatAwayDuration(awayMs, t),
      completed,
      errored,
      needsAction,
      running,
      totalChanges,
    }
  }, [chats, lastVisitTime, t])

  if (!recap) return null

  return (
    <div className="rounded-lg border border-accent-brand/20 bg-accent-brand/5 p-4">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-text-emphasis">
            {t('home:recap.awayDuration', { duration: recap.awayText })}
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-xs flex-wrap">
            {recap.completed.length > 0 && (
              <span className="flex items-center gap-1 text-accent-green">
                <CheckCircle2 size={12} />
                {t('home:recap.completed', { count: recap.completed.length })}
              </span>
            )}
            {recap.errored.length > 0 && (
              <span className="flex items-center gap-1 text-accent-red">
                <AlertCircle size={12} />
                {t('home:recap.errored', { count: recap.errored.length })}
              </span>
            )}
            {recap.needsAction.length > 0 && (
              <span className="flex items-center gap-1 text-accent-yellow">
                <Clock size={12} />
                {t('home:recap.needsAction', { count: recap.needsAction.length })}
              </span>
            )}
            {recap.running.length > 0 && (
              <span className="flex items-center gap-1 text-text-secondary">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
                {t('home:recap.running', { count: recap.running.length })}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {recap.totalChanges > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-accent-brand hover:underline transition-colors"
            >
              {expanded ? t('home:recap.collapse') : t('home:recap.viewDetails')}
            </button>
          )}
          <button
            onClick={onDismiss}
            aria-label={t('home:recap.dismissLabel')}
            className="p-0.5 rounded hover:bg-bg-hover-subtle transition-colors text-text-muted hover:text-text-secondary"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ExpandDetails */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-accent-brand/10 space-y-1.5">
          {recap.errored.map((chat) => (
            <RecapItem key={chat.id} chat={chat} variant="error" onClick={() => { openTab(chat.id, chat.workspaceId, chat.title); navigate(`/workspace/${chat.workspaceId}/chat/${chat.id}`) }} t={t} />
          ))}
          {recap.needsAction.map((chat) => (
            <RecapItem key={chat.id} chat={chat} variant="action" onClick={() => { openTab(chat.id, chat.workspaceId, chat.title); navigate(`/workspace/${chat.workspaceId}/chat/${chat.id}`) }} t={t} />
          ))}
          {recap.completed.map((chat) => (
            <RecapItem key={chat.id} chat={chat} variant="success" onClick={() => { openTab(chat.id, chat.workspaceId, chat.title); navigate(`/workspace/${chat.workspaceId}/chat/${chat.id}`) }} t={t} />
          ))}
        </div>
      )}
    </div>
  )
}

const VARIANT_STYLES = {
  error: { dot: 'bg-accent-red', labelKey: 'home:recap.variantError', labelColor: 'text-accent-red' },
  action: { dot: 'bg-accent-yellow', labelKey: 'home:recap.variantAction', labelColor: 'text-accent-yellow' },
  success: { dot: 'bg-accent-green', labelKey: 'home:recap.variantSuccess', labelColor: 'text-accent-green' },
}

const RecapItem = ({ chat, variant, onClick, t }: {
  chat: RecentChat
  variant: 'error' | 'action' | 'success'
  onClick: () => void
  t: ReturnType<typeof useTranslation>['t']
}) => {
  const style = VARIANT_STYLES[variant]
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-left hover:bg-bg-hover-subtle transition-colors"
    >
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', style.dot)} />
      <AgentAvatar name={chat.primaryAgentId} agentId={chat.primaryAgentId} size="xs" />
      <span className="text-xs text-text-emphasis truncate flex-1">{chat.title}</span>
      <span className={cn('text-xs shrink-0', style.labelColor)}>{t(style.labelKey)}</span>
      <span className="text-xs text-text-muted shrink-0">
        {relativeTime(new Date(chat.lastMessageAt).getTime(), t)}
      </span>
    </button>
  )
}

export default RecapCard
