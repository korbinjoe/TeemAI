import type { TFunction } from 'i18next'
import { Play, Trash2, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import AgentAvatar from '@/components/ui/agent-avatar'
import WorktreeSessionBadges from '@/components/worktree/WorktreeSessionBadges'
import type { Chat, Repository } from './types'

interface ChatListProps {
  chats: Chat[]
  repositories: Repository[]
  onOpenChat: (chatId: string) => void
  onDeleteChat: (chatId: string) => void
  t: TFunction
}

const ChatList = ({ chats, repositories, onOpenChat, onDeleteChat, t }: ChatListProps) => (
  <div className="mb-3">
    <div className="text-xs font-semibold text-text-emphasis mb-2.5 flex items-center gap-1.5">
      {t('workspace:chatsSection')}
      <span className="text-text-secondary font-normal">({chats.length})</span>
    </div>

    {chats.length === 0 ? (
      <div className="p-8 text-center text-text-secondary border border-dashed border-border rounded-md text-[13px]">
        {t('workspace:noChats')}
      </div>
    ) : (
      <div className="flex flex-col gap-1.5">
        {chats.map((chat) => (
          <ChatCard
            key={chat.id}
            chat={chat}
            repositories={repositories}
            onOpen={() => onOpenChat(chat.id)}
            onDelete={() => onDeleteChat(chat.id)}
            t={t}
          />
        ))}
      </div>
    )}
  </div>
)

/* -- ChatCard ------------------------------------------- */

const statusStyles: Record<string, string> = {
  running: 'bg-accent-green/15 text-accent-green',
  idle: 'bg-accent-yellow/15 text-accent-yellow',
  merged: 'bg-accent-brand/15 text-accent-brand',
  stopped: 'bg-[rgba(90,90,90,0.15)] text-text-secondary',
}

const ChatCard = ({ chat, repositories, onOpen, onDelete, t }: {
  chat: Chat
  repositories?: Repository[]
  onOpen: () => void
  onDelete: () => void
  t: TFunction
}) => (
  <div
    onClick={onOpen}
    role="button"
    tabIndex={0}
    aria-label={t('workspace:chatCard.openChat', { title: chat.title })}
    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpen() }}
    className="group px-3.5 py-2.5 rounded-md cursor-pointer border border-border bg-transparent hover:bg-bg-hover-subtle transition-[background] duration-150 flex items-center gap-2.5 relative"
  >
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5">
        <span className="text-[13px] font-medium text-text-emphasis">
          {chat.title}
        </span>
        <span className={cn(
          'text-xs px-[5px] py-px rounded-[3px] font-medium',
          statusStyles[chat.status],
        )}>
          {t(`common:status.${chat.status}`, { defaultValue: chat.status })}
        </span>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-xs text-text-secondary flex items-center gap-[3px]">
          <AgentAvatar name={chat.primaryAgentId} agentId={chat.primaryAgentId} size="xs" /> {chat.primaryAgentId}
        </span>
        {(chat.usedModels || chat.model) && (
          <span className="text-xs text-text-secondary">
            {chat.usedModels ? chat.usedModels.join(', ') : chat.model}
          </span>
        )}
        <span className="text-xs text-text-secondary flex items-center gap-[3px]">
          <Clock size={10} /> {relativeTime(new Date(chat.lastMessageAt).getTime(), t)}
        </span>
        {chat.totalCost != null && chat.totalCost > 0 && (
          <span className="text-xs text-accent-green">
            ${chat.totalCost.toFixed(4)}
          </span>
        )}
        {chat.totalTokens && (
          <span className="text-xs text-text-secondary font-mono">
            {formatTokens(chat.totalTokens.input)} in / {formatTokens(chat.totalTokens.output)} out
            {(chat.totalTokens.cacheRead != null && chat.totalTokens.cacheRead > 0) && (
              <span className="opacity-60"> / {formatTokens(chat.totalTokens.cacheRead)} cache↓</span>
            )}
            {(chat.totalTokens.cacheCreation != null && chat.totalTokens.cacheCreation > 0) && (
              <span className="opacity-60"> / {formatTokens(chat.totalTokens.cacheCreation)} cache↑</span>
            )}
          </span>
        )}
        {chat.totalToolCalls != null && chat.totalToolCalls > 0 && (
          <span className="text-xs text-text-secondary">
            {chat.totalToolCalls} tools
          </span>
        )}
      </div>
      {chat.worktreeSessions && chat.worktreeSessions.length > 0 && (
        <WorktreeSessionBadges
          sessions={chat.worktreeSessions}
          repositories={repositories}
          className="mt-1"
        />
      )}
    </div>

    <div
      className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={onOpen}
        title={t('workspace:chatCard.open')}
        aria-label={t('workspace:chatCard.openChat', { title: chat.title })}
        tabIndex={0}
        className="bg-transparent border-none cursor-pointer text-accent-green p-[5px] rounded-sm flex items-center transition-colors hover:bg-bg-hover-muted"
      >
        <Play size={11} />
      </button>
      <button
        onClick={onDelete}
        title={t('workspace:chatCard.delete')}
        aria-label={t('workspace:chatCard.deleteChat')}
        tabIndex={0}
        className="bg-transparent border-none cursor-pointer text-text-secondary p-[5px] rounded-sm flex items-center transition-all hover:bg-bg-hover-muted hover:text-accent-red"
      >
        <Trash2 size={11} />
      </button>
    </div>
  </div>
)

/* -- Helpers -------------------------------------------- */

const formatTokens = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return `${n}`
}

const relativeTime = (ts: number, t: TFunction): string => {
  const diff = Date.now() - ts
  if (diff < 60_000) return t('common:time.justNow')
  if (diff < 3_600_000) return t('common:time.minutesAgo', { count: Math.floor(diff / 60_000) })
  if (diff < 86_400_000) return t('common:time.hoursAgo', { count: Math.floor(diff / 3_600_000) })
  return t('common:time.daysAgo', { count: Math.floor(diff / 86_400_000) })
}

export default ChatList
