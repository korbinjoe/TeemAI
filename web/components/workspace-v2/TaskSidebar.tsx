import { useWorkspace } from '../../contexts/WorkspaceContext'
import TaskSessionList from './TaskSessionList'
import SidebarFooter from './SidebarFooter'
import { ChevronLeft, ChevronRight, Plus } from './icons'

interface TaskSidebarProps {
  collapsed: boolean
}

const TaskSidebar = ({ collapsed }: TaskSidebarProps) => {
  const { togglePanel } = useWorkspace()

  if (collapsed) {
    return (
      <div className="w-[52px] bg-bg-secondary border-r border-border-subtle flex flex-col flex-shrink-0 transition-[width] duration-200 ease-out">
        <div className="py-3 flex flex-col items-center gap-2">
          <Logo size={20} />
        </div>
        <div className="flex-1" />
        <div className="p-2 flex flex-col items-center border-t border-border-subtle">
          <button
            onClick={togglePanel}
            className="w-7 h-7 rounded-md flex items-center justify-center text-text-muted hover:bg-bg-hover hover:text-text-secondary transition-colors"
            title="Expand"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-[240px] bg-bg-secondary border-r border-border-subtle flex flex-col flex-shrink-0 transition-[width] duration-200 ease-out">
      {/* Header */}
      <div className="px-2.5 pt-2 pb-2 border-b border-border-subtle">
        <div className="flex items-center gap-2 px-2.5 pb-2">
          <Logo size={20} />
          <span className="font-nunito text-[13px] font-extrabold text-text-primary">OpenTeam</span>
          <span className="flex-1" />
          <button
            onClick={togglePanel}
            className="w-[22px] h-[22px] rounded-md flex items-center justify-center text-text-muted hover:bg-bg-hover hover:text-text-secondary transition-colors"
            title="Collapse"
          >
            <ChevronLeft size={12} />
          </button>
        </div>
        <button className="w-full flex items-center gap-2 px-2.5 py-[7px] rounded-md hover:bg-bg-hover transition-colors group">
          <Plus size={14} className="text-text-primary" />
          <span className="text-[13px] font-medium text-text-primary flex-1 text-left">New Task</span>
          <span className="font-mono text-[11px] text-text-muted">⌘N</span>
        </button>
      </div>

      {/* Session List */}
      <div className="flex-1 overflow-y-auto px-1.5 py-1">
        <TaskSessionList />
      </div>

      {/* Footer */}
      <SidebarFooter />
    </div>
  )
}

const Logo = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 352 352" fill="none">
    <rect width="352" height="352" rx="56" fill="rgb(var(--accent-brand))" />
    <rect x="75" y="92" width="202" height="48" rx="24" fill="white" />
    <rect x="150" y="92" width="52" height="192" rx="26" fill="white" />
  </svg>
)

export default TaskSidebar
