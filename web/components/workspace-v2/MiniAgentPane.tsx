import { useWorkspace } from '../../contexts/WorkspaceContext'
import { cn } from '../../lib/utils'

type AgentStatus = 'running' | 'waiting' | 'error' | 'done'

interface MiniAgentPaneProps {
  agentId: string
  agentName: string
  status: AgentStatus
  role?: 'lead' | 'worker'
  shortcutKey?: string
  messages?: { type: string; text: string; meta?: string }[]
}

const statusDotColor = (s: AgentStatus): string => {
  if (s === 'error') return 'bg-accent-red'
  if (s === 'waiting') return 'bg-accent-yellow'
  if (s === 'running') return 'bg-accent-brand'
  return 'bg-text-muted'
}

const statusBorderColor = (s: AgentStatus): string => {
  if (s === 'error') return 'border-accent-red/[0.15]'
  if (s === 'waiting') return 'border-accent-yellow/[0.15]'
  return 'border-border-subtle'
}

const MiniAgentPane = ({ agentId, agentName, status, role, shortcutKey, messages = [] }: MiniAgentPaneProps) => {
  const { selectedAgentId, selectAgent, setLayoutMode } = useWorkspace()
  const isSelected = selectedAgentId === agentId

  return (
    <div className="bg-bg-primary flex flex-col overflow-hidden relative">
      {isSelected && <div className="absolute top-0 left-0 right-0 h-0.5 bg-accent-brand" />}
      {/* Header */}
      <div
        className={cn(
          'h-7 flex items-center px-2 gap-[5px] border-b bg-bg-tertiary cursor-pointer flex-shrink-0',
          statusBorderColor(status),
        )}
        onClick={() => selectAgent(agentId)}
        onDoubleClick={() => { selectAgent(agentId); setLayoutMode('split') }}
      >
        <span className={cn('w-1.5 h-1.5 rounded-full', statusDotColor(status), status === 'running' && 'animate-pulse')} />
        <span className={cn(
          'text-[10px] flex-1',
          isSelected ? 'font-semibold text-accent-brand-light' : 'font-medium text-text-primary',
          status === 'error' && 'text-accent-red',
          status === 'waiting' && 'text-accent-yellow',
        )}>
          {agentName}
        </span>
        {role === 'lead' && (
          <span className="text-[7px] px-[3px] rounded-sm bg-accent-purple/10 text-accent-purple font-bold">LEAD</span>
        )}
        {shortcutKey && (
          <span className="font-mono text-[8px] text-text-muted">⌘{shortcutKey}</span>
        )}
      </div>

      {/* Compact log */}
      <div className="flex-1 px-2 py-1.5 font-mono text-[9px] leading-relaxed text-text-secondary overflow-hidden">
        {messages.slice(-4).map((msg, i) => (
          <MiniMessage key={i} msg={msg} />
        ))}
      </div>
    </div>
  )
}

const MiniMessage = ({ msg }: { msg: { type: string; text: string; meta?: string } }) => {
  if (msg.type === 'done') return <div><span className="text-accent-green">✓</span> {msg.text}</div>
  if (msg.type === 'tool') return <div><span className="text-accent-yellow">⚡</span> {msg.text}</div>
  if (msg.type === 'error') return (
    <div className="mt-1 p-[5px] rounded bg-accent-red/[0.06] border border-accent-red/10 text-accent-red text-[9px]">
      ✗ {msg.text}
    </div>
  )
  if (msg.type === 'waiting') return (
    <div className="mt-1 p-[5px] rounded bg-accent-yellow/[0.06] border border-accent-yellow/10 text-accent-yellow text-[9px]">
      ⚠ {msg.text}
    </div>
  )
  if (msg.type === 'progress') return (
    <div className="text-accent-brand-light mt-[3px]">● {msg.text}</div>
  )
  return null
}

export default MiniAgentPane
