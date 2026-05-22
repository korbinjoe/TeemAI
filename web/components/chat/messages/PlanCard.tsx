/**
 * PlanCard —  ACP plan_update  entries  status
 *
 *  PlanApprovalCard
 * - PlanApprovalCardstream-json  toolUse  ExitPlanMode  UI
 * - PlanCard ACP plan_update  plan
 *
 *  provider
 */

import { CheckCircle2, Circle, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export interface PlanEntry {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  priority?: 'low' | 'medium' | 'high'
}

interface Props {
  entries: PlanEntry[]
}

const renderIcon = (status: PlanEntry['status']) => {
  if (status === 'completed') {
    return <CheckCircle2 size={13} style={{ color: 'rgb(var(--accent-green))', flexShrink: 0 }} />
  }
  if (status === 'in_progress') {
    return <Loader2 size={13} className="animate-spin" style={{ color: 'rgb(var(--accent-brand))', flexShrink: 0 }} />
  }
  return <Circle size={13} style={{ color: 'rgb(var(--text-muted))', flexShrink: 0 }} />
}

const PlanCard = ({ entries }: Props) => {
  const { t } = useTranslation('chat')
  if (!entries?.length) return null

  return (
    <div
      style={{
        margin: '6px 4px 6px 17px',
        borderRadius: 8,
        border: '1px solid rgb(var(--border-subtle))',
        background: 'rgb(var(--bg-elevated))',
        padding: '10px 14px',
      }}
    >
      <div style={{ fontSize: 11, color: 'rgb(var(--text-muted))', marginBottom: 8, fontWeight: 500 }}>
        {t('plan.header', { completed: entries.filter((e) => e.status === 'completed').length, total: entries.length })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {entries.map((entry, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ marginTop: 2 }}>{renderIcon(entry.status)}</span>
            <span
              style={{
                fontSize: 12,
                color: entry.status === 'completed'
                  ? 'rgb(var(--text-muted))'
                  : 'rgb(var(--text-primary))',
                textDecoration: entry.status === 'completed' ? 'line-through' : 'none',
                lineHeight: 1.5,
              }}
            >
              {entry.content}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default PlanCard
