/**
 * DailyTokenOverview —
 *  7  Token
 */

import { useEffect, useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Zap, RefreshCw } from 'lucide-react'
import { formatTokens } from '@/utils/format'
import { API_BASE, authFetch } from '@/config/api'

interface DailySummary {
  date: string
  model: string
  totalInput: number
  totalOutput: number
  totalCacheRead: number
  totalCacheCreation: number
  totalCost: number
}

const aggregateByDate = (rows: DailySummary[]) => {
  const map = new Map<string, { input: number; output: number; cacheRead: number; cacheCreation: number; cost: number }>()
  for (const r of rows) {
    const existing = map.get(r.date) || { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, cost: 0 }
    existing.input += r.totalInput
    existing.output += r.totalOutput
    existing.cacheRead += r.totalCacheRead || 0
    existing.cacheCreation += r.totalCacheCreation || 0
    existing.cost += r.totalCost
    map.set(r.date, existing)
  }
  return Array.from(map.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

const DailyTokenOverview = () => {
  const { t } = useTranslation('workspace')
  const [data, setData] = useState<DailySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const loadData = useCallback(() => {
    setLoading(true)
    setError(false)
    let cancelled = false
    authFetch(`${API_BASE}/api/token-usage/daily?days=7`)
      .then((res) => res.json())
      .then((rows: DailySummary[]) => {
        if (!cancelled) {
          setData(rows)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true)
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => loadData(), [loadData])

  // Loading skeleton
  if (loading) {
    return (
      <div className="rounded-lg border border-border p-4">
        <div className="flex items-center gap-1.5 mb-3">
          <Zap size={13} className="text-text-secondary" />
          <span className="text-sm font-semibold text-text-emphasis">Last 7 days usage</span>
        </div>
        <div className="flex items-end gap-1 h-6">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex-1 rounded-sm bg-bg-hover-muted animate-pulse" style={{ height: `${20 + Math.random() * 60}%` }} />
          ))}
        </div>
        <div className="flex gap-1 mt-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex-1 h-3 bg-bg-hover-muted rounded animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="rounded-lg border border-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Zap size={13} className="text-text-secondary" />
            <span className="text-sm font-semibold text-text-emphasis">Last 7 days usage</span>
          </div>
          <button onClick={loadData} className="flex items-center gap-1 text-xs text-text-secondary hover:text-accent-brand transition-colors">
            <RefreshCw size={11} />
            Retry
          </button>
        </div>
        <div className="text-xs text-text-muted mt-2">{t('ide.dataLoadFailed')}</div>
      </div>
    )
  }

  // Empty state
  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-border p-4">
        <div className="flex items-center gap-1.5 mb-2">
          <Zap size={13} className="text-text-secondary" />
          <span className="text-sm font-semibold text-text-emphasis">Last 7 days usage</span>
        </div>
        <div className="text-xs text-text-muted">{t('tokenUsage.noData')}</div>
      </div>
    )
  }

  const daily = aggregateByDate(data)
  const totalCost = daily.reduce((acc, d) => acc + d.cost, 0)
  const totalInput = daily.reduce((acc, d) => acc + d.input, 0)
  const totalOutput = daily.reduce((acc, d) => acc + d.output, 0)
  const totalCacheRead = daily.reduce((acc, d) => acc + d.cacheRead, 0)
  const totalCacheCreation = daily.reduce((acc, d) => acc + d.cacheCreation, 0)
  const maxTokens = Math.max(...daily.map((d) => d.input + d.output), 1)

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center gap-1.5 mb-3">
        <Zap size={13} className="text-text-secondary" />
        <span className="text-sm font-semibold text-text-emphasis">Last 7 days usage</span>
        <span className="flex-1" />
        <span className="text-xs text-text-secondary font-mono">
          {formatTokens(totalInput)} in / {formatTokens(totalOutput)} out
          {totalCacheRead > 0 && ` / ${formatTokens(totalCacheRead)} cache↓`}
          {totalCacheCreation > 0 && ` / ${formatTokens(totalCacheCreation)} cache↑`}
          {totalCost > 0 && ` · $${totalCost.toFixed(2)}`}
        </span>
      </div>

      {/* Mini bar chart */}
      <BarChart daily={daily} maxTokens={maxTokens} />
    </div>
  )
}

