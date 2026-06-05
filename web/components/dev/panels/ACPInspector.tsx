import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { fmtTime, acpStateColor } from './helpers'
import { isSuppressedUpdate } from '@shared/acp-suppression'

export const ACPStateTag = ({ state }: { state: string }) => (
  <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', acpStateColor(state))}>
    {state}
  </span>
)

export const ACPPromptLive = ({ startedAt }: { startedAt: number | null }) => {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!startedAt) return
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 100) / 10), 200)
    return () => clearInterval(timer)
  }, [startedAt])
  return (
    <span className="text-yellow-400 font-mono text-[10px]">
      <span className="animate-pulse">●</span> IN FLIGHT ({elapsed}s)
    </span>
  )
}

const acpUpdateTypeColor = (type: string) => {
  if (type.startsWith('session/')) return 'text-blue-400'
  if (type === 'tool_call' || type === 'tool_result') return 'text-cyan-400'
  if (type === 'agent_message_chunk') return 'text-green-400'
  if (type === 'session_info_update') return 'text-yellow-400'
  if (type.startsWith('_teemai/')) return 'text-purple-400'
  if (type === 'initialize') return 'text-blue-300'
  return 'text-zinc-400'
}

interface BatchedMessage {
  id: string
  role: 'user' | 'agent'
  content: string
  timestamp: number
  type: 'text' | 'toolUse' | 'toolResult' | 'thinking' | 'stats'
  toolUse?: { toolName: string; toolId: string; input: string; status: string }
  toolResult?: { toolUseId: string; content: string; isError?: boolean }
  stats?: { costUsd?: number; inputTokens?: number; outputTokens?: number; cacheReadInputTokens?: number; cacheCreationInputTokens?: number; numTurns?: number }
  thinkingSummary?: string
  model?: string
  turnIndex?: number
}

const msgRoleColor = (role: string) =>
  role === 'user' ? 'text-blue-300' : 'text-emerald-300'

const msgTypeColor = (type: string) => {
  switch (type) {
    case 'toolUse': return 'text-cyan-400'
    case 'toolResult': return 'text-cyan-300'
    case 'thinking': return 'text-violet-300'
    case 'stats': return 'text-amber-300'
    default: return 'text-zinc-300'
  }
}

const msgPreview = (m: BatchedMessage): string => {
  if (m.type === 'toolUse' && m.toolUse) {
    const inp = m.toolUse.input.replace(/\s+/g, ' ').slice(0, 60)
    return `${m.toolUse.toolName}(${inp}${m.toolUse.input.length > 60 ? '…' : ''}) [${m.toolUse.status}]`
  }
  if (m.type === 'toolResult' && m.toolResult) {
    const flag = m.toolResult.isError ? '✗' : '✓'
    const c = m.toolResult.content.replace(/\s+/g, ' ').slice(0, 80)
    return `${flag} ${c}${m.toolResult.content.length > 80 ? '…' : ''}`
  }
  if (m.type === 'thinking') {
    const t = m.thinkingSummary ?? m.content
    return t.replace(/\s+/g, ' ').slice(0, 100)
  }
  if (m.type === 'stats' && m.stats) {
    const { inputTokens = 0, outputTokens = 0, cacheReadInputTokens = 0, costUsd = 0, numTurns } = m.stats
    return `in:${inputTokens} out:${outputTokens} cache:${cacheReadInputTokens} $${costUsd.toFixed(4)}${numTurns != null ? ` turns:${numTurns}` : ''}`
  }
  return (m.content ?? '').replace(/\s+/g, ' ').slice(0, 100)
}

