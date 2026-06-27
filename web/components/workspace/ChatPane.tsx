import { Profiler, useRef, useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { API_BASE, authFetch } from '@/config/api'
import ChatInstance from '../chat/ChatInstance'
import type { PrefetchedWorkspaceData } from '../chat/ChatInstance'
import WorkspaceHome from './WorkspaceHome'
import { missionSwitchPerf } from '../../lib/missionSwitchPerf'
import { renderPerf } from '../../lib/renderPerf'

const MAX_CACHED = 8
const MAX_WS_CACHE = 5

const cachedPaneStyle = (active: boolean): React.CSSProperties => ({
  display: active ? 'flex' : 'none',
  zIndex: active ? 1 : 0,
  pointerEvents: active ? 'auto' : 'none',
})

interface CachedChat {
  chatId: string
  workspaceId: string
  isNew?: boolean
  agentId?: string
}

const ChatPane = () => {
  const { workspaceId, activeChatId } = useWorkspace()
  const location = useLocation()
  const navState = location.state as { isNew?: boolean; agentId?: string } | null

  const cacheRef = useRef<CachedChat[]>([])
  const wsDataCacheRef = useRef<Map<string, PrefetchedWorkspaceData>>(new Map())
  const [wsDataVersion, setWsDataVersion] = useState(0)
  const prevActiveChatRef = useRef<string | null>(null)
  const warmHitRef = useRef(false)

  useEffect(() => {
    if (!activeChatId || activeChatId === prevActiveChatRef.current) return
    prevActiveChatRef.current = activeChatId
    if (!missionSwitchPerf.getActive()) {
      missionSwitchPerf.start(activeChatId, 'other')
    }
    missionSwitchPerf.mark('chat-pane-active', activeChatId, {
      cached: warmHitRef.current,
      warm: warmHitRef.current,
    })
    renderPerf.mark('mission-route-entered', { chatId: activeChatId, cached: warmHitRef.current })
  }, [activeChatId])

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
      // `isNew` is a one-shot navigation hint; normal revisits must resume history.
      if (!isNew) item.isNew = false
      if (agentId !== undefined) item.agentId = agentId
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

  const warmBeforeEnsure = new Set(cacheRef.current.map((c) => c.chatId))
  warmHitRef.current = warmBeforeEnsure.has(activeChatId)
  ensureCached(activeChatId, workspaceId, navState?.isNew, navState?.agentId)
  const cached = cacheRef.current

  // Read wsDataVersion to subscribe to cache updates
  void wsDataVersion

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative" data-render-surface="chat-pane">
      {cached.map((item) => {
        const active = item.chatId === activeChatId
        const chatInstance = (
          <ChatInstance
            chatId={item.chatId}
            workspaceId={item.workspaceId}
            isActive={active}
            isNewChat={item.isNew}
            initAgentId={item.agentId}
            resumeWarm={warmBeforeEnsure.has(item.chatId) && !item.isNew}
            hideRightPanel
            prefetchedWorkspace={wsDataCacheRef.current.get(item.workspaceId) ?? null}
          />
        )
        return (
          <div
            key={item.chatId}
            className="absolute inset-0 flex-col"
            style={cachedPaneStyle(active)}
            aria-hidden={!active || undefined}
          >
            {renderPerf.enabled ? (
              <Profiler id={`chat-instance:${item.chatId}`} onRender={renderPerf.onProfilerRender}>
                {chatInstance}
              </Profiler>
            ) : chatInstance}
          </div>
        )
      })}
    </div>
  )
}

export default ChatPane
