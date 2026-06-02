import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, AlertTriangle, Send } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import { API_BASE, authFetch } from '@/config/api'
import { getWebSocketClient } from '@/services/WebSocketClient'
import type { Chat } from '@/components/workspace/types'
import type { Message } from '@/types/chat'
import type { ExpertPermissionRequestPayload } from '@shared/ws-types'

const HIDDEN_TYPES = new Set(['toolUse', 'toolResult', 'thinking', 'stats', 'plan'])

const isVisibleMessage = (m: Message): boolean =>
  !HIDDEN_TYPES.has(m.type ?? '') && !!m.content?.trim()

const AGENT_COLORS: Record<string, string> = {
  lead: '#6B8DB5',
  'fullstack-engineer': '#C87941',
  'code-reviewer': '#5BA0A8',
  'ui-designer': '#C76B8A',
  'devops-engineer': '#7BA056',
  architect: '#5878B0',
  sensei: '#9B6BC0',
  'image-creator': '#D4A03C',
}

const FALLBACK_COLORS = ['#8B6BAE', '#5C9E72', '#B87850', '#6898B8', '#C0728A', '#8FA84E']

const getAgentColor = (agentId: string): string => {
  if (AGENT_COLORS[agentId]) return AGENT_COLORS[agentId]
  let h = 0
  for (let i = 0; i < agentId.length; i++) h = ((h << 5) - h + agentId.charCodeAt(i)) | 0
  return FALLBACK_COLORS[Math.abs(h) % FALLBACK_COLORS.length]
}

const getInitial = (name: string): string =>
  (name.charAt(0) || '?').toUpperCase()

