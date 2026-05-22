/**
 * AgentActivityPanel —  Agent
 *  Agent
 */

import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import AgentAvatar, { isActivePhase } from '@/components/ui/agent-avatar'
import type { AgentActivity } from '@/types/chat'
import type { AgentPersonality } from '@/types/agentConfig'
import { PHASE_STYLES } from '@/lib/agentPhaseConfig'

interface AgentActivityPanelProps {
  expertActivities: Record<string, AgentActivity>
  agentNames?: Record<string, string>
  agentPersonalities?: Record<string, AgentPersonality>
  onAgentClick?: (agentId: string) => void
  className?: string
}

const AgentActivityPanel = ({
  expertActivities,
  agentNames,
  agentPersonalities,
  onAgentClick,
  className,
}: AgentActivityPanelProps) => {
  const expertEntries = Object.entries(expertActivities)
  const hasActiveWork = expertEntries.some(([, a]) => isActivePhase(a.phase))

  if (!hasActiveWork) return null

  return (
    <div className={cn('shrink-0 border-t border-border-subtle/60 px-3 py-1.5', className)}>
      <div className="flex flex-col gap-0.5">
        {expertEntries.map(([agentId, activity]) => {
          if (!isActivePhase(activity.phase)) return null
          const personality = agentPersonalities?.[agentId]
          const displayName = personality?.nickname || agentNames?.[agentId] || agentId
          return (
            <AgentRow key={agentId} agentId={agentId} displayName={displayName} activity={activity} onClick={onAgentClick} />
          )
        })}
      </div>
    </div>
  )
}

const FILE_OP_VERB: Record<string, string> = {
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  read: 'Read',
}

const AgentRow = ({ agentId, displayName, activity, onClick }: {
  agentId: string
  displayName: string
  activity: AgentActivity
  onClick?: (agentId: string) => void
}) => {
  const { t } = useTranslation('chat')

  const config = PHASE_STYLES[activity.phase] || PHASE_STYLES.initializing
  const phaseLabel = t(`activity.phase.${activity.phase}`, { defaultValue: activity.phase })
  const toolLabel = activity.currentTool
    ? t(`activity.toolAction.${activity.currentTool}`, { defaultValue: activity.currentTool })
    : null

  const fileOpDesc = activity.fileOp
    ? `${FILE_OP_VERB[activity.fileOp.operation] ?? activity.fileOp.operation} ${activity.fileOp.path.split('/').slice(-2).join('/')}`
    : null

  const statusDesc = fileOpDesc || toolLabel || phaseLabel

  return (
    <button
      type="button"
      onClick={() => onClick?.(agentId)}
      className={cn(
        'flex items-center gap-1.5 px-1.5 py-0.5 rounded-md transition-colors w-full border-none text-left bg-transparent',
        onClick ? 'cursor-pointer hover:bg-bg-hover-muted' : 'cursor-default',
      )}
      tabIndex={onClick ? 0 : -1}
      aria-label={`${displayName} - ${phaseLabel}`}
    >
      <AgentAvatar name={displayName} agentId={agentId} size="xs" active={isActivePhase(activity.phase)} />
      <span className="text-xs truncate max-w-[80px] text-text-secondary">
        {displayName}
      </span>
      <span className="flex items-center gap-1 text-xs truncate" style={{ color: config.color }}>
        <span
          className="inline-block w-[5px] h-[5px] rounded-full shrink-0"
          style={{
            background: config.color,
            ...(config.pulse ? { animation: 'pulse 1.5s ease-in-out infinite' } : {}),
          }}
        />
        <span className="truncate">{statusDesc}</span>
      </span>
      {activity.toolCount > 0 && (
        <span className="text-xs text-text-muted shrink-0 font-mono">
          {activity.toolCompleted}/{activity.toolCount}
        </span>
      )}
    </button>
  )
}

export default AgentActivityPanel
