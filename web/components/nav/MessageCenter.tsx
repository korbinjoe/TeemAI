import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, XCircle, Info, Bell, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useNotification } from '../../contexts/NotificationContext'
import type { Notification, NotificationCategory } from '../../types/cron'

interface MessageCenterProps {
  onClose: () => void
}

const CATEGORY_CONFIG: Record<NotificationCategory, {
  icon: typeof CheckCircle2
  colorClass: string
}> = {
  cron_success: { icon: CheckCircle2, colorClass: 'text-emerald-500' },
  cron_failed: { icon: XCircle, colorClass: 'text-red-500' },
  system: { icon: Info, colorClass: 'text-blue-500' },
}

const MessageCenter = ({ onClose }: MessageCenterProps) => {
  const { t } = useTranslation('notifications')
  const navigate = useNavigate()
  const { notifications, unreadCount, markRead, markAllRead } = useNotification()
  const [tab, setTab] = useState<'all' | 'unread'>('all')

  const filtered = tab === 'unread'
    ? notifications.filter((n) => !n.read)
    : notifications

  const handleClickNotification = async (n: Notification) => {
    if (!n.read) await markRead(n.id)
    if (n.link) {
      navigate(n.link)
      onClose()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent, n: Notification) => {
    if (e.key === 'Enter' || e.key === ' ') handleClickNotification(n)
  }

  const formatTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return t('justNow', { defaultValue: 'Just now' })
    if (minutes < 60) return `${minutes}m`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h`
    return `${Math.floor(hours / 24)}d`
  }

  return (
    <div className="flex flex-col w-[300px] max-h-[420px] bg-bg-primary border border-border rounded-lg shadow-xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border-subtle shrink-0">
        <h2 className="text-xs font-semibold text-text-primary">{t('title', { defaultValue: 'Notifications' })}</h2>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            tabIndex={0}
            aria-label={t('markAllRead', { defaultValue: 'Mark all read' })}
            className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            <Check size={12} />
            {t('markAllRead', { defaultValue: 'Mark all read' })}
          </button>
        )}
      </div>

      {/* Tab Switch */}
      <div className="flex gap-1 px-3 py-1.5 border-b border-border-subtle shrink-0">
        <TabButton
          active={tab === 'all'}
          onClick={() => setTab('all')}
          label={t('tabs.all', { defaultValue: 'All' })}
        />
        <TabButton
          active={tab === 'unread'}
          onClick={() => setTab('unread')}
          label={`${t('tabs.unread', { defaultValue: 'Unread' })}${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
        />
      </div>

      {/* NotificationList */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-text-secondary">
            <Bell size={24} className="mb-2 opacity-30" />
            <span className="text-xs">{t('allCaughtUp', { defaultValue: 'All caught up' })}</span>
          </div>
        ) : (
          filtered.map((n) => (
            <NotificationItem
              key={n.id}
              notification={n}
              onClick={() => handleClickNotification(n)}
              onKeyDown={(e) => handleKeyDown(e, n)}
              formatTime={formatTime}
            />
          ))
        )}
      </div>
    </div>
  )
}

const TabButton = ({ active, onClick, label }: {
  active: boolean
  onClick: () => void
  label: string
}) => (
  <button
    onClick={onClick}
    tabIndex={0}
    aria-label={label}
    className={cn(
      'text-xs px-2.5 py-0.5 rounded-full transition-colors',
      active
        ? 'bg-bg-hover text-text-primary font-medium'
        : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover-muted',
    )}
  >
    {label}
  </button>
)

const NotificationItem = ({ notification, onClick, onKeyDown, formatTime }: {
  notification: Notification
  onClick: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
  formatTime: (iso: string) => string
}) => {
  const config = CATEGORY_CONFIG[notification.category] || CATEGORY_CONFIG.system
  const Icon = config.icon

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={cn(
        'px-3 py-2.5 border-b border-border-subtle cursor-pointer transition-colors hover:bg-bg-hover-muted',
        !notification.read && 'border-l-2 border-l-accent-brand bg-bg-secondary/50',
      )}
    >
      <div className="flex items-start gap-2.5">
        <Icon size={14} className={cn('mt-0.5 shrink-0', config.colorClass)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className={cn(
              'text-xs font-medium truncate',
              notification.read ? 'text-text-secondary' : 'text-text-primary',
            )}>
              {notification.title}
            </span>
            <span className="text-xs text-text-secondary shrink-0">
              {formatTime(notification.createdAt)}
            </span>
          </div>
          <p className="text-xs mt-0.5 line-clamp-2 text-text-secondary">
            {notification.body}
          </p>
        </div>
      </div>
    </div>
  )
}

export default MessageCenter
