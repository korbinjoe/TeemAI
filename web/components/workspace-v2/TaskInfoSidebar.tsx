import { useWorkspace } from '../../contexts/WorkspaceContext'
import { Plus } from './icons'
import { cn } from '../../lib/utils'

type AgentStatus = 'running' | 'waiting' | 'error' | 'idle' | 'done'
type AgentRole = 'lead' | 'worker'
type DispatchType = 'user' | 'auto'

interface TaskAgent {
  id: string
  agent: string
  status: AgentStatus
  role: AgentRole
  dispatch: DispatchType
}

const MOCK_TASK = {
  id: 'task-1',
  name: 'Implement user auth flow',
  goal: 'Build login/register with session management, pass security review before merge.',
  workspace: 'openteam-web',
  agents: [
    { id: 'agent-1', agent: 'Fullstack', status: 'waiting', role: 'lead', dispatch: 'user' },
    { id: 'agent-2', agent: 'Reviewer', status: 'running', role: 'worker', dispatch: 'auto' },
    { id: 'agent-3', agent: 'Shield', status: 'error', role: 'worker', dispatch: 'auto' },
  ] as TaskAgent[],
  timeline: [
    { t: '14:20', event: 'User created task', type: 'user' },
    { t: '14:20', event: 'Fullstack started implementation', type: 'start' },
    { t: '14:28', event: 'Fullstack → Reviewer (handoff)', type: 'handoff' },
    { t: '14:28', event: 'Fullstack → Shield (handoff)', type: 'handoff' },
    { t: '14:30', event: 'Shield hit permission error', type: 'error' },
    { t: '14:32', event: 'Fullstack asking user: JWT or session?', type: 'waiting' },
  ],
}

const statusDotColor = (s: string) => {
  if (s === 'error') return 'bg-accent-red'
  if (s === 'waiting') return 'bg-accent-yellow'
  if (s === 'running') return 'bg-accent-brand'
  return 'bg-text-muted'
}

const timelineDotColor = (type: string) => {
  if (type === 'error') return 'bg-accent-red'
  if (type === 'waiting') return 'bg-accent-yellow'
  if (type === 'handoff') return 'bg-accent-brand'
  if (type === 'done') return 'bg-accent-green'
  return 'bg-text-muted'
}

const TaskInfoSidebar = () => {
  const { selectAgent, openAddAgent } = useWorkspace()
  const task = MOCK_TASK
  const leadAgent = task.agents.find((a) => a.role === 'lead')
  const workerAgents = task.agents.filter((a) => a.role !== 'lead')

  return (
    <div className="w-[200px] border-r border-border-subtle flex flex-col overflow-y-auto flex-shrink-0 bg-bg-secondary p-3">
      {/* Goal */}
      <div className="mb-3.5">
        <SectionLabel>Goal</SectionLabel>
        <div className="text-[11px] text-text-secondary leading-relaxed">{task.goal}</div>
        <div className="font-mono text-[9px] text-text-muted mt-1">{task.workspace}</div>
      </div>

      {/* Team */}
      <div className="mb-3.5">
        <SectionLabel>Team</SectionLabel>
        {leadAgent && (
          <div
            className="flex items-center gap-1.5 mb-1.5 p-1 px-1.5 rounded-[5px] bg-accent-purple/[0.04] cursor-pointer"
            onClick={() => selectAgent(leadAgent.id)}
          >
            <span className={cn('w-[7px] h-[7px] rounded-full', statusDotColor(leadAgent.status), leadAgent.status === 'running' && 'animate-pulse')} />
            <span className="text-[10px] font-medium text-text-primary flex-1">{leadAgent.agent}</span>
            <span className="text-[8px] px-1 rounded-sm bg-accent-purple/10 text-accent-purple font-semibold">LEAD</span>
          </div>
        )}
        {workerAgents.map((a) => (
          <div
            key={a.id}
            className="flex items-center gap-1.5 mb-1 py-[3px] px-1.5 pl-4 rounded relative cursor-pointer"
            onClick={() => selectAgent(a.id)}
          >
            <span className="absolute left-[6px] top-0 bottom-0 w-px bg-border" />
            <span className="text-[8px] text-text-muted">↳</span>
            <span className={cn('w-1.5 h-1.5 rounded-full', statusDotColor(a.status), a.status === 'running' && 'animate-pulse')} />
            <span className="text-[10px] text-text-secondary flex-1">{a.agent}</span>
            <span className="text-[8px] text-accent-green">{a.dispatch === 'auto' ? 'auto' : ''}</span>
          </div>
        ))}
        <div
          className="flex items-center gap-[5px] p-1 px-1.5 rounded cursor-pointer text-text-muted mt-1"
          onClick={() => openAddAgent(task.id)}
        >
          <Plus size={9} />
          <span className="text-[9px]">Add Agent</span>
        </div>
      </div>

      {/* Timeline */}
      <div className="mb-3.5">
        <SectionLabel>Timeline</SectionLabel>
        {task.timeline.map((ev, i) => (
          <div key={i} className="flex items-start gap-1.5 mb-1.5 relative">
            {i < task.timeline.length - 1 && (
              <div className="absolute left-[3px] top-[9px] bottom-[-3px] w-px bg-border" />
            )}
            <span className={cn('w-[7px] h-[7px] rounded-full mt-0.5 flex-shrink-0', timelineDotColor(ev.type))} />
            <div className="flex-1 min-w-0">
              <div className="text-[9px] text-text-secondary truncate">{ev.event}</div>
              <div className="font-mono text-[8px] text-text-muted">{ev.t}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="mt-auto">
        <button className="w-full py-[5px] px-2 rounded-[5px] border border-border bg-transparent text-text-secondary text-[9px] cursor-pointer text-left">
          Cancel Task
        </button>
      </div>
    </div>
  )
}

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[9px] font-bold uppercase tracking-wide text-text-muted mb-1.5">{children}</div>
)

export default TaskInfoSidebar