const BatchedMessageRow = ({ m }: { m: BatchedMessage }) => {
  const [open, setOpen] = useState(false)
  const detail =
    m.type === 'toolUse' ? m.toolUse?.input :
    m.type === 'toolResult' ? m.toolResult?.content :
    m.type === 'stats' ? JSON.stringify(m.stats, null, 2) :
    m.content
  const hasDetail = !!detail && detail.length > 0
  return (
    <div className="border-b border-zinc-800/30">
      <button
        onClick={() => hasDetail && setOpen(!open)}
        className={cn('w-full flex items-center gap-1 px-1.5 py-0.5 text-[10px] hover:bg-zinc-800/30', hasDetail && 'cursor-pointer')}
      >
        <span className="text-zinc-600 font-mono shrink-0 w-[52px]">{fmtTime(m.timestamp)}</span>
        <span className={cn('shrink-0 w-[36px] font-medium', msgRoleColor(m.role))}>{m.role}</span>
        <span className={cn('shrink-0 font-medium', msgTypeColor(m.type))}>{m.type}</span>
        <span className="text-zinc-400 truncate ml-1">{msgPreview(m)}</span>
        {hasDetail && (
          <span className="ml-auto text-zinc-600 shrink-0">{open ? '▼' : '▶'}</span>
        )}
      </button>
      {open && hasDetail && (
        <pre className="text-[9px] font-mono text-zinc-400 bg-zinc-950/50 px-2 py-1 mx-1 mb-1 rounded overflow-x-auto max-h-[260px] overflow-y-auto whitespace-pre-wrap break-all">
          {detail}
        </pre>
      )}
    </div>
  )
}

const MessagesBatchView = ({ data }: { data: unknown }) => {
  const { t } = useTranslation('chat')
  const d = data as { messages?: BatchedMessage[]; replacedStatsId?: string | null; batchType?: 'full' | 'delta' } | null
  const list = Array.isArray(d?.messages) ? d.messages : []
  const sorted = [...list].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
  if (sorted.length === 0) {
    return <div className="text-[10px] text-zinc-600 italic py-2 text-center">{t('dev.noMessages')}</div>
  }
  return (
    <div className="bg-zinc-950/50 mx-1 mb-1 rounded overflow-hidden">
      <div className="flex items-center gap-2 px-2 py-1 text-[9px] text-zinc-500 border-b border-zinc-800/50">
        <span>{t('dev.total', { count: sorted.length })}</span>
        {d?.batchType && <span className="text-purple-300/70">batchType={d.batchType}</span>}
        {d?.replacedStatsId && <span className="text-amber-400/70">replaced={d.replacedStatsId.slice(0, 8)}…</span>}
      </div>
      <div className="max-h-[300px] overflow-y-auto">
        {sorted.map((m, i) => <BatchedMessageRow key={`${m.id}-${i}`} m={m} />)}
      </div>
    </div>
  )
}

export const ACPUpdateRow = ({ update }: { update: { ts: number; type: string; summary: string; dir: 'out' | 'in'; data?: unknown } }) => {
  const [showData, setShowData] = useState(false)
  const hasData = update.data != null
  const isMessagesBatch = update.type === '_teemai/messages_batch'
  const [tab, setTab] = useState<'list' | 'json'>(isMessagesBatch ? 'list' : 'json')
  return (
    <div className="border-b border-zinc-800/30">
      <button
        onClick={() => hasData && setShowData(!showData)}
        className={cn('w-full flex items-center gap-1 px-1.5 py-0.5 text-[10px] hover:bg-zinc-800/30', hasData && 'cursor-pointer')}
      >
        <span className="text-zinc-600 font-mono shrink-0 w-[52px]">{fmtTime(update.ts)}</span>
        <span className={cn('shrink-0 w-[10px] font-bold', update.dir === 'in' ? 'text-blue-500' : 'text-green-500')}>
          {update.dir === 'in' ? '→' : '←'}
        </span>
        <span className={cn('shrink-0 font-medium', acpUpdateTypeColor(update.type))}>
          {update.type}
        </span>
        <span className="text-zinc-500 truncate ml-1">{update.summary}</span>
        {hasData && (
          <span className="ml-auto text-zinc-600 shrink-0">{showData ? '▼' : '▶'}</span>
        )}
      </button>
      {showData && hasData && (
        isMessagesBatch ? (
          <div className="mt-0.5">
            <div className="flex items-center gap-1 px-1.5 pb-1">
              <button
                onClick={(e) => { e.stopPropagation(); setTab('list') }}
                className={cn(
                  'text-[10px] px-2 py-0.5 rounded border',
                  tab === 'list'
                    ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                    : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300',
                )}
              >
                MessageList
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setTab('json') }}
                className={cn(
                  'text-[10px] px-2 py-0.5 rounded border',
                  tab === 'json'
                    ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                    : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300',
                )}
              >
                JSON
              </button>
            </div>
            {tab === 'list' ? (
              <MessagesBatchView data={update.data} />
            ) : (
              <pre className="text-[9px] font-mono text-zinc-400 bg-zinc-950/50 px-2 py-1 mx-1 mb-1 rounded overflow-x-auto max-h-[300px] overflow-y-auto whitespace-pre-wrap break-all">
                {JSON.stringify(update.data, null, 2)}
              </pre>
            )}
          </div>
        ) : (
          <pre className="text-[9px] font-mono text-zinc-400 bg-zinc-950/50 px-2 py-1 mx-1 mb-1 rounded overflow-x-auto max-h-[300px] overflow-y-auto whitespace-pre-wrap break-all">
            {JSON.stringify(update.data, null, 2)}
          </pre>
        )
      )}
    </div>
  )
}

