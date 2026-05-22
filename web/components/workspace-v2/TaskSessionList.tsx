import { useWorkspace } from '../../contexts/WorkspaceContext'
import TaskGroupItem from './TaskGroupItem'
import { Pin, Clock, Check } from './icons'

// Temporary mock data until real task grouping is wired
const MOCK_TASKS = [
  {
    id: 'task-1',
    name: 'Implement user auth flow',
    workspace: 'openteam-web',
    status: 'waiting' as const,
    agents: [
      { id: 'agent-1', agent: 'Fullstack', status: 'waiting' as const, time: '4m', role: 'lead' as const, dispatch: 'user' as const },
      { id: 'agent-2', agent: 'Reviewer', status: 'running' as const, time: '1m', role: 'worker' as const, dispatch: 'auto' as const, handoffFrom: 'agent-1' },
      { id: 'agent-3', agent: 'Shield', status: 'error' as const, time: '12m', role: 'worker' as const, dispatch: 'auto' as const, handoffFrom: 'agent-1' },
    ],
  },
  {
    id: 'task-2',
    name: 'Redesign settings page',
    workspace: 'openteam-web',
    status: 'running' as const,
    agents: [
      { id: 'agent-4', agent: 'Designer', status: 'running' as const, time: '2m', role: 'lead' as const, dispatch: 'user' as const },
    ],
  },
]

const MOCK_DONE = [
  { id: 'task-3', name: 'DB migration v42', agents: [{ id: 'agent-5', agent: 'Fullstack' }] },
  { id: 'task-4', name: 'WebSocket reconnect fix', agents: [{ id: 'agent-6', agent: 'Designer' }] },
]

const MOCK_PINNED = [
  { id: 'pin-1', name: 'API rate limiter setup', age: '12d' },
  { id: 'pin-2', name: 'Settings page redesign', age: '3d' },
]

const TaskSessionList = () => {
  const { selectedAgentId, viewMode, selectedTaskId } = useWorkspace()

  return (
    <div className="flex flex-col">
      {/* Pinned */}
      <SectionHeader icon={<Pin size={11} />} label="Pinned" />
      {MOCK_PINNED.map((p) => (
        <div
          key={p.id}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer hover:bg-bg-hover transition-colors"
        >
          <Pin size={11} className="text-accent-brand" />
          <span className="text-xs text-text-primary flex-1 truncate">{p.name}</span>
          <span className="font-mono text-[10px] text-text-muted">{p.age}</span>
        </div>
      ))}

      {/* Active Tasks */}
      <SectionHeader icon={<Clock size={11} />} label="Active Tasks" count={MOCK_TASKS.length} />
      {MOCK_TASKS.map((task) => (
        <TaskGroupItem
          key={task.id}
          task={task}
          isSelected={
            (viewMode === 'task-overview' && selectedTaskId === task.id) ||
            task.agents.some((a) => a.id === selectedAgentId)
          }
        />
      ))}

      {/* Completed */}
      {MOCK_DONE.length > 0 && (
        <>
          <SectionHeader icon={<Check size={11} />} label="Completed" />
          {MOCK_DONE.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-[7px] px-2.5 py-[5px] rounded-[5px] cursor-pointer opacity-60 hover:bg-bg-hover transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-text-muted flex-shrink-0" />
              <span className="text-[11px] text-text-secondary flex-1 truncate">{task.name}</span>
              <span className="font-mono text-[9px] text-text-muted">
                {task.agents.length > 1 ? `${task.agents.length} agents` : task.agents[0]?.agent}
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

const SectionHeader = ({ icon, label, count }: { icon: React.ReactNode; label: string; count?: number }) => (
  <div className="flex items-center gap-[5px] px-2 pt-3 pb-1">
    <span className="text-text-muted">{icon}</span>
    <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">{label}</span>
    {count != null && <span className="font-mono text-[9px] text-text-muted ml-auto">{count}</span>}
  </div>
)

export default TaskSessionList
