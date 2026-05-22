/**
 * ChatCompletionSummary —
 *  GET /api/chats/:chatId/token-usage
 */

import { useEffect, useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatTokens } from '@/utils/format'
import { API_BASE, authFetch } from '@/config/api'

interface TokenUsageRecord {
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
  costUsd: number
  turnCount: number
}

interface ChatCompletionSummaryProps {
  chatId: string
  className?: string
}

const ChatCompletionSummary = ({ chatId, className }: ChatCompletionSummaryProps) => {
  const [records, setRecords] = useState<TokenUsageRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    authFetch(`${API_BASE}/api/chats/${chatId}/token-usage`)
      .then((res) => res.json())
      .then((data: TokenUsageRecord[]) => {
        if (!cancelled) {
          setRecords(data)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [chatId])

  if (loading || records.length === 0) return null

  const totalInput = records.reduce((acc, r) => acc + r.inputTokens, 0)
  const totalOutput = records.reduce((acc, r) => acc + r.outputTokens, 0)
  const totalCost = records.reduce((acc, r) => acc + r.costUsd, 0)
  const totalTurns = records.reduce((acc, r) => acc + r.turnCount, 0)

  return (
    <div className={cn(
      'mx-4 my-2 rounded-lg border border-border-subtle',
      'bg-bg-hover-subtle/30 p-3',
      className,
    )}>
      {/* Header */}
      <div className="flex items-center gap-1.5 mb-2">
        <BarChart3 size={12} className="text-text-secondary" />
        <span className="text-xs font-medium text-text-secondary">Token Usage Summary</span>
        <span className="flex-1" />
        <span className="text-xs text-text-secondary">{totalTurns} turns</span>
      </div>

      {/* Table */}
      <div className="text-xs">
        {/* Header row */}
        <div className="flex items-center gap-2 pb-1 mb-1 border-b border-border-subtle/40 text-text-secondary">
          <span className="flex-1">Model</span>
          <span className="w-16 text-right">Input</span>
          <span className="w-16 text-right">Output</span>
          <span className="w-16 text-right">Cache</span>
          <span className="w-16 text-right">Cost</span>
        </div>

        {/* Data rows */}
        {records.map((r) => (
          <div key={r.model} className="flex items-center gap-2 py-0.5 text-text-secondary">
            <span className="flex-1 truncate">{r.model}</span>
            <span className="w-16 text-right font-mono">{formatTokens(r.inputTokens)}</span>
            <span className="w-16 text-right font-mono">{formatTokens(r.outputTokens)}</span>
            <span className="w-16 text-right font-mono opacity-60">
              {r.cacheReadInputTokens > 0 ? formatTokens(r.cacheReadInputTokens) : '-'}
            </span>
            <span className="w-16 text-right font-mono">${r.costUsd.toFixed(4)}</span>
          </div>
        ))}

        {/* Total row */}
        {records.length > 1 && (
          <div className="flex items-center gap-2 pt-1 mt-1 border-t border-border-subtle/40 text-text-emphasis font-medium">
            <span className="flex-1">Total</span>
            <span className="w-16 text-right font-mono">{formatTokens(totalInput)}</span>
            <span className="w-16 text-right font-mono">{formatTokens(totalOutput)}</span>
            <span className="w-16 text-right font-mono opacity-60">-</span>
            <span className="w-16 text-right font-mono">${totalCost.toFixed(4)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default ChatCompletionSummary
