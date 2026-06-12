/**
 * ChatPage
 * BreadcrumbLink / TopBtn / EmptyState / ThinkingIndicator
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock } from 'lucide-react'
import AgentAvatar from '@/components/ui/agent-avatar'
import TeemAILogo from '@/components/icons/TeemAILogo'
import type { AgentActivity } from '@/types/chat'

/** Seconds-granular elapsed label, e.g. 45s, 2m 10s — used for the live
 *  "time since last message" indicator so a stalled task is visible. */
const formatGap = (ms: number): string => {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rs = s % 60
  return rs > 0 ? `${m}m ${rs}s` : `${m}m`
}

/** Gap (ms) after which a running task is flagged as possibly stuck. */
const STALE_GAP_MS = 60_000

export const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

export const BreadcrumbLink = ({ label, children, onClick }: {
  label?: string; children?: React.ReactNode; onClick: () => void
}) => (
  <button
    onClick={onClick}
    tabIndex={0}
    aria-label={label || 'Navigate'}
    className="bg-transparent border-none cursor-pointer text-text-secondary hover:text-text-emphasis transition-colors p-0 flex items-center text-xs leading-none"
  >
    {children || label}
  </button>
)

export const TopBtn = ({ children, onClick, title, disabled }: {
  children: React.ReactNode; onClick: () => void; title: string; disabled?: boolean
}) => (
  <button
    onClick={onClick} title={title} disabled={disabled}
    style={{
      background: 'transparent', border: 'none', borderRadius: 'var(--radius-sm)',
      color: 'rgb(var(--text-muted))', cursor: disabled ? 'not-allowed' : 'pointer',
      padding: 5, display: 'flex', alignItems: 'center',
      opacity: disabled ? 0.4 : 1, transition: 'all 0.1s',
      ...noDrag,
    }}
    onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.background = 'rgb(var(--bg-hover-muted) / var(--bg-hover-muted-alpha))'; e.currentTarget.style.color = 'rgb(var(--text-primary))' } }}
    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgb(var(--text-muted))' }}
  >
    {children}
  </button>
)

export const EmptyState = ({ connected, hasSession, reconnecting = false }: { connected: boolean; hasSession: boolean; reconnecting?: boolean }) => {
  const { t } = useTranslation(['chat', 'common'])
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 20,
      color: 'rgb(var(--text-muted))', userSelect: 'none', padding: 40,
    }}>
      {connected && hasSession ? (
        <>
          <TeemAILogo size={64} />
          <div style={{
            fontSize: 22, fontWeight: 800, letterSpacing: '0.04em',
            color: 'rgb(var(--text-emphasis))',
          }}>
            TeemAI
          </div>
          <div style={{
            fontSize: 13, color: 'rgb(var(--text-muted))',
            textAlign: 'center', lineHeight: 1.8, maxWidth: 320,
          }}>
            {t('chat:emptyStateHint')}
          </div>
          <div style={{
            fontSize: 11, color: 'rgb(var(--text-muted))',
            textAlign: 'center', lineHeight: 1.6, opacity: 0.7,
          }}>
            {t('chat:emptyStateMentionHint')}
          </div>
        </>
      ) : (
        <>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            border: '3px solid rgb(var(--border-color))', borderTopColor: 'rgb(var(--accent-brand))',
            animation: 'spin 0.8s linear infinite',
          }} />
          <span style={{ fontSize: 13, color: 'rgb(var(--text-secondary))' }}>
            {!connected ? (reconnecting ? t('common:status.reconnecting') : t('common:status.connecting')) : t('common:status.initializing')}
          </span>
        </>
      )}
    </div>
  )
}

const FILE_OP_VERB_KEYS: Record<string, string> = { create: 'fileOp.create', edit: 'fileOp.edit', delete: 'fileOp.delete', read: 'fileOp.read' }
const PHASE_LABEL_KEYS: Record<string, string> = { initializing: 'phase.initializing', thinking: 'phase.thinking', responding: 'phase.responding', tool_running: 'phase.tool_running' }

const getActivityLabel = (activity: AgentActivity | null | undefined, t: (key: string, opts?: Record<string, unknown>) => string): string | null => {
  if (!activity) return null
  if (activity.phase === 'tool_running') {
    if (activity.fileOp) {
      const verb = FILE_OP_VERB_KEYS[activity.fileOp.operation] ? t(FILE_OP_VERB_KEYS[activity.fileOp.operation]) : activity.fileOp.operation
      const fileName = activity.fileOp.path.split('/').pop() || activity.fileOp.path
      return `${verb} ${fileName}`
    }
    if (activity.currentTool) return `${t('fileOp.executing')} ${activity.currentTool}`
  }
  return PHASE_LABEL_KEYS[activity.phase] ? t(PHASE_LABEL_KEYS[activity.phase]) : null
}

export const ThinkingIndicator = ({ agentName, agentId, activity, lastMessageTs }: { agentName?: string; agentId?: string; activity?: AgentActivity | null; lastMessageTs?: number }) => {
  const { t } = useTranslation('chat')
  const label = getActivityLabel(activity, t)

  // Tick once per second so the "time since last message" stays live. This
  // indicator only mounts while a task is running, so the interval is bounded.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!lastMessageTs) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [lastMessageTs])

  const gap = lastMessageTs ? now - lastMessageTs : 0
  const isStale = gap >= STALE_GAP_MS

  return (
    <div style={{ padding: '8px 16px', display: 'flex', gap: 10, alignItems: 'center' }}>
      <AgentAvatar name={agentName || 'Agent'} agentId={agentId} size="sm" active />
      <span style={{ fontSize: 12, fontWeight: 600, color: 'rgb(var(--text-emphasis))' }}>
        {agentName || 'Agent'}
      </span>
      {label ? (
        <span style={{ fontSize: 11, color: 'rgb(var(--text-secondary))', transition: 'opacity 0.2s' }}>
          {label}
        </span>
      ) : (
        <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{
              width: 4, height: 4, borderRadius: '50%', background: 'rgb(var(--text-muted))',
              animation: `pulse-dot 1.4s ease-in-out ${i * 0.16}s infinite`,
            }} />
          ))}
        </span>
      )}
      {label && (
        <span style={{ display: 'inline-flex', gap: 2, alignItems: 'center', marginLeft: -4 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{
              width: 3, height: 3, borderRadius: '50%', background: 'rgb(var(--text-muted))',
              animation: `pulse-dot 1.4s ease-in-out ${i * 0.16}s infinite`,
            }} />
          ))}
        </span>
      )}
      {gap > 0 && (
        <span
          title={t('message.sinceLastActivity')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            marginLeft: 'auto',
            fontSize: 11,
            fontFamily: 'monospace',
            color: isStale ? 'rgb(var(--accent-yellow, 234 179 8))' : 'rgb(var(--text-muted))',
            fontWeight: isStale ? 600 : 400,
            flexShrink: 0,
          }}
        >
          <Clock size={10} style={{ opacity: 0.8, flexShrink: 0 }} />
          {formatGap(gap)}
        </span>
      )}
    </div>
  )
}
