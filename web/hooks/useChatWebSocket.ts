import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { getWebSocketClient, sendTelemetry } from '../services/WebSocketClient'
import type { Message, AgentActivity, WorktreeSession, ChatActivityPayload } from '../types/chat'
import { ACTIVE_PHASES } from '@/lib/agentStatus'
import { reconcileExpertActivitiesFromChat } from '@/lib/expertActivityReconcile'
import type { AgentSummary } from '../types/agentConfig'
import { API_BASE, authFetch } from '@/config/api'
import { DEFAULT_AGENT, DEFAULT_MODEL } from '@/lib/models'
import { createAgentEventHandlers, type AgentEventHandlers } from './useAgentEvents'
import { usePermissionEvents } from './usePermissionEvents'
import { useAgentMessages, SYSTEM_MESSAGE_AGENT } from './useAgentMessages'
import type { PrefetchedWorkspaceData } from '../components/chat/ChatInstance'

interface UseChatWebSocketOptions {
  workspaceId?: string
  chatId?: string
  isNewChat: boolean
  initAgentId: string | null
  initialMessage?: string | null
  uid: (prefix: string) => string
  t: (key: string, opts?: Record<string, unknown>) => string
  setExpertActivities: React.Dispatch<React.SetStateAction<Record<string, AgentActivity>>>
  selectedAgentId: string | null
  availableAgents: AgentSummary[]
  handleSetSelectedAgentId: (id: string | null) => void
  setAvailableAgents: React.Dispatch<React.SetStateAction<AgentSummary[]>>
  /** Tab  Tab —  Tab  chat:set-context */
  isActive?: boolean
  onInitError?: () => void
  prefetchedWorkspace?: PrefetchedWorkspaceData | null
}

/**
 * ChatPage  WebSocket Workspace
 *
 * Owns the per-agent message store. Callers (ChatInstance, useChatActions)
 * read `agentMessages` and append via `addAgentMessage(agentId, msg)`. Each
 * agent slot corresponds 1:1 to one CLI JSONL session, so no cross-agent
 * merge/split happens at this layer.
 */
