import { useRef, useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { API_BASE, authFetch } from '@/config/api'
import ChatInstance from '../chat/ChatInstance'
import type { PrefetchedWorkspaceData } from '../chat/ChatInstance'
import WorkspaceHome from './WorkspaceHome'

const MAX_CACHED = 4
const MAX_WS_CACHE = 5

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
  const wsDataCacheRef = useRef<Map<string, PrefetchedWorkspaceData>>(new Map())
  const [wsDataVersion, setWsDataVersion] = useState(0)

  useEffect(() => {
    if (!workspaceId) return
    if (wsDataCacheRef.current.has(workspaceId)) return
    let cancelled = false
    const fetchWsData = async () => {
      try {
        const [wsRes, agentsRes] = await Promise.all([
          authFetch(`${API_BASE}/api/workspaces/${workspaceId}`),
          authFetch(`${API_BASE}/api/agents`),
        ])
        if (cancelled) return
        if (!wsRes.ok) return
        const ws = await wsRes.json()
        const agents = agentsRes.ok ? await agentsRes.json() : []
        const data: PrefetchedWorkspaceData = {
          name: ws.name || workspaceId,
          repositories: ws.repositories ?? [],
          agents,
          agentTeam: ws.agentTeam,
        }
        const cache = wsDataCacheRef.current
        if (cache.size >= MAX_WS_CACHE) {
          const oldest = cache.keys().next().value!
          cache.delete(oldest)
        }
        cache.set(workspaceId, data)
        if (!cancelled) setWsDataVersion((v) => v + 1)
      } catch { /* ChatInstance will fetch on its own if this fails */ }
    }
    fetchWsData()
    return () => { cancelled = true }
  }, [workspaceId])

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

  // Read wsDataVersion to subscribe to cache updates
  void wsDataVersion

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
              prefetchedWorkspace={wsDataCacheRef.current.get(item.workspaceId) ?? null}
            />
          </div>
        )
      })}
    </div>
  )
}

export default ChatPane
