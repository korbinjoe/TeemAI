import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { memberStatusDot } from '@/components/workspace/MissionSessionRows'
import { useMobileMissions } from '../hooks/useMobileMissions'
import type { Chat, ChatMember } from '@/components/workspace/types'

const AGENT_COLORS: Record<string, string> = {
  lead: '#6B8DB5',
  'fullstack-engineer': '#C87941',
  'code-reviewer': '#5BA0A8',
  'ui-designer': '#C76B8A',
  'devops-engineer': '#7BA056',
  architect: '#5878B0',
  sensei: '#9B6BC0',
  'image-creator': '#D4A03C',
}

const FALLBACK_COLORS = ['#8B6BAE', '#5C9E72', '#B87850', '#6898B8', '#C0728A', '#8FA84E']

const getAgentColor = (agentId: string): string => {
  if (AGENT_COLORS[agentId]) return AGENT_COLORS[agentId]
  let h = 0
  for (let i = 0; i < agentId.length; i++) h = ((h << 5) - h + agentId.charCodeAt(i)) | 0
  return FALLBACK_COLORS[Math.abs(h) % FALLBACK_COLORS.length]
}

const phaseLabel = (status: ChatMember['status']): string => {
  switch (status) {
    case 'running': return 'running'
    case 'waiting': return 'waiting'
    case 'waiting_input': return 'waiting'
    case 'error': return 'error'
    case 'done': return 'done'
    default: return 'idle'
  }
}

const phaseColor = (status: ChatMember['status']): string => {
  switch (status) {
    case 'running': return 'text-accent-running'
    case 'waiting':
    case 'waiting_input': return 'text-accent-yellow'
    case 'error': return 'text-accent-red'
    case 'done': return 'text-text-muted'
    default: return 'text-text-muted'
  }
}

type DashTab = 'all' | 'running' | 'done'

const hasPermissionWaiting = (chat: Chat): boolean =>
  (chat.members ?? []).some((m) => m.status === 'waiting')

const MobileDashboard = () => {
  const { missions, loading, workspaceNames, agentNames } = useMobileMissions()
  const navigate = useNavigate()
  const [tab, setTab] = useState<DashTab>('all')

  const running = missions.filter((m) => m.status === 'running' || m.status === 'idle')
  const done = missions.filter((m) => m.status === 'stopped')

  const showRunning = tab === 'all' || tab === 'running'
  const showDone = tab === 'all' || tab === 'done'

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex gap-0 px-5 shrink-0 bg-bg-primary">
        {(['all', 'running', 'done'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              'py-1.5 mr-5 text-[13px] border-b-2 transition-colors capitalize',
              tab === t
                ? 'text-accent-brand-light border-accent-brand'
                : 'text-text-muted border-transparent',
            )}
          >
            {t === 'all' ? 'All' : t === 'running' ? 'Running' : 'Done'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 pb-4">
        {loading && missions.length === 0 && (
          <p className="text-sm text-text-secondary mt-6">Loading missions...</p>
        )}

        {!loading && missions.length === 0 && (
          <p className="text-sm text-text-secondary mt-6">No missions yet.</p>
        )}

        {showRunning && running.length > 0 && (
          <div>
            <GroupLabel label="Running" count={running.length} />
            {running.map((m) => (
              <MissionCard
                key={m.id}
                chat={m}
                workspaceName={workspaceNames[m.workspaceId]}
                agentNames={agentNames}
                onClick={() => navigate(`/mobile/mission/${m.id}`)}
              />
            ))}
          </div>
        )}

        {showDone && done.length > 0 && (
          <div>
            <GroupLabel label="Done" count={done.length} />
            {done.map((m) => (
              <MissionCard
                key={m.id}
                chat={m}
                workspaceName={workspaceNames[m.workspaceId]}
                agentNames={agentNames}
                isDone
                onClick={() => navigate(`/mobile/mission/${m.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const GroupLabel = ({ label, count }: { label: string; count: number }) => (
  <div className="flex items-center gap-1.5 pt-4 pb-2">
    <span className="text-[11px] uppercase tracking-[1.2px] text-text-muted font-medium">{label}</span>
    <span className="text-[10px] text-text-secondary bg-bg-hover px-1.5 py-px rounded-lg">{count}</span>
  </div>
)

const MissionCard = ({ chat, workspaceName, agentNames, isDone, onClick }: {
  chat: Chat
  workspaceName?: string
  agentNames: Record<string, string>
  isDone?: boolean
  onClick: () => void
}) => {
  const members = chat.members ?? []
  const needsApproval = hasPermissionWaiting(chat)
  const progressPct = isDone ? 100 : Math.min(90, Math.max(10, (chat.totalToolCalls ?? 0) * 5 + 10))

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative w-full text-left rounded-[10px] border bg-bg-secondary px-3.5 py-2.5 mb-2 transition-all active:scale-[0.98] active:bg-bg-tertiary',
        needsApproval
          ? 'border-accent-yellow shadow-[0_0_0_1px_rgba(251,191,36,0.15)]'
          : 'border-border-subtle',
        isDone && 'opacity-75',
      )}
    >
      {needsApproval && (
        <div className="absolute -top-px right-3 bg-accent-yellow text-bg-primary text-[9px] font-bold uppercase tracking-[0.5px] px-2 py-0.5 rounded-b">
          Needs Approval
        </div>
      )}

      {/* Title + Workspace */}
      <div className="flex items-center justify-between mb-1.5">
        <span className={cn('text-[13px] truncate flex-1 mr-2', isDone ? 'font-medium' : 'font-semibold')}>
          {chat.title || 'Untitled Mission'}
        </span>
        {workspaceName && (
          <span className="text-[10px] text-text-muted bg-bg-hover px-1.5 py-0.5 rounded shrink-0">
            {workspaceName}
          </span>
        )}
      </div>

      {/* Agents — single row */}
      {members.length > 0 && (
        <div className="flex items-center gap-2.5 mb-1.5">
          {members.map((m) => (
            <AgentBadge key={m.agentId} member={m} name={agentNames[m.agentId]} />
          ))}
        </div>
      )}

      {/* Progress + Cost */}
      <div className="flex items-center">
        <div className="flex-1 h-[2px] bg-bg-hover rounded-sm mr-3 overflow-hidden">
          <div
            className={cn('h-full rounded-sm transition-[width] duration-500', isDone ? 'bg-accent-green/50' : 'bg-accent-running')}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        {chat.totalCost != null && (
          <span className="text-[11px] text-text-muted font-mono shrink-0">
            ${chat.totalCost.toFixed(2)}
          </span>
        )}
      </div>
    </button>
  )
}

const AgentBadge = ({ member, name }: { member: ChatMember; name?: string }) => {
  const displayName = name || member.agentId
  const color = getAgentColor(member.agentId)
  const initial = displayName.charAt(0).toUpperCase()
  const label = phaseLabel(member.status)

  return (
    <div className="flex items-center gap-1 text-text-secondary">
      <div
        className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-medium shrink-0"
        style={{ background: `${color}26`, color }}
      >
        {initial}
      </div>
      <span className="text-[11px]">{displayName}</span>
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', memberStatusDot(member.status))} />
      <span className={cn('text-[11px]', phaseColor(member.status))}>{label}</span>
    </div>
  )
}

export default MobileDashboard