export const ACPUpdateList = ({
  updates,
  totalUpdateCount,
  showAllProtocol,
  onToggleShowAll,
}: {
  updates: Array<{ ts: number; type: string; summary: string; dir: 'out' | 'in'; data?: unknown }>
  totalUpdateCount: number
  showAllProtocol: boolean
  onToggleShowAll: (value: boolean) => void
}) => {
  const { t } = useTranslation('chat')
  const [expanded, setExpanded] = useState(false)
  const [filter, setFilter] = useState('')

  const textFiltered = filter
    ? updates.filter(u => u.type.includes(filter) || u.summary.includes(filter))
    : updates

  const protocolFiltered = showAllProtocol
    ? textFiltered
    : textFiltered.filter(u => !isSuppressedUpdate(u.type))

  const display = expanded
    ? protocolFiltered
    : protocolFiltered.filter(u => u.type !== '_teemai/activity').slice(0, 20)

  const suppressedCount = textFiltered.length - protocolFiltered.length
  const isBufferTruncated = totalUpdateCount > updates.length

  return (
    <div className="mt-1.5">
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] font-medium text-purple-400/70 uppercase tracking-wider hover:text-purple-300 flex items-center gap-1"
        >
          ACP MESSAGES (
          <span>{totalUpdateCount}</span>
          {isBufferTruncated && <span className="text-zinc-500"> · {t('dev.recentCacheOnly', { count: updates.length })}</span>}
          {!showAllProtocol && suppressedCount > 0 && <span className="text-zinc-500"> · -{suppressedCount}</span>}
          )
          <span className="text-zinc-600">{expanded ? '▼' : '▶'}</span>
        </button>
        <label className="flex items-center gap-1 text-[10px] text-zinc-500 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showAllProtocol}
            onChange={(e) => onToggleShowAll(e.target.checked)}
            className="cursor-pointer"
          />
          show all protocol updates
        </label>
      </div>
      {expanded && (
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter type/summary..."
          className="w-full mt-1 bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-[10px] text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-zinc-500"
        />
      )}
      <div className={cn('mt-1 border border-zinc-800 rounded bg-zinc-900/50 overflow-y-auto', expanded ? 'max-h-[400px]' : 'max-h-[200px]')}>
        {display.length === 0 ? (
          <div className="text-[10px] text-zinc-600 italic py-2 text-center">{t('dev.noMessages')}</div>
        ) : (
          display.map((u, i) => (
            <ACPUpdateRow key={`${u.ts}-${i}`} update={u} />
          ))
        )}
      </div>
      {!expanded && protocolFiltered.length > display.length && (
        <button
          onClick={() => setExpanded(true)}
          className="text-[9px] text-zinc-500 hover:text-zinc-300 mt-0.5"
        >
          Expand all ({protocolFiltered.length} total, activity hidden)
        </button>
      )}
    </div>
  )
}
