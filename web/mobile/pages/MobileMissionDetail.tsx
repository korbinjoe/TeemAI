import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, ShieldCheck, Target, Lightbulb, FileText, Activity, HelpCircle, ArrowRightLeft, MessageSquare, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { API_BASE, authFetch } from '@/config/api'
import { getWebSocketClient } from '@/services/WebSocketClient'
import { memberStatusDot } from '@/components/workspace/MissionSessionRows'
import type { Chat, ChatMember } from '@/components/workspace/types'
import type { Message } from '@/types/chat'
import type { ExpertPermissionRequestPayload } from '@shared/ws-types'
import type { WhiteboardEntry } from '@shared/whiteboard-types'

const ENTRY_ICONS: Record<string, typeof Target> = {
  goal: Target,
  decision: Lightbulb,
  artifact: FileText,
  progress: Activity,
  open_question: HelpCircle,
  handoff: ArrowRightLeft,
  constraint: Target,
}

type Tab = 'messages' | 'activity'

const MobileMissionDetail = () => {
  const { missionId } = useParams<{ missionId: string }>()
  const navigate = useNavigate()
  const [chat, setChat] = useState<Chat | null>(null)
  const [entries, setEntries] = useState<WhiteboardEntry[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [permRequest, setPermRequest] = useState<ExpertPermissionRequestPayload | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('messages')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const fetchData = useCallback(async () => {
    if (!missionId) return
    try {
      const [chatRes, wbRes] = await Promise.all([
        authFetch(`${API_BASE}/api/chats/${missionId}`),
        authFetch(`${API_BASE}/api/chats/${missionId}/whiteboard/entries`),
      ])
      if (chatRes.ok) setChat(await chatRes.json())
      if (wbRes.ok) {
        const data = await wbRes.json()
        setEntries(data.entries ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [missionId])

  useEffect(() => { void fetchData() }, [fetchData])

  useEffect(() => {
    if (!missionId) return

    const ws = getWebSocketClient()
    ws.connect().catch(() => {})

    const handleStructuredMessage = (payload: { agentId: string; chatId: string; messages: Message[]; type?: 'full' | 'delta' }) => {
      if (payload.chatId !== missionId) return
      if (payload.type === 'full') {
        setMessages((prev) => {
          const incoming = payload.messages.filter((m) => m.type !== 'toolUse' && m.type !== 'toolResult' && m.type !== 'thinking')
          const existing = new Set(prev.map((m) => m.id))
          const newMsgs = incoming.filter((m) => !existing.has(m.id))
          if (newMsgs.length === 0) return prev
          return [...prev, ...newMsgs].sort((a, b) => a.timestamp - b.timestamp)
        })
      } else {
        const incoming = payload.messages.filter((m) => m.type !== 'toolUse' && m.type !== 'toolResult' && m.type !== 'thinking')
        if (incoming.length === 0) return
        setMessages((prev) => {
          const existing = new Set(prev.map((m) => m.id))
          const newMsgs = incoming.filter((m) => !existing.has(m.id))
          if (newMsgs.length === 0) return prev
          return [...prev, ...newMsgs].sort((a, b) => a.timestamp - b.timestamp)
        })
      }
    }

    const handlePermission = (payload: ExpertPermissionRequestPayload) => {
      if (payload.chatId === missionId) setPermRequest(payload)
    }

    const handlePermResolved = ({ chatId, requestId }: { chatId: string; requestId: string }) => {
      if (chatId === missionId) {
        setPermRequest((prev) => (prev?.requestId === requestId ? null : prev))
      }
    }

    const handleStatusChanged = ({ chatId, status }: { chatId: string; status: string }) => {
      if (chatId === missionId) {
        setChat((prev) => prev ? { ...prev, status: status as Chat['status'] } : prev)
      }
    }

    const handleWhiteboardEntry = (payload: { chatId: string; entry: WhiteboardEntry }) => {
      if (payload.chatId === missionId) {
        setEntries((prev) => [...prev, payload.entry])
      }
    }

    ws.on('expert:structured-message', handleStructuredMessage)
    ws.on('expert:permission-request', handlePermission)
    ws.on('chat:permission-resolved', handlePermResolved)
    ws.on('chat:status-changed', handleStatusChanged)
    ws.on('whiteboard:entry-added', handleWhiteboardEntry)

    ws.send('chat:set-context', { chatId: missionId })
    ws.send('chat:resume-experts', { chatId: missionId })

    return () => {
      ws.off('expert:structured-message', handleStructuredMessage)
      ws.off('expert:permission-request', handlePermission)
      ws.off('chat:permission-resolved', handlePermResolved)
      ws.off('chat:status-changed', handleStatusChanged)
      ws.off('whiteboard:entry-added', handleWhiteboardEntry)
    }
  }, [missionId])

  useEffect(() => {
    if (activeTab === 'messages') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, activeTab])

  const sendPermResponse = (outcome: { outcome: 'selected'; optionId: string } | { outcome: 'cancelled' }) => {
    if (!permRequest || submitting) return
    setSubmitting(true)
    getWebSocketClient().send('expert:permission-response', {
      agentId: permRequest.agentId,
      chatId: permRequest.chatId,
      sessionId: permRequest.sessionId,
      requestId: permRequest.requestId,
      outcome,
    })
    setPermRequest(null)
    setSubmitting(false)
  }

  if (loading) {
    return (
      <div className="px-4 pt-4">
        <p className="text-sm text-text-secondary">Loading mission...</p>
      </div>
    )
  }

  if (!chat) {
    return (
      <div className="px-4 pt-4">
        <p className="text-sm text-text-secondary">Mission not found.</p>
        <button
          type="button"
          onClick={() => navigate('/mobile')}
          className="mt-3 text-sm text-accent-brand"
        >
          Back to missions
        </button>
      </div>
    )
  }

  const members = chat.members ?? []
  const activeEntries = entries.filter((e) => e.status === 'active')

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-3 pb-2 border-b border-border-subtle">
        <button
          type="button"
          onClick={() => navigate('/mobile')}
          className="flex items-center gap-1 text-sm text-text-muted mb-2"
        >
          <ArrowLeft size={16} />
          <span>Missions</span>
        </button>

        <h1 className="text-base font-semibold text-text-primary mb-0.5">
          {chat.title || 'Untitled Mission'}
        </h1>
        <div className="text-xs text-text-muted mb-3">
          {chat.status === 'running' ? 'Running' : chat.status === 'stopped' ? 'Completed' : 'Idle'}
          {chat.totalCost != null && ` · $${chat.totalCost.toFixed(4)}`}
        </div>

        <div className="flex gap-1">
          <TabButton active={activeTab === 'messages'} onClick={() => setActiveTab('messages')}>
            <MessageSquare size={13} />
            <span>Messages</span>
          </TabButton>
          <TabButton active={activeTab === 'activity'} onClick={() => setActiveTab('activity')}>
            <BarChart3 size={13} />
            <span>Activity</span>
          </TabButton>
        </div>
      </div>

      {permRequest && (
        <div className="mx-4 mt-3 rounded-xl border border-accent-yellow/40 bg-accent-yellow/10 p-4">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck size={16} className="text-accent-yellow" />
            <span className="text-sm font-semibold text-text-primary">Permission Request</span>
          </div>
          <div className="text-[13px] text-text-primary mb-3 break-all">
            {permRequest.toolCall.title}
          </div>
          <div className="flex flex-col gap-2">
            {permRequest.options.map((opt) => (
              <button
                key={opt.optionId}
                disabled={submitting}
                onClick={() => sendPermResponse({ outcome: 'selected', optionId: opt.optionId })}
                className={cn(
                  'rounded-lg px-4 py-2.5 text-sm font-medium transition-colors',
                  opt.kind === 'allow_once' || opt.kind === 'allow_always'
                    ? 'bg-accent-brand text-white'
                    : 'bg-bg-secondary text-text-primary border border-border-subtle',
                )}
              >
                {opt.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4">
        {activeTab === 'messages' && (
          <MessagesTab messages={messages} members={members} messagesEndRef={messagesEndRef} />
        )}
        {activeTab === 'activity' && (
          <ActivityTab entries={activeEntries} members={members} />
        )}
      </div>
    </div>
  )
}

const TabButton = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
      active
        ? 'bg-accent-brand/10 text-accent-brand'
        : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover',
    )}
  >
    {children}
  </button>
)

const MessagesTab = ({ messages, members, messagesEndRef }: { messages: Message[]; members: ChatMember[]; messagesEndRef: React.RefObject<HTMLDivElement | null> }) => {
  if (messages.length === 0) {
    return <p className="text-sm text-text-muted">No messages yet. Waiting for agent activity...</p>
  }

  const agentNameMap = new Map(members.map((m) => [m.agentId, m.agentId]))

  return (
    <div className="flex flex-col gap-2.5">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} agentName={agentNameMap.get(msg.agentId ?? '') ?? msg.agentId} />
      ))}
      <div ref={messagesEndRef} />
    </div>
  )
}

const MessageBubble = ({ message, agentName }: { message: Message; agentName?: string }) => {
  const isUser = message.role === 'user'
  return (
    <div className={cn('flex flex-col max-w-[85%]', isUser ? 'self-end items-end' : 'self-start items-start')}>
      {!isUser && agentName && (
        <span className="text-[10px] text-text-muted mb-0.5 px-1">{agentName}</span>
      )}
      <div className={cn(
        'rounded-xl px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap break-words',
        isUser
          ? 'bg-accent-brand text-white rounded-br-sm'
          : 'bg-bg-secondary border border-border-subtle text-text-primary rounded-bl-sm',
      )}>
        {message.content}
      </div>
      <span className="text-[9px] text-text-muted mt-0.5 px-1">
        {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  )
}

const ActivityTab = ({ entries, members }: { entries: WhiteboardEntry[]; members: ChatMember[] }) => (
  <>
    {members.length > 0 && (
      <div className="mb-4">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary mb-2">
          Agents
        </div>
        <div className="flex flex-wrap gap-2">
          {members.map((m) => (
            <AgentChip key={m.agentId} member={m} />
          ))}
        </div>
      </div>
    )}

    {entries.length > 0 ? (
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary mb-2">
          Activity
        </div>
        <div className="flex flex-col gap-2">
          {entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} />
          ))}
        </div>
      </div>
    ) : (
      <p className="text-sm text-text-muted">No activity yet.</p>
    )}
  </>
)

const AgentChip = ({ member }: { member: ChatMember }) => (
  <div className="flex items-center gap-1.5 rounded-full border border-border-subtle bg-bg-secondary px-2.5 py-1">
    <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', memberStatusDot(member.status))} />
    <span className="text-[11px] text-text-primary truncate max-w-[100px]">{member.agentId}</span>
  </div>
)

const EntryRow = ({ entry }: { entry: WhiteboardEntry }) => {
  const Icon = ENTRY_ICONS[entry.type] ?? Activity
  return (
    <div className="flex gap-2.5 rounded-lg border border-border-subtle bg-bg-secondary px-3 py-2.5">
      <Icon size={14} className="text-text-muted mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[12px] text-text-primary leading-relaxed">{entry.summary}</div>
        <div className="text-[10px] text-text-muted mt-1">
          {entry.by}
          {entry.type !== 'progress' && <span className="ml-1.5 opacity-60">{entry.type}</span>}
        </div>
      </div>
    </div>
  )
}

export default MobileMissionDetail
