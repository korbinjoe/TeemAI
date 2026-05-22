/**
 * WorkspaceTokenUsage —  Token
 *  7d / 30d / all
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatTokens } from '@/utils/format'
import { API_BASE, authFetch } from '@/config/api'

interface ModelSummary {
  model: string
  totalInput: number
  totalOutput: number
  totalCacheRead: number
  totalCacheCreation: number
  totalCost: number
  chatCount: number
}

type TimeRange = '7d' | '30d' | 'all'

const TIME_RANGE_KEYS: { value: TimeRange; labelKey: string }[] = [
  { value: '7d', labelKey: 'tokenUsage.days7' },
  { value: '30d', labelKey: 'tokenUsage.days30' },
  { value: 'all', labelKey: 'tokenUsage.all' },
]

const sinceFromRange = (range: TimeRange): string | undefined => {
  if (range === 'all') return undefined
  const days = range === '7d' ? 7 : 30
  return new Date(Date.now() - days * 86400000).toISOString()
}

interface WorkspaceTokenUsageProps {
  workspaceId: string
  className?: string
}

const WorkspaceTokenUsage = ({ workspaceId, className }: WorkspaceTokenUsageProps) => {
  const { t } = useTranslation('workspace')
  const [range, setRange] = useState<TimeRange>('7d')
  const [data, setData] = useState<ModelSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    const since = sinceFromRange(range)
    const qs = since ? `?since=${encodeURIComponent(since)}` : ''

    authFetch(`${API_BASE}/api/workspaces/${workspaceId}/token-usage${qs}`)
      .then((res) => res.ok ? res.json() : [])
      .then((rows: unknown) => {
        if (!cancelled) {
          setData(Array.isArray(rows) ? rows : [])
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [workspaceId, range])

  const totalInput = data.reduce((acc, r) => acc + r.totalInput, 0)
  const totalOutput = data.reduce((acc, r) => acc + r.totalOutput, 0)
  const totalCost = data.reduce((acc, r) => acc + r.totalCost, 0)
  const totalChats = data.reduce((acc, r) => acc + r.chatCount, 0)

  return (
    <div className={cn('border border-border rounded-md mb-5', className)}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-border-subtle/40">
        <BarChart3 size={13} className="text-text-secondary shrink-0" />
        <span className="text-xs font-semibold text-text-emphasis">{t('tokenUsage.title')}</span>
        <span className="flex-1" />
        <div className="flex gap-0.5">
          {TIME_RANGE_KEYS.map((tr) => (
            <button
              key={tr.value}
              type="button"
              onClick={() => setRange(tr.value)}
              className={cn(
                'px-2 py-0.5 rounded text-xs border-none cursor-pointer transition-colors',
                range === tr.value
                  ? 'bg-accent-brand/10 text-accent-brand font-medium'
                  : 'bg-transparent text-text-secondary hover:text-text-secondary',
              )}
              tabIndex={0}
              aria-label={t(tr.labelKey)}
            >
              {t(tr.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="px-3.5 py-2.5">
        {loading ? (
          <div className="text-xs text-text-secondary py-3 text-center">{t('tokenUsage.loading')}</div>
        ) : data.length === 0 ? (
          <div className="text-xs text-text-secondary py-3 text-center">{t('tokenUsage.noData')}</div>
        ) : (
          <div className="text-xs">
            {/* Summary */}
            <div className="flex gap-4 mb-2 text-xs text-text-secondary">
              <span>{t('tokenUsage.chats', { count: totalChats })}</span>
              <span>{formatTokens(totalInput)} input / {formatTokens(totalOutput)} output</span>
              {totalCost > 0 && <span className="font-mono">${totalCost.toFixed(4)}</span>}
            </div>

            {/* Table header */}
            <div className="flex items-center gap-2 pb-1 mb-1 border-b border-border-subtle/40 text-xs text-text-secondary">
              <span className="flex-1">{t('tokenUsage.model')}</span>
              <span className="w-14 text-right">Input</span>
              <span className="w-14 text-right">Output</span>
              <span className="w-14 text-right">Cache↓</span>
              <span className="w-14 text-right">Cache↑</span>
              <span className="w-14 text-right">{t('tokenUsage.cost')}</span>
              <span className="w-10 text-right">{t('tokenUsage.conversations')}</span>
            </div>

            {/* Rows */}
            {data.map((r) => (
              <div key={r.model} className="flex items-center gap-2 py-0.5 text-text-secondary">
                <span className="flex-1 truncate">{r.model}</span>
                <span className="w-14 text-right font-mono">{formatTokens(r.totalInput)}</span>
                <span className="w-14 text-right font-mono">{formatTokens(r.totalOutput)}</span>
                <span className="w-14 text-right font-mono opacity-60">{formatTokens(r.totalCacheRead || 0)}</span>
                <span className="w-14 text-right font-mono opacity-60">{formatTokens(r.totalCacheCreation || 0)}</span>
                <span className="w-14 text-right font-mono">${r.totalCost.toFixed(4)}</span>
                <span className="w-10 text-right">{r.chatCount}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default WorkspaceTokenUsage