const MobileMissionDetail = () => {
  const { missionId } = useParams<{ missionId: string }>()
  const navigate = useNavigate()
  const [chat, setChat] = useState<Chat | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [permRequest, setPermRequest] = useState<ExpertPermissionRequestPayload | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [inputText, setInputText] = useState('')
  const conversationEndRef = useRef<HTMLDivElement>(null)

  const fetchData = useCallback(async () => {
    if (!missionId) return
    try {
      const res = await authFetch(`${API_BASE}/api/chats/${missionId}`)
      if (res.ok) setChat(await res.json())
    } finally {
      setLoading(false)
    }
  }, [missionId])

  useEffect(() => { void fetchData() }, [fetchData])

  useEffect(() => {
    if (!missionId) return

    const ws = getWebSocketClient()
    ws.connect().catch(() => {})

    const handleStructuredMessage = (payload: { agentId: string; chatId: string; messages: Message[] }) => {
      if (payload.chatId !== missionId) return
      const incoming = payload.messages.filter(isVisibleMessage)
      if (incoming.length === 0) return
      setMessages((prev) => {
        const existing = new Set(prev.map((m) => m.id))
        const newMsgs = incoming.filter((m) => !existing.has(m.id))
        if (newMsgs.length === 0) return prev
        return [...prev, ...newMsgs].sort((a, b) => a.timestamp - b.timestamp)
      })
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

    ws.on('expert:structured-message', handleStructuredMessage)
    ws.on('expert:permission-request', handlePermission)
    ws.on('chat:permission-resolved', handlePermResolved)
    ws.on('chat:status-changed', handleStatusChanged)

    ws.send('chat:set-context', { chatId: missionId })
    ws.send('chat:resume-experts', { chatId: missionId })

    return () => {
      ws.off('expert:structured-message', handleStructuredMessage)
      ws.off('expert:permission-request', handlePermission)
      ws.off('chat:permission-resolved', handlePermResolved)
      ws.off('chat:status-changed', handleStatusChanged)
    }
  }, [missionId])

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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

  const handleSendMessage = () => {
    const text = inputText.trim()
    if (!text || !missionId) return
    getWebSocketClient().send('expert:user-input', { chatId: missionId, text })
    setInputText('')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-text-secondary">Loading mission...</p>
      </div>
    )
  }

  if (!chat) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-sm text-text-secondary">Mission not found.</p>
        <button type="button" onClick={() => navigate('/mobile')} className="text-sm text-accent-brand">
          Back to missions
        </button>
      </div>
    )
  }

  const members = chat.members ?? []
  const agentCount = members.length
  const subtitle = [
    agentCount > 0 ? `${agentCount} agent${agentCount > 1 ? 's' : ''}` : null,
    chat.totalCost != null ? `$${chat.totalCost.toFixed(2)}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border-subtle shrink-0">
        <button
          type="button"
          onClick={() => navigate('/mobile')}
          className="w-8 h-8 flex items-center justify-center rounded-full text-accent-brand active:bg-bg-hover"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-[16px] font-semibold text-text-primary truncate">
            {chat.title || 'Untitled Mission'}
          </div>
          {subtitle && (
            <div className="text-[11px] text-text-muted mt-px">{subtitle}</div>
          )}
        </div>
      </div>

      {/* Permission Banner */}
      {permRequest && (
        <div className="shrink-0 bg-accent-yellow/[0.08] border-b border-accent-yellow/20 px-5 py-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-accent-yellow mb-1">
            <AlertTriangle size={14} />
            Permission Request — {permRequest.agentId}
          </div>
          <div className="text-xs text-text-secondary font-mono bg-bg-input border border-border-subtle rounded-md px-2.5 py-1.5 mb-2.5">
            {permRequest.toolCall.title}
          </div>
          <div className="flex gap-2">
            {permRequest.options.map((opt) => {
              const isAllow = opt.kind === 'allow_once' || opt.kind === 'allow_always'
              return (
                <button
                  key={opt.optionId}
                  disabled={submitting}
                  onClick={() => sendPermResponse({ outcome: 'selected', optionId: opt.optionId })}
                  className={cn(
                    'flex-1 py-2 rounded-md text-[13px] font-semibold transition-colors text-center',
                    isAllow
                      ? 'bg-accent-brand text-bg-primary'
                      : 'bg-bg-hover text-text-secondary border border-border-subtle',
                  )}
                >
                  {opt.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Conversation */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {messages.length === 0 ? (
          <p className="text-sm text-text-muted text-center mt-8">No messages yet.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((msg) => (
              <ConversationMessage key={msg.id} message={msg} />
            ))}
            <div ref={conversationEndRef} />
          </div>
        )}
      </div>

      {/* Input Bar */}
      <div className="shrink-0 flex items-end gap-2 px-4 py-2 border-t border-border-subtle bg-bg-secondary">
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSendMessage()
            }
          }}
          placeholder="Send a message..."
          rows={1}
          className={cn(
            'flex-1 resize-none rounded-[20px] border border-border-subtle bg-bg-input',
            'px-3.5 py-2 text-[13px] text-text-primary placeholder:text-text-muted',
            'focus:outline-none focus:border-accent-brand',
            'min-h-[36px] max-h-[100px]',
          )}
        />
        <button
          type="button"
          onClick={handleSendMessage}
          disabled={!inputText.trim()}
          className={cn(
            'shrink-0 w-[36px] h-[36px] rounded-full flex items-center justify-center transition-all',
            inputText.trim()
              ? 'bg-accent-brand text-bg-primary active:scale-[0.92]'
              : 'bg-bg-hover text-text-muted',
          )}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}

const formatRelativeTime = (ts: number): string => {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return new Date(ts).toLocaleDateString()
}

const ConversationMessage = ({ message }: { message: Message }) => {
  const isUser = message.role === 'user'
  const name = isUser ? 'You' : (message.agentId ?? 'Agent')
  const color = isUser ? 'rgb(198,162,118)' : getAgentColor(message.agentId ?? '')
  const initial = isUser ? 'U' : getInitial(message.agentId ?? 'A')

  return (
    <div className="flex gap-2.5">
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0 mt-0.5"
        style={{ background: `${color}22`, color }}
      >
        {initial}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-xs font-semibold text-text-primary">{name}</span>
          <span className="text-[10px] text-text-muted">{formatRelativeTime(message.timestamp)}</span>
        </div>
        {isUser ? (
          <div className="text-[13px] leading-relaxed whitespace-pre-wrap break-words bg-bg-secondary border border-border-subtle rounded-[10px] px-3.5 py-2.5 text-text-primary">
            {message.content}
          </div>
        ) : (
          <div className="text-[13px] leading-relaxed break-words text-text-secondary mobile-md">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                code: ({ children, className }) => {
                  const isBlock = className?.includes('language-')
                  if (isBlock) {
                    return (
                      <pre className="my-2 rounded-md bg-bg-input border border-border-subtle p-3 overflow-x-auto text-xs">
                        <code className="text-accent-purple font-mono">{children}</code>
                      </pre>
                    )
                  }
                  return (
                    <code className="bg-[rgba(99,102,241,0.1)] px-1 py-px rounded text-xs font-mono text-accent-purple">
                      {children}
                    </code>
                  )
                },
                pre: ({ children }) => <>{children}</>,
                ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
                li: ({ children }) => <li className="text-text-secondary">{children}</li>,
                h1: ({ children }) => <h1 className="text-sm font-bold text-text-primary mb-1.5 mt-2">{children}</h1>,
                h2: ({ children }) => <h2 className="text-sm font-semibold text-text-primary mb-1 mt-2">{children}</h2>,
                h3: ({ children }) => <h3 className="text-[13px] font-semibold text-text-primary mb-1 mt-1.5">{children}</h3>,
                strong: ({ children }) => <strong className="font-semibold text-text-primary">{children}</strong>,
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent-brand underline">{children}</a>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="border-l-2 border-accent-brand/40 pl-3 my-2 text-text-muted italic">{children}</blockquote>
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  )
}

export default MobileMissionDetail
