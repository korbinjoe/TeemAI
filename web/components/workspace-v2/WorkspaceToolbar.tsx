import { useWorkspace } from '../../contexts/WorkspaceContext'
import LayoutControls from './LayoutControls'
import { UsersGroup } from './icons'

const WorkspaceToolbar = () => {
  const { viewMode } = useWorkspace()

  return (
    <div className="h-[38px] border-b border-border-subtle flex items-center px-3 gap-2 flex-shrink-0 bg-bg-tertiary">
      {viewMode === 'task-overview' ? <TaskInfoBar /> : <AgentInfoBar />}
      <span className="flex-1" />
      <LayoutControls />
      <span className="font-mono text-[10px] text-text-muted">⌘\</span>
    </div>
  )
}

const AGENT_META: Record<string, { name: string; task: string; taskId: string; status: 'running' | 'waiting' | 'error' }> = {
  'agent-1': { name: 'Fullstack', task: 'Implement user auth flow', taskId: 'task-1', status: 'waiting' },
  'agent-2': { name: 'Reviewer', task: 'Implement user auth flow', taskId: 'task-1', status: 'running' },
  'agent-3': { name: 'Shield', task: 'Implement user auth flow', taskId: 'task-1', status: 'error' },
  'agent-4': { name: 'Designer', task: 'Redesign settings page', taskId: 'task-2', status: 'running' },
}

const statusDot = (s: string) => {
  if (s === 'error') return 'bg-accent-red'
  if (s === 'waiting') return 'bg-accent-yellow'
  return 'bg-accent-brand animate-pulse'
}

const AgentInfoBar = () => {
  const { selectedAgentId, openTaskOverview } = useWorkspace()
  const meta = AGENT_META[selectedAgentId || 'agent-4'] || AGENT_META['agent-4']

  return (
    <div className="flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full ${statusDot(meta.status)}`} />
      <span className="text-xs font-semibold text-text-primary">{meta.name}</span>
      <span className="text-[10px] text-text-muted">in</span>
      <span
        className="text-[11px] text-text-secondary truncate border-b border-dashed border-border cursor-pointer"
        onClick={() => openTaskOverview(meta.taskId)}
      >
        {meta.task}
      </span>
    </div>
  )
}

const TASK_NAMES: Record<string, string> = {
  'task-1': 'Implement user auth flow',
  'task-2': 'Redesign settings page',
}

const TaskInfoBar = () => {
  const { selectedTaskId } = useWorkspace()
  const taskName = selectedTaskId ? TASK_NAMES[selectedTaskId] || selectedTaskId : 'No task selected'

  return (
    <div className="flex items-center gap-2">
      <UsersGroup size={12} className="text-accent-brand" />
      <span className="text-xs font-semibold text-text-primary">Task Chat</span>
      <span className="text-[9px] px-1.5 py-0.5 rounded-[3px] bg-accent-purple/10 text-accent-purple font-semibold">
        GROUP
      </span>
      <span className="text-[11px] text-text-secondary truncate">{taskName}</span>
    </div>
  )
}

export default WorkspaceToolbar
