import { useState, useRef } from 'react'
import {
  Activity, Zap, Bell,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import AgentAvatar from '@/components/ui/agent-avatar'
import { formatTokens } from '@/utils/format'
import type { RecentChat } from './types'
import type { HomeStats, TokenDetail } from '@/hooks/useHomeStats'

type TimeRange = 'today' | 'week' | 'month'

const TIME_LABEL_KEYS: Record<TimeRange, string> = {
  today: 'home:stats.today',
  week: 'home:stats.week',
  month: 'home:stats.month',
}

interface StatsBarProps {
  recentChats: RecentChat[]
  stats: HomeStats
}

const StatsBar = ({ recentChats, stats }: StatsBarProps) => {
  const { t } = useTranslation('home')
  const [timeRange, setTimeRange] = useState<TimeRange>('today')

  const runningChats = recentChats.filter((c) => c.status === 'running')
  const idleChats = recentChats.filter((c) => c.status === 'idle')
  const activeCount = runningChats.length + idleChats.length

  const activeAgents = [...new Set(
    [...runningChats, ...idleChats].map((c) => c.primaryAgentId),
  )]

  const tokensByRange: Record<TimeRange, number> = {
    today: stats.todayTokens,
    week: stats.weekTokens,
    month: stats.monthTokens,
  }
  const detailByRange: Record<TimeRange, TokenDetail> = {
    today: stats.todayDetail,
    week: stats.weekDetail,
    month: stats.monthDetail,
  }
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm p-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 pr-3 border-r border-border-subtle">
          <TokenStatChip
            total={tokensByRange[timeRange]}
            detail={detailByRange[timeRange]}
            label={t(TIME_LABEL_KEYS[timeRange])}
          />
          <div className="flex items-center rounded-md border border-border-subtle overflow-hidden">
            {(['today', 'week', 'month'] as TimeRange[]).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                tabIndex={0}
                aria-label={t(TIME_LABEL_KEYS[range])}
                className={cn(
                  'px-2 py-0.5 text-xs transition-colors',
                  timeRange === range
                    ? 'bg-accent-brand/15 text-accent-brand font-medium'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover-subtle',
                )}
              >
                {t(TIME_LABEL_KEYS[range])}
              </button>
            ))}
          </div>
        </div>

        {/* Running */}
        <StatChip
          icon={Activity}
          value={String(activeCount)}
          label={t('stats.running')}
          color={activeCount > 0 ? 'text-accent-green' : 'text-text-secondary'}
          pulse={activeCount > 0}
        />

        {activeAgents.length > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="flex -space-x-1.5">
              {activeAgents.slice(0, 3).map((name) => (
                <AgentAvatar key={name} name={name} agentId={name} size="xs" active />
              ))}
            </div>
            <span className="text-xs text-accent-green font-medium">
              {t('stats.agentsWorking', { count: activeAgents.length })}
            </span>
          </div>
        )}

        {stats.unreadCount > 0 && (
          <StatChip
            icon={Bell}
            value={String(stats.unreadCount)}
            label={t('stats.unread')}
            color="text-accent-red"
            pulse
          />
        )}
      </div>
    </div>
  )
}

const TokenStatChip = ({ total, detail, label }: {
  total: number
  detail: TokenDetail
  label: string
}) => {
  const [open, setOpen] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleEnter = () => {
    clearTimeout(timerRef.current)
    setOpen(true)
  }
  const handleLeave = () => {
    timerRef.current = setTimeout(() => setOpen(false), 150)
  }
  const handleClick = () => {
    setOpen((prev) => !prev)
  }

  return (
    <div
      ref={containerRef}
      className="relative flex items-center gap-1.5"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <button
        onClick={handleClick}
        className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
      >
        <Zap size={13} className="text-accent-brand shrink-0" />
        <span className="text-sm font-semibold text-text-emphasis">{formatTokens(total)}</span>
        <span className="text-xs text-text-secondary">Token</span>
      </button>

      {open && total > 0 && (
        <div className="absolute top-full left-0 mt-1.5 z-50 min-w-[200px] rounded-md border border-border bg-bg-elevated shadow-lg p-3 text-xs space-y-1.5">
          <div className="text-text-secondary font-medium pb-1 border-b border-border-subtle mb-1.5">
            {label} Token
          </div>
          <Row label="Input" value={detail.input} />
          <Row label="Output" value={detail.output} />
          <Row label="Cache Read" value={detail.cacheRead} />
          <Row label="Cache Write" value={detail.cacheCreation} />
          {detail.cost > 0 && (
            <div className="flex justify-between pt-1.5 border-t border-border-subtle text-text-primary font-medium">
              <span>Cost</span>
              <span>${detail.cost.toFixed(4)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const Row = ({ label, value }: { label: string; value: number }) => (
  <div className="flex justify-between text-text-secondary">
    <span>{label}</span>
    <span className="text-text-primary font-mono">{formatTokens(value)}</span>
  </div>
)

const StatChip = ({ icon: Icon, value, label, color, pulse, onClick }: {
  icon: React.ElementType
  value: string
  label: string
  color: string
  pulse?: boolean
  onClick?: () => void
}) => {
  const content = (
    <>
      <Icon size={13} className={cn(color, 'shrink-0', pulse && 'animate-pulse')} />
      <span className="text-sm font-semibold text-text-emphasis">{value}</span>
      <span className="text-xs text-text-secondary">{label}</span>
    </>
  )

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
      >
        {content}
      </button>
    )
  }

  return <div className="flex items-center gap-1.5">{content}</div>
}

export default StatsBar
