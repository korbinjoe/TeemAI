import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Clock, MessageSquare } from 'lucide-react'
import AgentAvatar from '@/components/ui/agent-avatar'
import WorkspaceIcon from '@/components/icons/WorkspaceIcon'
import type { WorkspaceInfo } from './types'
import { relativeTime } from '../../utils/format'

interface WorkspaceListPanelProps {
  workspaces: WorkspaceInfo[]
}

const WorkspaceListPanel = ({ workspaces }: WorkspaceListPanelProps) => {
  const navigate = useNavigate()
  const { t } = useTranslation(['home', 'common'])

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-text-emphasis">{t('home:workspaces')}</div>
        {workspaces.length > 0 && (
          <button
            onClick={() => navigate('/workspaces')}
            aria-label={t('home:viewAll')}
            tabIndex={0}
            className="group text-xs text-text-secondary hover:text-accent-brand transition-colors"
          >
            {t('home:viewAll')}
            <span className="inline-block ml-0.5 transition-transform group-hover:translate-x-0.5">&rsaquo;</span>
          </button>
        )}
      </div>

      {workspaces.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <WorkspaceIcon size={20} className="text-text-secondary opacity-40 mb-2" />
          <div className="text-xs text-text-secondary">{t('home:noWorkspaces')}</div>
          <div className="text-xs text-text-secondary mt-0.5">{t('home:autoCreateAfterChat')}</div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {workspaces.slice(0, 5).map((ws) => (
            <button
              key={ws.id}
              onClick={() => navigate(`/workspace/${ws.id}`)}
              aria-label={t('home:openWorkspace', { name: ws.name })}
              tabIndex={0}
              className="flex w-full items-center gap-2.5 rounded-md bg-transparent px-2.5 py-3 text-left cursor-pointer transition-colors hover:bg-bg-hover-subtle"
            >
              <WorkspaceIcon size={14} className="text-text-secondary shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm text-text-emphasis">{ws.name}</span>
                  {ws.id === 'default' && (
                    <span className="text-xs px-1 py-px rounded bg-accent-brand/10 text-accent-brand shrink-0">
                      Default
                    </span>
                  )}
                  <span className="text-xs text-text-secondary shrink-0">
                    {ws.repositories.length} repo{ws.repositories.length !== 1 ? 's' : ''}
                  </span>
                  <span className="text-xs text-text-secondary flex items-center gap-1 shrink-0">
                    <MessageSquare size={10} />
                    {ws.chatCount}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-text-secondary">
                  {ws.agentTeam && (
                    <span className="flex items-center gap-1 shrink-0">
                      <span className="flex -space-x-1">
                        <AgentAvatar name={ws.agentTeam.primaryAgentId} agentId={ws.agentTeam.primaryAgentId} size="xs" />
                        {ws.agentTeam.teamAgentIds?.slice(0, 2).map((name) => (
                          <AgentAvatar key={name} name={name} agentId={name} size="xs" />
                        ))}
                      </span>
                    </span>
                  )}
                  <span className="flex items-center gap-1 shrink-0">
                    <Clock size={10} />
                    {relativeTime(new Date(ws.lastAccessedAt).getTime(), t)}
                  </span>
                </div>
              </div>
              <ChevronRight size={12} className="text-text-secondary opacity-40 shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default WorkspaceListPanel
