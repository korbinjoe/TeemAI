/**
 * EvolutionLog —
 *  Agent
 */

import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Dna, BookOpen, Zap, Trophy } from 'lucide-react'
import type { EvolutionEntry, EvolutionType } from '../../types/team'

interface EvolutionLogProps {
  entries: EvolutionEntry[]
  title?: string
}

const TYPE_META: Record<EvolutionType, {
  icon: typeof Dna
  color: string
  bgColor: string
}> = {
  skill_acquired: {
    icon: Dna,
    color: 'text-accent-green',
    bgColor: 'bg-accent-green/10',
  },
  memory_updated: {
    icon: BookOpen,
    color: 'text-accent-brand',
    bgColor: 'bg-accent-brand/10',
  },
  strategy_evolved: {
    icon: Zap,
    color: 'text-amber-400',
    bgColor: 'bg-amber-400/10',
  },
  milestone: {
    icon: Trophy,
    color: 'text-purple-400',
    bgColor: 'bg-purple-400/10',
  },
}

const EvolutionLog = ({ entries, title }: EvolutionLogProps) => {
  const { t, i18n } = useTranslation('agents')

  const resolvedTitle = title ?? t('evolution.growthTrack')

  const formatDate = (date: Date): string => {
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / 86_400_000)

    if (diffDays === 0) return t('evolution.today')
    if (diffDays === 1) return t('evolution.yesterday')
    if (diffDays < 7) return t('evolution.daysAgo', { count: diffDays })

    return date.toLocaleDateString(i18n.language, { month: 'long', day: 'numeric' })
  }

  const formatTime = (ts: number): string =>
    new Date(ts).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })

  // Group entries by date
  const grouped = groupByDate(entries, formatDate)

  const getTypeLabel = (type: EvolutionType): string => {
    const labelMap: Record<EvolutionType, string> = {
      skill_acquired: t('evolution.newSkill'),
      memory_updated: t('evolution.memoryUpdate'),
      strategy_evolved: t('evolution.strategyEvolved'),
      milestone: t('evolution.milestone'),
    }
    return labelMap[type]
  }

  return (
    <div>
      <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">
        {resolvedTitle}
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-8 text-text-secondary">
          <Dna size={28} className="mx-auto mb-2 opacity-20" />
          <div className="text-xs">{t('evolution.noRecords')}</div>
          <div className="text-xs text-text-muted/60 mt-0.5">
            {t('evolution.noRecordsHint')}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([dateLabel, items]) => (
            <DateGroup
              key={dateLabel}
              dateLabel={dateLabel}
              entries={items}
              getTypeLabel={getTypeLabel}
              formatTime={formatTime}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const DateGroup = ({ dateLabel, entries, getTypeLabel, formatTime }: {
  dateLabel: string
  entries: EvolutionEntry[]
  getTypeLabel: (type: EvolutionType) => string
  formatTime: (ts: number) => string
}) => (
  <div>
    <div className="text-xs text-text-secondary mb-1.5 flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-white/[0.15]" />
      {dateLabel}
    </div>
    <div className="ml-[3px] border-l border-border-subtle pl-3 space-y-2">
      {entries.map((entry) => (
        <EvolutionCard
          key={entry.id}
          entry={entry}
          getTypeLabel={getTypeLabel}
          formatTime={formatTime}
        />
      ))}
    </div>
  </div>
)

const EvolutionCard = ({ entry, getTypeLabel, formatTime }: {
  entry: EvolutionEntry
  getTypeLabel: (type: EvolutionType) => string
  formatTime: (ts: number) => string
}) => {
  const meta = TYPE_META[entry.type]
  const Icon = meta.icon

  return (
    <div className="relative">
      {/* Timeline dot */}
      <span className={cn(
        'absolute -left-[19px] top-2 w-2.5 h-2.5 rounded-full border-2 border-bg-secondary',
        meta.bgColor,
      )} />

      <div className="rounded-md border border-border-subtle bg-white/[0.01] px-3 py-2.5 hover:bg-bg-hover-subtle transition-colors">
        {/* Header */}
        <div className="flex items-center gap-1.5 mb-1">
          <Icon size={12} className={meta.color} />
          <span className={cn('text-xs font-medium', meta.color)}>
            {getTypeLabel(entry.type)}
          </span>
          <span className="text-xs text-text-secondary ml-auto">
            {formatTime(entry.timestamp)}
          </span>
        </div>

        {/* Title */}
        <div className="text-xs text-text-emphasis font-medium">
          {entry.title}
        </div>

        {/* Description */}
        <div className="text-xs text-text-secondary mt-0.5 leading-[1.5]">
          {entry.description}
        </div>

        {/* Agent tag */}
        <div className="mt-1.5">
          <span className="inline-flex items-center gap-0.5 text-xs text-text-secondary bg-bg-hover-muted px-1.5 py-px rounded">
            {entry.agentName}
          </span>
        </div>
      </div>
    </div>
  )
}

/* -- Helpers ----------------------------------------------- */

const groupByDate = (
  entries: EvolutionEntry[],
  formatDate: (date: Date) => string,
): Array<[string, EvolutionEntry[]]> => {
  const sorted = [...entries].sort((a, b) => b.timestamp - a.timestamp)
  const groups = new Map<string, EvolutionEntry[]>()

  for (const entry of sorted) {
    const date = new Date(entry.timestamp)
    const label = formatDate(date)
    const existing = groups.get(label) || []
    existing.push(entry)
    groups.set(label, existing)
  }

  return Array.from(groups.entries())
}

export default EvolutionLog