export const useChatWebSocket = (opts: UseChatWebSocketOptions) => {
  const {
    workspaceId, chatId, isNewChat, initAgentId,
    uid, t,
    setExpertActivities,
    selectedAgentId, availableAgents, handleSetSelectedAgentId, setAvailableAgents,
    isActive = true, onInitError, prefetchedWorkspace,
  } = opts
  const wsClient = getWebSocketClient()
  const isActiveRef = useRef(isActive)
  isActiveRef.current = isActive

  const initialAgentSetRef = useRef(false)
  const isNewChatRef = useRef(isNewChat)
  isNewChatRef.current = isNewChat
  const selectedAgentIdRef = useRef(selectedAgentId)
  selectedAgentIdRef.current = selectedAgentId

  const agentMessagesStore = useAgentMessages()
  const { agentMessages, agentMessagesRef, setAgentMessages, mergedMessages } = agentMessagesStore

  const [connected, setConnected] = useState(false)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [workspaceName, setWorkspaceName] = useState('')
  const [chatTitle, setChatTitle] = useState('')
  const [currentWorkingDirectory, setCurrentWorkingDirectory] = useState('')
  const [cwdReady, setCwdReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [allWorktreeSessions, setAllWorktreeSessions] = useState<WorktreeSession[]>([])
  const [wsRepositories, setWsRepositories] = useState<Array<{ id: string; path: string; name: string }>>([])
  const [chatTokenSnapshot, setChatTokenSnapshot] = useState<{ totalCost?: number; totalTokens?: { input: number; output: number; cacheRead?: number; cacheCreation?: number } } | null>(null)
  const [agentSlashCommands, setAgentSlashCommands] = useState<Record<string, string[]>>({})
  const [chatAvailableCommands, setChatAvailableCommands] = useState<string[]>([])
  const [chatModel, setChatModel] = useState<string | null>(null)
  // Authoritative chat-level run state, kept live via chat:status-changed /
  // chat:activity (same signal the sidebar uses). The conversation's stop
  // button must reconcile against this: per-agent expert:activity can get stuck
  // at a working phase when a turn-end event is missed, but the chat-level
  // signal is broadcast workspace-wide and reliably reaches this view.
  const [chatStatus, setChatStatus] = useState<string | null>(null)

  const [agentPlans, setAgentPlans] = useState<Record<string, { entries: Array<{ content: string; status: 'pending' | 'in_progress' | 'completed'; priority?: 'low' | 'medium' | 'high' }> }>>({})
  const [agentModes, setAgentModes] = useState<Record<string, string>>({})
  const [agentAvailableCommands, setAgentAvailableCommands] = useState<Record<string, string[]>>({})
  const [agentSessionInfo, setAgentSessionInfo] = useState<Record<string, { title?: string; updatedAt?: string }>>({})

  const currentSessionIdRef = useRef(currentSessionId)
  currentSessionIdRef.current = currentSessionId
  const chatIdRef = useRef(chatId)
  chatIdRef.current = chatId
  const autoInitFiredRef = useRef(false)
  const selectedAgentIdRefForSystem = useRef(selectedAgentId)
  selectedAgentIdRefForSystem.current = selectedAgentId

  const isCurrentChatEvent = (payload?: { chatId?: string }) => {
    const result = !!(payload?.chatId && chatIdRef.current && payload.chatId === chatIdRef.current)
    return result
  }

  /** Route chat-level system messages (errors, banners) to a fallback agent slot
   *  so they remain visible regardless of which agent the user is currently on. */
  const addSystemMessage = useCallback((msg: Message) => {
    const fallback = msg.agentId || selectedAgentIdRefForSystem.current || SYSTEM_MESSAGE_AGENT
    const targetMsg: Message = msg.agentId ? msg : { ...msg, agentId: fallback }
    setAgentMessages((prev) => {
      const list = prev[fallback] ?? []
      return { ...prev, [fallback]: [...list, targetMsg] }
    })
  }, [setAgentMessages])

  /** Append a message to a specific agent slot. Public API for callers. */
  const addAgentMessage = useCallback((agentId: string, msg: Message) => {
    const targetMsg: Message = msg.agentId ? msg : { ...msg, agentId }
    setAgentMessages((prev) => {
      const list = prev[agentId] ?? []
      return { ...prev, [agentId]: [...list, targetMsg] }
    })
  }, [setAgentMessages])

  const { permissionRequests, handleExpertPermissionRequest, handleChatPermissionResolved, dismissPermissionRequest } = usePermissionEvents(chatIdRef)

  const expertHandlersRef = useRef<AgentEventHandlers | null>(null)
  if (!expertHandlersRef.current) {
    expertHandlersRef.current = createAgentEventHandlers({
      isCurrentChatEvent, addSystemMessage, uid, t,
      setExpertActivities, setAgentMessages, setLoading, setThinking,
      setAgentSlashCommands, setAgentPlans, setAgentModes,
      setAgentAvailableCommands, setAgentSessionInfo,
    })
  }
  const expertHandlers = expertHandlersRef.current

  const sendContextTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const wsHandlersRef = useRef({
    handleError: (data: { message?: string; chatId?: string } | undefined) => {
      if (!isActiveRef.current) return
      if (data?.chatId && !isCurrentChatEvent(data)) return
      addSystemMessage({ id: uid('err'), role: 'agent', content: `Error: ${data?.message ?? 'unknown'}`, timestamp: Date.now(), type: 'error' })
      setLoading(false); setThinking(false)
    },
    ...expertHandlers,
    handleExpertPermissionRequest,
    handleChatPermissionResolved,
    sendChatContext: () => {
      const currentChatId = chatIdRef.current
      if (!currentChatId || !wsClient.isConnected()) return
      if (!isActiveRef.current) return
      if (sendContextTimerRef.current) clearTimeout(sendContextTimerRef.current)
      const fire = () => {
        const cid = chatIdRef.current
        if (!cid || !wsClient.isConnected() || !isActiveRef.current) return
        wsClient.send('mission:set-context', { chatId: cid })
        if (!isNewChatRef.current) wsClient.send('mission:resume-agents', { chatId: cid })
      }
      if (isNewChatRef.current) { fire(); return }
      sendContextTimerRef.current = setTimeout(() => {
        sendContextTimerRef.current = null
        fire()
      }, 300)
    },
  })

  wsHandlersRef.current.handleError = (data) => {
    if (!isActiveRef.current) return
    if (data?.chatId && !isCurrentChatEvent(data)) return
    addSystemMessage({ id: uid('err'), role: 'agent', content: `Error: ${data?.message ?? 'unknown'}`, timestamp: Date.now(), type: 'error' })
    setLoading(false); setThinking(false)
  }
  wsHandlersRef.current.sendChatContext = () => {
    const currentChatId = chatIdRef.current
    if (!currentChatId || !wsClient.isConnected()) return
    if (!isActiveRef.current) return
    if (sendContextTimerRef.current) clearTimeout(sendContextTimerRef.current)
    const fire = () => {
      const cid = chatIdRef.current
      if (!cid || !wsClient.isConnected() || !isActiveRef.current) return
      wsClient.send('mission:set-context', { chatId: cid })
      if (!isNewChatRef.current) wsClient.send('mission:resume-agents', { chatId: cid })
    }
    if (isNewChatRef.current) { fire(); return }
    sendContextTimerRef.current = setTimeout(() => {
      sendContextTimerRef.current = null
      fire()
    }, 300)
  }

  // ── Workspace Initialize ──
  const prefetchedRef = useRef(prefetchedWorkspace)
  prefetchedRef.current = prefetchedWorkspace

  useEffect(() => {
    if (!workspaceId) return
    let cancelled = false

    const init = async () => {
      try {
        const cached = prefetchedRef.current
        const hasCachedWs = cached && cached.name

        const [wsRes, chatRes, agentsRes] = await Promise.all([
          hasCachedWs ? Promise.resolve(null) : authFetch(`${API_BASE}/api/workspaces/${workspaceId}`),
          chatId ? authFetch(`${API_BASE}/api/chats/${chatId}`) : Promise.resolve(null),
          hasCachedWs ? Promise.resolve(null) : authFetch(`${API_BASE}/api/agents`),
        ])

        let wsName = ''
        let wsRepositories: Array<{ id: string; path: string; name: string }> = []
        let wsAgentTeam: { primaryAgentId?: string } | undefined
        let agents: AgentSummary[] = []

        if (hasCachedWs) {
          wsName = cached.name
          wsRepositories = cached.repositories
          wsAgentTeam = cached.agentTeam
          agents = cached.agents
        } else {
          if (!wsRes!.ok) throw new Error('Workspace not found')
          const ws = await wsRes!.json()
          if (cancelled) return
          wsName = ws.name || workspaceId || ''
          wsRepositories = ws.repositories ?? []
          wsAgentTeam = ws.agentTeam
          agents = agentsRes!.ok ? await agentsRes!.json() : []
        }
        if (cancelled) return

        setWorkspaceName(wsName)

        if (wsRepositories.length > 0) {
          setCurrentWorkingDirectory(wsRepositories[0].path)
          setWsRepositories(wsRepositories)
        }

        if (agents.length > 0) setAvailableAgents(agents)

        const chat = chatRes?.ok ? await chatRes.json() : null

        if (!initialAgentSetRef.current && agents.length > 0 && !selectedAgentIdRef.current) {
          initialAgentSetRef.current = true
          const lastAgent = chat?.lastAgentId
            ? agents.find((a: AgentSummary) => a.id === chat.lastAgentId)
            : null
          const primary = wsAgentTeam?.primaryAgentId
            ? agents.find((a: AgentSummary) => a.id === wsAgentTeam!.primaryAgentId)
            : null
          const fallback = agents.find((a: AgentSummary) => a.id === DEFAULT_AGENT) ?? agents[0]
          const target = lastAgent ?? primary ?? fallback
          if (target) handleSetSelectedAgentId(target.id)
        } else if (!initialAgentSetRef.current) {
          initialAgentSetRef.current = true
        }

        if (chat) {
          if (chat.title) setChatTitle(chat.title)
          if (chat.status) setChatStatus(chat.status)
          setChatModel(chat.model || DEFAULT_MODEL)
          setAllWorktreeSessions(chat.worktreeSessions ?? [])
          if (chat.totalTokens || chat.totalCost != null) {
            setChatTokenSnapshot({ totalCost: chat.totalCost, totalTokens: chat.totalTokens })
          }
        }
      } catch (err) {
        console.error('[useChatWebSocket] Workspace init failed:', err)
        sendTelemetry('system', 'web.workspace_init_failed', { error: err instanceof Error ? err.message : String(err) })
        toast.error(t('chat:workspaceLoadFailed'))
        onInitError?.()
        return
      }

      setCwdReady(true)
    }

    init()
    return () => { cancelled = true }
  }, [workspaceId, chatId, handleSetSelectedAgentId, setAvailableAgents, onInitError])

  useEffect(() => {
    let cancelled = false
    const h = wsHandlersRef.current

    const onStructuredMessage = (p: unknown) => { if (!isActiveRef.current) return; wsHandlersRef.current.onExpertStructuredMessage(p as Parameters<typeof h.onExpertStructuredMessage>[0]) }
    const onError = (p: unknown) => wsHandlersRef.current.handleError(p as { message?: string; chatId?: string } | undefined)
    const onExpertError = (p: unknown) => { if (!isActiveRef.current) return; wsHandlersRef.current.handleExpertError(p as Parameters<typeof h.handleExpertError>[0]) }
    const onExpertActivity = (p: unknown) => { if (!isActiveRef.current) return; wsHandlersRef.current.handleExpertActivity(p as Parameters<typeof h.handleExpertActivity>[0]) }
    const onExpertExit = (p: unknown) => { if (!isActiveRef.current) return; wsHandlersRef.current.handleExpertExit(p as Parameters<typeof h.handleExpertExit>[0]) }
    const onExpertStarted = (p: unknown) => { if (!isActiveRef.current) return; wsHandlersRef.current.handleExpertStarted(p as Parameters<typeof h.handleExpertStarted>[0]) }
    const onExpertResumeFailed = (p: unknown) => { if (!isActiveRef.current) return; wsHandlersRef.current.handleExpertResumeFailed(p as Parameters<typeof h.handleExpertResumeFailed>[0]) }
    const onVersionBlocked = (p: unknown) => { if (!isActiveRef.current) return; wsHandlersRef.current.handleVersionBlocked(p as Parameters<typeof h.handleVersionBlocked>[0]) }
    const onExpertSlashCommands = (p: unknown) => { if (!isActiveRef.current) return; wsHandlersRef.current.handleExpertSlashCommands(p as Parameters<typeof h.handleExpertSlashCommands>[0]) }
    const onExpertPartialText = (p: unknown) => { if (!isActiveRef.current) return; wsHandlersRef.current.handleExpertPartialText(p as Parameters<typeof h.handleExpertPartialText>[0]) }
    const onExpertPlanUpdate = (p: unknown) => { if (!isActiveRef.current) return; wsHandlersRef.current.handleExpertPlanUpdate(p as Parameters<typeof h.handleExpertPlanUpdate>[0]) }
    const onExpertModeChange = (p: unknown) => { if (!isActiveRef.current) return; wsHandlersRef.current.handleExpertModeChange(p as Parameters<typeof h.handleExpertModeChange>[0]) }
    const onExpertCommandsUpdate = (p: unknown) => { if (!isActiveRef.current) return; wsHandlersRef.current.handleExpertCommandsUpdate(p as Parameters<typeof h.handleExpertCommandsUpdate>[0]) }
    const onExpertSessionInfo = (p: unknown) => { if (!isActiveRef.current) return; wsHandlersRef.current.handleExpertSessionInfo(p as Parameters<typeof h.handleExpertSessionInfo>[0]) }
    const onExpertPermissionRequest = (p: unknown) => { if (!isActiveRef.current) return; wsHandlersRef.current.handleExpertPermissionRequest(p as Parameters<typeof h.handleExpertPermissionRequest>[0]) }
    const onChatPermissionResolved = (p: unknown) => { if (!isActiveRef.current) return; wsHandlersRef.current.handleChatPermissionResolved(p as Parameters<typeof h.handleChatPermissionResolved>[0]) }
    const onChatTitleUpdated = (p: unknown) => {
      if (!isActiveRef.current) return
      const payload = p as { chatId: string; title: string }
      if (!isCurrentChatEvent(payload)) return
      if (payload.title) setChatTitle(payload.title)
    }
    const onChatAvailableCommands = (p: unknown) => {
      if (!isActiveRef.current) return
      const payload = p as { chatId: string; commands: string[] }
      if (!isCurrentChatEvent(payload)) return
      if (Array.isArray(payload.commands)) setChatAvailableCommands(payload.commands)
    }
    // Track chat-level run state. Not gated on isActiveRef so background-cached
    // ChatInstance tabs stay in sync; filtered to this chat by chatId.
    const onChatStatusChanged = (p: unknown) => {
      const payload = p as { chatId: string; status: string }
      if (!isCurrentChatEvent(payload)) return
      if (payload.status) setChatStatus(payload.status)
    }
    const onChatActivity = (p: unknown) => {
      const payload = p as ChatActivityPayload
      if (!isCurrentChatEvent(payload)) return
      const phase = payload.phase
      if (phase === 'completed' || phase === 'error') setChatStatus('stopped')
      else if (phase === 'waiting_input' || phase === 'waiting_confirmation') setChatStatus('idle')
      else if (ACTIVE_PHASES.has(phase)) setChatStatus('running')
      // Reconcile the message-area progress cards: the per-agent expert:activity
      // stream is isActive-gated and can miss a turn-end event, freezing a card
      // at a working phase. This authoritative payload advances any such stuck
      // card to its terminal phase (same signal the right Agents panel uses).
      setExpertActivities((prev) => reconcileExpertActivitiesFromChat(prev, payload))
    }

    wsClient.on('agent:structured-message', onStructuredMessage)
    wsClient.on('error', onError)
    wsClient.on('agent:error', onExpertError)
    wsClient.on('agent:activity', onExpertActivity)
    wsClient.on('agent:exit', onExpertExit)
    wsClient.on('agent:stopped', onExpertExit)
    wsClient.on('agent:started', onExpertStarted)
    wsClient.on('agent:resume-failed', onExpertResumeFailed)
    wsClient.on('agent:version-blocked', onVersionBlocked)
    wsClient.on('agent:slash-commands', onExpertSlashCommands)
    wsClient.on('agent:partial-text', onExpertPartialText)
    wsClient.on('agent:plan-update', onExpertPlanUpdate)
    wsClient.on('agent:mode-change', onExpertModeChange)
    wsClient.on('agent:commands-update', onExpertCommandsUpdate)
    wsClient.on('agent:session-info', onExpertSessionInfo)
    wsClient.on('agent:permission-request', onExpertPermissionRequest)
    wsClient.on('mission.permission-resolved', onChatPermissionResolved)
    wsClient.on('mission.title-updated', onChatTitleUpdated)
    wsClient.on('mission.available-commands', onChatAvailableCommands)
    wsClient.on('mission.status-changed', onChatStatusChanged)
    wsClient.on('mission.activity', onChatActivity)

    const handleReconnected = () => {
      setConnected(true)
      wsHandlersRef.current.sendChatContext()
    }
    wsClient.on('reconnected', handleReconnected)

    const handleDisconnected = () => setConnected(false)
    wsClient.on('disconnected', handleDisconnected)

    const handleReconnectFailed = () => {
      setConnected(false)
      wsClient.connect().catch(() => { })
    }
    wsClient.on('reconnect_failed', handleReconnectFailed)

    const handleVisibilityChange = () => {
      if (!isActiveRef.current) return
      if (document.visibilityState === 'visible' && wsClient.isConnected()) {
        wsHandlersRef.current.sendChatContext()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    const connect = async () => {
      if (!wsClient.isConnected()) {
        await wsClient.connect()
      }
      if (cancelled) return
      setConnected(true)
      wsHandlersRef.current.sendChatContext()

      if (!currentSessionIdRef.current) {
        const localSid = `local-${Date.now()}`
        setCurrentSessionId(localSid)
      }
    }

    connect().catch(() => { if (!cancelled) setConnected(false) })

    return () => {
      cancelled = true
      expertHandlers.cleanupDeltaTimer()
      if (sendContextTimerRef.current) { clearTimeout(sendContextTimerRef.current); sendContextTimerRef.current = null }
      wsClient.off('agent:structured-message', onStructuredMessage)
      wsClient.off('error', onError)
      wsClient.off('agent:error', onExpertError)
      wsClient.off('agent:activity', onExpertActivity)
      wsClient.off('agent:exit', onExpertExit)
      wsClient.off('agent:stopped', onExpertExit)
      wsClient.off('agent:started', onExpertStarted)
      wsClient.off('agent:resume-failed', onExpertResumeFailed)
      wsClient.off('agent:version-blocked', onVersionBlocked)
      wsClient.off('agent:slash-commands', onExpertSlashCommands)
      wsClient.off('agent:partial-text', onExpertPartialText)
      wsClient.off('agent:plan-update', onExpertPlanUpdate)
      wsClient.off('agent:mode-change', onExpertModeChange)
      wsClient.off('agent:commands-update', onExpertCommandsUpdate)
      wsClient.off('agent:session-info', onExpertSessionInfo)
      wsClient.off('agent:permission-request', onExpertPermissionRequest)
      wsClient.off('mission.permission-resolved', onChatPermissionResolved)
      wsClient.off('mission.title-updated', onChatTitleUpdated)
      wsClient.off('mission.available-commands', onChatAvailableCommands)
      wsClient.off('mission.status-changed', onChatStatusChanged)
      wsClient.off('mission.activity', onChatActivity)
      wsClient.off('reconnected', handleReconnected)
      wsClient.off('disconnected', handleDisconnected)
      wsClient.off('reconnect_failed', handleReconnectFailed)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [wsClient])

  const prevIsActiveRef = useRef(isActive)
  useEffect(() => {
    if (isActive && !prevIsActiveRef.current && chatId && wsClient.isConnected()) {
      wsHandlersRef.current.sendChatContext()
    }
    prevIsActiveRef.current = isActive
  }, [isActive, chatId, wsClient])

  const prevContextChatIdRef = useRef<string | undefined>(chatId)
  useEffect(() => {
    if (chatId === prevContextChatIdRef.current) return
    prevContextChatIdRef.current = chatId
    if (!chatId || !wsClient.isConnected()) return
    wsHandlersRef.current.sendChatContext()
  }, [chatId, wsClient])

  useEffect(() => {
    if (!isNewChat) return
    if (autoInitFiredRef.current) return
    const rawAgentId = initAgentId || selectedAgentId
    if (!connected || !cwdReady || !rawAgentId || !chatId || availableAgents.length === 0) return
    if (!opts.initialMessage) return

    const agent = availableAgents.find((a) => a.name === rawAgentId || a.id === rawAgentId)
    const agentId = agent?.id || rawAgentId
    if (!agentId) return

    autoInitFiredRef.current = true
    if (agentId !== selectedAgentId) {
      handleSetSelectedAgentId(agentId)
    }
    setExpertActivities((prev) => ({
      ...prev,
      [agentId]: { phase: 'initializing', background: false, toolCount: 0, toolCompleted: 0, hasText: false, startedAt: Date.now(), updatedAt: Date.now() },
    }))
    wsClient.send('agent:direct-input', {
      chatId,
      agentId,
      message: opts.initialMessage || '',
      autoStart: true,
      cwd: currentWorkingDirectory,
      repositories: wsRepositories.map((r) => ({ path: r.path })),
      cols: 80,
      rows: 24,
    })
  }, [isNewChat, connected, cwdReady, selectedAgentId, initAgentId, chatId, currentWorkingDirectory, wsRepositories, wsClient, handleSetSelectedAgentId, availableAgents, opts.initialMessage])

  return {
    wsClient,
    connected,
    currentSessionId, setCurrentSessionId,
    workspaceName,
    chatTitle, setChatTitle,
    currentWorkingDirectory,
    cwdReady,
    loading, setLoading,
    thinking, setThinking,
    allWorktreeSessions,
    wsRepositories,
    chatTokenSnapshot,
    agentSlashCommands,
    chatAvailableCommands,
    chatModel, setChatModel,
    chatStatus,
    agentPlans,
    agentModes,
    agentAvailableCommands,
    agentSessionInfo,
    permissionRequests,
    dismissPermissionRequest,
    // Per-agent message store
    agentMessages,
    agentMessagesRef,
    mergedMessages,
    addAgentMessage,
    addSystemMessage,
    setAgentMessages,
  }
}
