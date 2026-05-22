import { useWorkspace } from '../../contexts/WorkspaceContext'
import ChatPane from './ChatPane'
import IDEPanel from './IDEPanel'
import MiniAgentPane from './MiniAgentPane'
import TaskOverview from './TaskOverview'
import GroupChat from './GroupChat'

const MOCK_QUAD_AGENTS = [
  { id: 'agent-1', name: 'Fullstack', status: 'waiting' as const, role: 'lead' as const, messages: [
    { type: 'done', text: 'Write server/routes/auth.ts' },
    { type: 'done', text: 'Write web/hooks/useAuth.ts' },
    { type: 'waiting', text: 'JWT or session-based auth?' },
  ]},
  { id: 'agent-2', name: 'Reviewer', status: 'running' as const, role: 'worker' as const, messages: [
    { type: 'tool', text: 'Read server/routes/auth.ts' },
    { type: 'tool', text: 'Grep "password" in src/' },
    { type: 'progress', text: 'Analyzing security patterns...' },
  ]},
  { id: 'agent-3', name: 'Shield', status: 'error' as const, role: 'worker' as const, messages: [
    { type: 'tool', text: 'Read Dockerfile' },
    { type: 'done', text: 'Scanned docker-compose.yml' },
    { type: 'error', text: 'Permission denied: /etc/docker/daemon.json' },
  ]},
  { id: 'agent-4', name: 'Designer', status: 'running' as const, role: 'lead' as const, messages: [
    { type: 'done', text: 'Write SettingsPage.tsx' },
    { type: 'done', text: 'Write SettingsTabs.tsx' },
    { type: 'progress', text: 'Working on AppearanceTab...' },
  ]},
]

const WorkspaceContent = () => {
  const { viewMode, layoutMode } = useWorkspace()

  if (viewMode === 'task-overview') {
    return <TaskOverviewContent />
  }

  if (layoutMode === 'single') {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <ChatPane />
      </div>
    )
  }

  if (layoutMode === 'split') {
    return (
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className="w-[44%] flex flex-col overflow-hidden border-r border-border-subtle">
          <ChatPane />
        </div>
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <IDEPanel />
        </div>
      </div>
    )
  }

  // Quad layout
  return (
    <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-px bg-border overflow-hidden">
      {MOCK_QUAD_AGENTS.map((a, i) => (
        <MiniAgentPane
          key={a.id}
          agentId={a.id}
          agentName={a.name}
          status={a.status}
          role={a.role}
          shortcutKey={String(i + 1)}
          messages={a.messages}
        />
      ))}
    </div>
  )
}

const TaskOverviewContent = () => {
  const { layoutMode } = useWorkspace()

  if (layoutMode === 'single') {
    return <TaskOverview />
  }

  if (layoutMode === 'split') {
    return (
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className="w-[44%] flex flex-col overflow-hidden border-r border-border-subtle">
          <GroupChat />
        </div>
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <IDEPanel />
        </div>
      </div>
    )
  }

  // Quad — show task agents in quad panes
  return (
    <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-px bg-border overflow-hidden">
      {MOCK_QUAD_AGENTS.slice(0, 3).map((a, i) => (
        <MiniAgentPane
          key={a.id}
          agentId={a.id}
          agentName={a.name}
          status={a.status}
          role={a.role}
          shortcutKey={String(i + 1)}
          messages={a.messages}
        />
      ))}
      <div className="bg-bg-primary flex items-center justify-center text-text-muted text-[11px] cursor-pointer hover:bg-bg-hover transition-colors">
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mr-1.5">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Add Agent
      </div>
    </div>
  )
}

export default WorkspaceContent
