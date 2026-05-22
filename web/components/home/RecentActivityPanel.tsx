import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FolderOpen, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import AgentAvatar from '@/components/ui/agent-avatar'
import { useChatTabs } from '@/contexts/ChatTabContext'
import { formatTokens } from '@/utils/format'
import type { AgentSummary } from '@/types/agentConfig'
import type { RecentChat, WorkspaceInfo } from './types'
import { relativeTime } from '../../utils/format'

interface RecentActivityPanelProps {
  recentChats: RecentChat[]
  workspaces: WorkspaceInfo[]
  agents?: AgentSummary[]
}

const RecentActivityPanel = ({ recentChats, workspaces, agents = [] }: RecentActivityPanelProps) => {
  const navigate = useNavigate()
  const { openTab } = useChatTabs()
  const { t } = useTranslation(['home', 'common'])

  const completedChats = recentChats.filter(
    (c) => c.status !== 'running' && c.status !== 'idle',
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-text-emphasis">
          {t('home:recentCompleted')}
        </div>
        {completedChats.length > 0 && (
          <button
            onClick={() => navigate('/chats')}
            aria-label={t('home:viewAll')}
            tabIndex={0}
            className="group text-xs text-text-secondary hover:text-accent-brand transition-colors"
          >
            {t('home:viewAll')}
            <span className="inline-block ml-0.5 transition-transform group-hover:translate-x-0.5">&rsaquo;</span>
          </button>
        )}
      </div>

      {completedChats.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Clock size={20} className="text-text-secondary opacity-40 mb-2" />
          <div className="text-xs text-text-secondary">{t('home:noActivityRecords')}</div>
          <div className="text-xs text-text-secondary mt-0.5">{t('home:chatAfterStart')}</div>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-1 top-2 bottom-2 w-px bg-border-subtle" />
          <div className="space-y-1">
            {completedChats.slice(0, 6).map((chat) => {
              const wsName = workspaces.find((ws) => ws.id === chat.workspaceId)?.name ?? chat.workspaceId
              return (
                <button
                  key={chat.id}
                  onClick={() => { openTab(chat.id, chat.workspaceId, chat.title); navigate(`/workspace/${chat.workspaceId}/chat/${chat.id}`) }}
                  aria-label={t('home:openChat', { title: chat.title })}
                  tabIndex={0}
                  className="relative flex w-full items-start gap-3 rounded-md bg-transparent pl-0 pr-2.5 py-2.5 text-left cursor-pointer transition-colors hover:bg-bg-hover-subtle"
                >
                  <span className={cn(
                    'relative z-10 mt-1.5 ml-px h-2 w-2 rounded-full shrink-0',
                    chat.taskStatus === 'success' ? 'bg-accent-green'
                      : chat.taskStatus === 'error' ? 'bg-accent-red'
                      : chat.taskStatus === 'timeout' ? 'bg-accent-yellow'
                      : chat.taskStatus === 'interrupted' ? 'bg-text-muted opacity-40'
                      : chat.status === 'error' ? 'bg-accent-red'
                      : 'bg-text-muted opacity-40',
                  )} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-text-emphasis">{chat.title}</span>
                      <span className="shrink-0 text-xs text-text-secondary">
                        {relativeTime(new Date(chat.lastMessageAt).getTime(), t)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-text-secondary min-w-0">
                      <AgentAvatar name={chat.primaryAgentId} agentId={chat.primaryAgentId} size="xs" />
                      <span className="truncate max-w-[100px]">{agents.find((a) => a.id === chat.primaryAgentId)?.name ?? chat.primaryAgentId}</span>
                      <span className="text-text-muted/60">·</span>
                      <FolderOpen size={10} className="shrink-0 text-text-secondary" />
                      <span className="truncate max-w-[120px]">{wsName}</span>
                    </div>
                    {chat.totalTokens && (chat.totalTokens.input > 0 || chat.totalTokens.output > 0) && (
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-text-muted font-mono">
                        <span>{formatTokens(chat.totalTokens.input)} in</span>
                        <span>{formatTokens(chat.totalTokens.output)} out</span>
                        {(chat.totalTokens.cacheRead ?? 0) > 0 && (
                          <span className="opacity-60">{formatTokens(chat.totalTokens.cacheRead!)} cache↓</span>
                        )}
                        {(chat.totalTokens.cacheCreation ?? 0) > 0 && (
                          <span className="opacity-60">{formatTokens(chat.totalTokens.cacheCreation!)} cache↑</span>
                        )}
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default RecentActivityPanel