interface DayData {
  date: string
  input: number
  output: number
  cacheRead: number
  cacheCreation: number
  cost: number
}

const BarChart = ({ daily, maxTokens }: { daily: DayData[]; maxTokens: number }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  return (
    <div className="relative">
      {/* Bars */}
      <div ref={containerRef} className="flex items-end gap-1 h-6">
        {daily.map((d, i) => {
          const total = d.input + d.output
          const height = Math.max((total / maxTokens) * 100, 4)
          const inputPct = total > 0 ? (d.input / total) * 100 : 50
          return (
            <div
              key={d.date}
              className="flex-1 flex flex-col justify-end rounded-sm overflow-hidden cursor-pointer transition-opacity"
              style={{ height: `${height}%`, opacity: hoverIdx !== null && hoverIdx !== i ? 0.4 : 1 }}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
            >
              <div
                className="bg-accent-brand/40 rounded-t-sm"
                style={{ height: `${inputPct}%`, minHeight: 1 }}
              />
              <div
                className="bg-accent-brand/70"
                style={{ height: `${100 - inputPct}%`, minHeight: 1 }}
              />
            </div>
          )
        })}
      </div>

      {/* Date labels */}
      <div className="flex gap-1 mt-1">
        {daily.map((d) => (
          <div key={d.date} className="flex-1 text-center text-xs text-text-secondary truncate">
            {d.date.slice(5)}
          </div>
        ))}
      </div>

      {/* Hover tooltip */}
      {hoverIdx !== null && (
        <DayTooltip
          day={daily[hoverIdx]}
          index={hoverIdx}
          total={daily.length}
          containerRef={containerRef}
        />
      )}
    </div>
  )
}

const DayTooltip = ({ day, index, total, containerRef }: {
  day: DayData
  index: number
  total: number
  containerRef: React.RefObject<HTMLDivElement | null>
}) => {
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number } | null>(null)

  useEffect(() => {
    const container = containerRef.current
    const tooltip = tooltipRef.current
    if (!container || !tooltip) return
    const bars = container.children
    if (!bars[index]) return
    const barRect = (bars[index] as HTMLElement).getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    const tooltipW = tooltip.offsetWidth
    let left = barRect.left - containerRect.left + barRect.width / 2 - tooltipW / 2
    left = Math.max(0, Math.min(left, containerRect.width - tooltipW))
    setPos({ left })
  }, [index, total, containerRef])

  return (
    <div
      ref={tooltipRef}
      className="absolute bottom-full mb-2 z-50 min-w-[180px] rounded-md border border-border bg-bg-elevated shadow-lg p-2.5 text-xs space-y-1"
      style={{ left: pos ? pos.left : 0, opacity: pos ? 1 : 0 }}
    >
      <div className="text-text-secondary font-medium pb-1 border-b border-border-subtle">
        {day.date}
      </div>
      <DetailRow label="Input" value={day.input} />
      <DetailRow label="Output" value={day.output} />
      <DetailRow label="Cache Read" value={day.cacheRead} />
      <DetailRow label="Cache Write" value={day.cacheCreation} />
      {day.cost > 0 && (
        <div className="flex justify-between pt-1 border-t border-border-subtle text-text-primary font-medium">
          <span>Cost</span>
          <span>${day.cost.toFixed(4)}</span>
        </div>
      )}
    </div>
  )
}

const DetailRow = ({ label, value }: { label: string; value: number }) => (
  <div className="flex justify-between text-text-secondary">
    <span>{label}</span>
    <span className="text-text-primary font-mono">{formatTokens(value)}</span>
  </div>
)

export default DailyTokenOverview
