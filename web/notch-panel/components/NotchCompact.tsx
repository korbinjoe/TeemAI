import type { AgentStatusInfo } from '../hooks/useAgentStatus'

const PHASE_COLORS: Record<string, string> = {
  working: 'bg-green-400',
  running: 'bg-green-400',
  thinking: 'bg-green-400',
  waiting: 'bg-yellow-400',
  'waiting-input': 'bg-yellow-400',
  error: 'bg-red-400',
  completed: 'bg-gray-400',
  idle: 'bg-gray-400',
}

const getPhaseColor = (phase: string) =>
  PHASE_COLORS[phase] ?? 'bg-gray-400'

interface NotchCompactProps {
  agents: AgentStatusInfo[]
  onExpand: () => void
}

export const NotchCompact = ({ agents, onExpand }: NotchCompactProps) => {
  const dots = agents.length > 0 ? agents.slice(0, 5) : []

  return (
    <div
      className="flex items-center justify-center gap-1 h-full w-full cursor-pointer"
      onClick={onExpand}
    >
      {dots.length === 0 ? (
        <div className="w-1.5 h-1.5 rounded-full bg-gray-500 opacity-50" />
      ) : (
        dots.map((agent) => (
          <div
            key={agent.agentId}
            className={`w-1.5 h-1.5 rounded-full ${getPhaseColor(agent.phase)} ${
              agent.phase === 'working' || agent.phase === 'running' || agent.phase === 'thinking'
                ? 'animate-pulse'
                : ''
            }`}
          />
        ))
      )}
    </div>
  )
}
