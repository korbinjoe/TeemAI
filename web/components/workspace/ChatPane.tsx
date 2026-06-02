import { useLocation } from 'react-router-dom'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import ChatInstance from '../chat/ChatInstance'
import WorkspaceHome from './WorkspaceHome'

const ChatPane = () => {
  const { workspaceId, activeChatId, ideMountNode } = useWorkspace()
  const location = useLocation()
  const navState = location.state as { isNew?: boolean; agentId?: string } | null

  if (!workspaceId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="text-sm font-medium text-text-secondary mb-1">No workspace</div>
        <div className="text-xs text-text-muted max-w-sm leading-relaxed">Open a workspace to start working.</div>
      </div>
    )
  }

  if (!activeChatId) {
    return <WorkspaceHome />
  }

  return (
    <ChatInstance
      key={activeChatId}
      chatId={activeChatId}
      workspaceId={workspaceId}
      isActive
      isNewChat={navState?.isNew}
      initAgentId={navState?.agentId}
      hideRightPanel
      rightPanelMountNode={ideMountNode}
    />
  )
}

export default ChatPane
