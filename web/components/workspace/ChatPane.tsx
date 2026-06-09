import { useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import ChatInstance from '../chat/ChatInstance'
import WorkspaceHome from './WorkspaceHome'

const MAX_CACHED = 4

interface CachedChat {
  chatId: string
  workspaceId: string
  isNew?: boolean
  agentId?: string
}

const ChatPane = () => {
  const { workspaceId, activeChatId, ideMountNode } = useWorkspace()
  const location = useLocation()
  const navState = location.state as { isNew?: boolean; agentId?: string } | null

  const cacheRef = useRef<CachedChat[]>([])

  const ensureCached = useCallback((chatId: string, wsId: string, isNew?: boolean, agentId?: string) => {
    const cache = cacheRef.current
    const idx = cache.findIndex((c) => c.chatId === chatId)
    if (idx >= 0) {
      const [item] = cache.splice(idx, 1)
      cache.unshift(item)
    } else {
      cache.unshift({ chatId, workspaceId: wsId, isNew, agentId })
      if (cache.length > MAX_CACHED) cache.length = MAX_CACHED
    }
  }, [])

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

  ensureCached(activeChatId, workspaceId, navState?.isNew, navState?.agentId)
  const cached = cacheRef.current

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
      {cached.map((item) => {
        const active = item.chatId === activeChatId
        return (
          <div
            key={item.chatId}
            className="absolute inset-0 flex flex-col"
            style={{ visibility: active ? 'visible' : 'hidden', zIndex: active ? 1 : 0 }}
          >
            <ChatInstance
              chatId={item.chatId}
              workspaceId={item.workspaceId}
              isActive={active}
              isNewChat={item.isNew}
              initAgentId={item.agentId}
              hideRightPanel
              rightPanelMountNode={active ? ideMountNode : null}
            />
          </div>
        )
      })}
    </div>
  )
}

export default ChatPane
