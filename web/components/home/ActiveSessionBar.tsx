import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Zap, AlertTriangle, Clock, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useChatTabs } from '@/contexts/ChatTabContext'
import type { AgentPhase } from '@/types/chat'

interface ActiveSessionBarProps {
  tabPhases?: Map<string, AgentPhase>
  className?: string
}

const classifyPhase = (phase: AgentPhase): 'working' | 'error' | 'waiting' | 'idle' => {
  if (phase === 'thinking' || phase === 'tool_running' || phase === 'responding') return 'working'
  if (phase === 'error') return 'error'
  if (phase === 'waiting_input' || phase === 'waiting_confirmation') return 'waiting'
  return 'idle'
}

const ActiveSessionBar = ({ tabPhases, className }: ActiveSessionBarProps) => {
  const { tabs, activateTab } = useChatTabs()
  const { t } = useTranslation('home')

  const counts = useMemo(() => {
    let working = 0, errors = 0, waiting = 0
    if (tabPhases) {
      for (const phase of tabPhases.values()) {
        const cls = classifyPhase(phase)
        if (cls === 'working') working++
        else if (cls === 'error') errors++
        else if (cls === 'waiting') waiting++
      }
    }
    return { working, errors, waiting, total: working + errors + waiting }
  }, [tabPhases])

  const firstUrgent = useMemo(() => {
    if (!tabPhases) return null
    for (const tab of tabs) {
      const phase = tabPhases.get(tab.chatId)
      if (!phase) continue
      const cls = classifyPhase(phase)
      if (cls === 'error' || cls === 'waiting') return tab
    }
    return null
  }, [tabs, tabPhases])

  if (counts.total === 0) return null

  const hasUrgent = counts.errors > 0 || counts.waiting > 0

  return (
    <button
      type="button"
      onClick={() => { if (firstUrgent) activateTab(firstUrgent.chatId) }}
      className={cn(
        'w-full flex items-center gap-2.5 px-4 py-2.5 rounded-lg mb-5 transition-colors cursor-pointer border text-left',
        hasUrgent
          ? counts.errors > 0
            ? 'bg-accent-red/[0.04] border-accent-red/15 hover:bg-accent-red/[0.07]'
            : 'bg-accent-yellow/[0.04] border-accent-yellow/15 hover:bg-accent-yellow/[0.07]'
          : 'bg-bg-secondary border-border hover:bg-bg-hover-subtle',
        className,
      )}
    >
      {/* Status counts */}
      <div className="flex items-center gap-2.5">
        {counts.working > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-accent-brand-light">
            <Zap size={10} className="animate-pulse" />
            {counts.working}
          </span>
        )}
        {counts.errors > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-accent-red">
            <AlertTriangle size={10} />
            {counts.errors}
          </span>
        )}
        {counts.waiting > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-accent-yellow">
            <Clock size={10} />
            {counts.waiting}
          </span>
        )}
      </div>

      <span className="text-[12px] text-text-secondary truncate flex-1">
        {hasUrgent
          ? t('sessionsNeedAttention', {
              count: counts.errors + counts.waiting,
              defaultValue: '{{count}} sessions need attention',
            })
          : t('sessionsRunning', {
              count: counts.working,
              defaultValue: '{{count}} sessions running',
            })}
      </span>

      <ArrowRight size={12} className="text-text-muted shrink-0" />
    </button>
  )
}

export default ActiveSessionBar
