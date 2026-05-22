import { useEffect } from 'react'
import type { AgentStatusInfo, ChatActivityInfo, NotchNotification } from '../hooks/useAgentStatus'
import { AgentStatusRow } from './AgentStatusRow'
import { QuickInput } from './QuickInput'

interface NotchExpandedProps {
  chatActivity: ChatActivityInfo | null
  agents: AgentStatusInfo[]
  notifications: NotchNotification[]
  onCompact: () => void
}

export const NotchExpanded = ({
  chatActivity,
  agents,
  onCompact,
}: NotchExpandedProps) => {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCompact()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onCompact])

  const totalTools = chatActivity?.toolCount ?? 0
  const completedTools = chatActivity?.toolCompleted ?? 0
  const overallProgress = totalTools > 0
    ? Math.round((completedTools / totalTools) * 100)
    : 0

  const handleOpenWorkbench = () => {
    window.notchBridge?.openWorkbench()
    onCompact()
  }

  return (
    <div className="flex flex-col w-full max-h-[360px]">
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-white/70 text-[10px] uppercase tracking-wider">
            {agents.length} agent{agents.length !== 1 ? 's' : ''} active
          </span>
          {chatActivity?.cost != null && (
            <span className="text-white/30 text-[10px]">
              ${chatActivity.cost.toFixed(3)}
            </span>
          )}
        </div>
        {totalTools > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-400/60 rounded-full transition-all duration-500"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
            <span className="text-white/40 text-[10px] shrink-0">
              {completedTools}/{totalTools}
            </span>
          </div>
        )}
      </div>

      {/* Agent List */}
      <div className="flex-1 overflow-y-auto px-1 py-1 min-h-0">
        {agents.length > 0 ? (
          agents.map((agent) => (
            <AgentStatusRow key={agent.agentId} agent={agent} />
          ))
        ) : (
          <div className="text-white/20 text-xs text-center py-4">
            No active agents
          </div>
        )}
      </div>

      <QuickInput visible />
      <div className="px-3 pb-2">
        <button
          onClick={handleOpenWorkbench}
          className="w-full text-center text-white/40 hover:text-white/70 text-[10px] py-1 transition-colors"
        >
          Open Workbench
        </button>
      </div>
    </div>
  )
}
