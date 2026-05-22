import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { DevJsonlMessage } from '@/hooks/useDevPanel'

const fmtTime = (ts: number | null) => {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleTimeString('zh-CN', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0')
}

const truncate = (s: string, max: number) =>
  s.length > max ? s.slice(0, max) + '…' : s

const msgTypeColor = (type: string) => {
  switch (type) {
    case 'text': return 'text-zinc-300'
    case 'toolUse': return 'text-blue-400'
    case 'toolResult': return 'text-cyan-400'
    case 'thinking': return 'text-purple-400'
    case 'stats': return 'text-yellow-400'
    default: return 'text-zinc-400'
  }
}

const msgRoleBg = (role: string) =>
  role === 'user' ? 'border-l-green-500' : 'border-l-blue-500'

const KV = ({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) => (
  <div className="flex items-start justify-between gap-2 py-0.5">
    <span className="text-zinc-500 text-xs shrink-0">{label}</span>
    <span className={cn('text-xs text-right break-all', mono && 'font-mono')}>{value}</span>
  </div>
)

const JsonlMessageRow = ({ msg, expanded, onToggle }: {
  msg: DevJsonlMessage
  expanded: boolean
  onToggle: () => void
}) => (
  <div className={cn('border-l-2 border-b border-zinc-800/50', msgRoleBg(msg.role))}>
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-1 px-2 py-0.5 text-[10px] hover:bg-zinc-800/30"
    >
      <span className="text-zinc-600 font-mono shrink-0 w-[52px]">{fmtTime(msg.timestamp)}</span>
      <span className={cn('font-medium shrink-0 w-[14px]', msg.role === 'user' ? 'text-green-400' : 'text-blue-400')}>
        {msg.role === 'user' ? 'U' : 'A'}
      </span>
      <span className={cn('shrink-0 w-[60px]', msgTypeColor(msg.type))}>{msg.type}</span>
      {msg.turnIndex !== undefined && (
        <span className="text-zinc-600 shrink-0">T{msg.turnIndex}</span>
      )}
      <span className="text-zinc-400 truncate text-left flex-1 ml-1">
        {msg.type === 'toolUse' && msg.toolUse
          ? msg.toolUse.toolName
          : msg.type === 'toolResult' && msg.toolResult
            ? truncate(msg.toolResult.content, 40)
            : msg.type === 'stats' && msg.stats
              ? `$${msg.stats.costUsd?.toFixed(4) ?? '—'} in:${msg.stats.inputTokens ?? '—'} out:${msg.stats.outputTokens ?? '—'}`
              : truncate(msg.content, 60)}
      </span>
    </button>
    {expanded && (
      <div className="px-3 py-1.5 bg-zinc-900/80">
        {msg.type === 'toolUse' && msg.toolUse && (
          <div className="space-y-0.5">
            <KV label="toolName" value={msg.toolUse.toolName} />
            <KV label="toolId" value={msg.toolUse.toolId} mono />
            <div className="text-[10px] text-zinc-500 mt-1">Input:</div>
            <pre className="text-[9px] font-mono text-zinc-400 bg-zinc-900 rounded p-1.5 overflow-x-auto max-h-[200px] overflow-y-auto whitespace-pre-wrap break-all">
              {msg.toolUse.input}
            </pre>
          </div>
        )}
        {msg.type === 'toolResult' && msg.toolResult && (
          <div className="space-y-0.5">
            <KV label="toolUseId" value={msg.toolResult.toolUseId} mono />
            {msg.toolResult.isError && <KV label="isError" value={<span className="text-red-400">true</span>} />}
            <pre className="text-[9px] font-mono text-zinc-400 bg-zinc-900 rounded p-1.5 overflow-x-auto max-h-[200px] overflow-y-auto whitespace-pre-wrap break-all">
              {msg.toolResult.content}
            </pre>
          </div>
        )}
        {msg.type === 'stats' && msg.stats && (
          <div className="space-y-0.5">
            <KV label="cost" value={`$${msg.stats.costUsd?.toFixed(4) ?? '—'}`} />
            <KV label="input tokens" value={msg.stats.inputTokens ?? '—'} />
            <KV label="output tokens" value={msg.stats.outputTokens ?? '—'} />
          </div>
        )}
        {(msg.type === 'text' || msg.type === 'thinking') && (
          <pre className="text-[9px] font-mono text-zinc-400 bg-zinc-900 rounded p-1.5 overflow-x-auto max-h-[300px] overflow-y-auto whitespace-pre-wrap break-all">
            {msg.content}
          </pre>
        )}
        {msg.model && <KV label="model" value={msg.model} />}
      </div>
    )}
  </div>
)

const FILTER_OPTIONS = ['', 'user', 'agent', 'text', 'toolUse', 'toolResult', 'thinking', 'stats']

export const DevJsonlViewer = ({ messages }: {
  messages: DevJsonlMessage[]
}) => {
  const { t } = useTranslation('chat')
  const [filter, setFilter] = useState<string>('')
  const [expandedMsgId, setExpandedMsgId] = useState<string | null>(null)

  if (messages.length === 0) {
    return (
      <div className="text-xs text-zinc-600 italic py-2 text-center">WaitingMessage...</div>
    )
  }

  const filtered = filter
    ? messages.filter((m) => m.type === filter || m.role === filter)
    : messages

  const reversed = [...filtered].reverse()

  return (
    <div className="mt-1 border border-zinc-700 rounded bg-zinc-900/50">
      <div className="flex items-center justify-between px-2 py-1 border-b border-zinc-800">
        <span className="text-[10px] text-zinc-400">
          {t('dev.messages', { count: messages.length })}
        </span>
        <span className="text-[9px] text-zinc-600">{t('dev.newestFirst')}</span>
      </div>
      <div className="flex flex-wrap gap-1 px-2 py-1 border-b border-zinc-800">
        {FILTER_OPTIONS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-1.5 py-0.5 text-[9px] rounded',
              filter === f
                ? 'bg-zinc-600 text-zinc-200'
                : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300',
            )}
          >
            {f || 'all'}
          </button>
        ))}
      </div>
      <div className="max-h-[400px] overflow-y-auto">
        {reversed.length === 0 ? (
          <div className="text-xs text-zinc-600 italic py-2 text-center">{t('dev.noMatch')}</div>
        ) : (
          reversed.map((msg) => (
            <JsonlMessageRow
              key={msg.id}
              msg={msg}
              expanded={expandedMsgId === msg.id}
              onToggle={() => setExpandedMsgId(expandedMsgId === msg.id ? null : msg.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}
