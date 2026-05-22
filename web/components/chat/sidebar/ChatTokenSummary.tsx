/**
 * ChatTokenSummary —  Token
 *  AgentActivityPanel  WS expert:activity  modelUsage
 */

import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AgentActivity, ModelUsageSnapshot } from '@/types/chat'
import { formatTokens } from '@/utils/format'

interface ChatTokenSummaryProps {
  expertActivities: Record<string, AgentActivity>
  dbSnapshot?: { totalCost?: number; totalTokens?: { input: number; output: number; cacheRead?: number; cacheCreation?: number } } | null
  className?: string
}

/**  Expert  modelUsage model  */
const aggregateModelUsage = (expertActivities: Record<string, AgentActivity>): ModelUsageSnapshot[] => {
  const map = new Map<string, ModelUsageSnapshot>()

  for (const activity of Object.values(expertActivities)) {
    if (!activity.modelUsage) continue
    for (const usage of activity.modelUsage) {
      const existing = map.get(usage.model)
      if (existing) {
        existing.inputTokens += usage.inputTokens
        existing.outputTokens += usage.outputTokens
        existing.cacheReadInputTokens += usage.cacheReadInputTokens
        existing.cacheCreationInputTokens += usage.cacheCreationInputTokens
        existing.costUsd += usage.costUsd
      } else {
        map.set(usage.model, { ...usage })
      }
    }
  }

  return Array.from(map.values())
}

const ChatTokenSummary = ({ expertActivities, dbSnapshot, className }: ChatTokenSummaryProps) => {
  const [expanded, setExpanded] = useState(false)

  const modelUsages = useMemo(
    () => aggregateModelUsage(expertActivities),
    [expertActivities],
  )

  const hasActivity = modelUsages.length > 0
  const totalInput = hasActivity
    ? modelUsages.reduce((acc, u) => acc + u.inputTokens, 0)
    : (dbSnapshot?.totalTokens?.input ?? 0)
  const totalOutput = hasActivity
    ? modelUsages.reduce((acc, u) => acc + u.outputTokens, 0)
    : (dbSnapshot?.totalTokens?.output ?? 0)
  const totalCacheRead = hasActivity
    ? modelUsages.reduce((acc, u) => acc + u.cacheReadInputTokens, 0)
    : (dbSnapshot?.totalTokens?.cacheRead ?? 0)
  const totalCacheCreation = hasActivity
    ? modelUsages.reduce((acc, u) => acc + u.cacheCreationInputTokens, 0)
    : (dbSnapshot?.totalTokens?.cacheCreation ?? 0)
  const totalCost = hasActivity
    ? modelUsages.reduce((acc, u) => acc + u.costUsd, 0)
    : (dbSnapshot?.totalCost ?? 0)

  if (totalInput === 0 && totalOutput === 0 && totalCacheRead === 0 && totalCacheCreation === 0) return null

  return (
    <div className={cn('shrink-0 border-t border-border-subtle/40 px-3', className)}>
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex items-center gap-1.5 w-full py-0.5 text-left bg-transparent border-none cursor-pointer"
        tabIndex={0}
        aria-label="Toggle token usage details"
        aria-expanded={expanded}
      >
        {expanded ? <ChevronDown size={9} className="text-text-muted" /> : <ChevronRight size={9} className="text-text-muted" />}
        <Zap size={9} className="text-text-muted" />
        <span className="text-xs text-text-muted font-mono">
          {formatTokens(totalInput)} in
        </span>
        <span className="text-xs text-text-muted font-mono">
          {formatTokens(totalOutput)} out
        </span>
        {totalCacheRead > 0 && (
          <span className="text-xs text-text-muted font-mono opacity-60">
            {formatTokens(totalCacheRead)} cache↓
          </span>
        )}
        {totalCacheCreation > 0 && (
          <span className="text-xs text-text-muted font-mono opacity-60">
            {formatTokens(totalCacheCreation)} cache↑
          </span>
        )}
        {totalCost > 0 && (
          <span className="text-xs text-text-muted font-mono">
            ${totalCost.toFixed(4)}
          </span>
        )}
      </button>

      {expanded && (
        <div className="pb-1.5 pl-5">
          {/* Summary row */}
          <div className="flex items-center gap-3 py-0.5 text-xs text-text-secondary border-b border-border-subtle/30 mb-0.5 pb-1">
            <span className="text-text-muted">Total</span>
            <span className="flex-1" />
            <span className="font-mono">{formatTokens(totalInput)} in</span>
            <span className="font-mono">{formatTokens(totalOutput)} out</span>
            {totalCacheRead > 0 && (
              <span className="font-mono opacity-60">{formatTokens(totalCacheRead)} cache↓</span>
            )}
            {totalCacheCreation > 0 && (
              <span className="font-mono opacity-60">{formatTokens(totalCacheCreation)} cache↑</span>
            )}
          </div>
          {modelUsages.map((usage) => (
            <div key={usage.model} className="flex items-center gap-3 py-0.5 text-xs text-text-muted">
              <span className="truncate max-w-[140px]">{usage.model}</span>
              <span className="flex-1" />
              <span className="font-mono">{formatTokens(usage.inputTokens)} in</span>
              <span className="font-mono">{formatTokens(usage.outputTokens)} out</span>
              {usage.cacheReadInputTokens > 0 && (
                <span className="font-mono opacity-60">{formatTokens(usage.cacheReadInputTokens)} cache</span>
              )}
              {usage.costUsd > 0 && (
                <span className="font-mono">${usage.costUsd.toFixed(4)}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default ChatTokenSummary
