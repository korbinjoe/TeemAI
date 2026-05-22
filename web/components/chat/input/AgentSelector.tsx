import { useState, useRef, useCallback, useLayoutEffect, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'
import type { AgentSummary } from '../../../types/agentConfig'
import AgentAvatar from '@/components/ui/agent-avatar'

interface AgentSelectorProps {
  agents: AgentSummary[]
  selectedId: string | null
  onChange: (agentId: string) => void
}

const AgentSelector = ({ agents, selectedId, onChange }: AgentSelectorProps) => {
  const { t } = useTranslation('common')
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ left: number; bottom: number } | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  // Agent selection is now purely local state — PTY reads agent config on start
  const applyAgent = useCallback((_agentId: string) => {
    // no-op: agent is applied when PTY starts via ConfigCompiler
  }, [])

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    setMenuPos({
      left: rect.left,
      bottom: window.innerHeight - rect.top + 4,
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (wrapperRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleSelect = useCallback((agent: AgentSummary) => {
    setOpen(false)
    applyAgent(agent.name)
    onChange(agent.name)
  }, [applyAgent, onChange])

  const current = agents.find((a) => a.name === selectedId)

  if (agents.length === 0) return null

  return (
    <div ref={wrapperRef} style={{ position: 'relative', flexShrink: 1, minWidth: 0 }}>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '3px 8px', borderRadius: 'var(--radius-sm)',
          border: 'none',
          background: 'rgb(var(--bg-hover-muted) / var(--bg-hover-muted-alpha))',
          color: 'rgb(var(--text-muted))', cursor: 'pointer',
          fontSize: 11, fontWeight: 400, transition: 'all 0.15s',
          height: 24, maxWidth: '100%', overflow: 'hidden',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgb(var(--bg-hover))'
          e.currentTarget.style.color = 'rgb(var(--text-primary))'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgb(var(--bg-hover-muted) / var(--bg-hover-muted-alpha))'
          e.currentTarget.style.color = 'rgb(var(--text-muted))'
        }}
      >
        <AgentAvatar name={current?.name ?? 'Agent'} agentId={current?.id} size="xs" />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current?.name ?? 'Agent'}</span>
        <ChevronDown size={10} style={{
          transition: 'transform 0.15s',
          transform: open ? 'rotate(180deg)' : 'rotate(0)',
          opacity: 0.6, flexShrink: 0,
        }} />
      </button>

      {open && menuPos && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            left: menuPos.left,
            bottom: menuPos.bottom,
            zIndex: 10000,
            minWidth: 280, maxWidth: 340, borderRadius: 'var(--radius-md)',
            border: '1px solid rgb(var(--border-color))',
            background: 'rgb(var(--bg-primary))',
            boxShadow: '0 8px 24px var(--shadow-color, rgba(0,0,0,0.25))',
            overflow: 'hidden',
          }}
        >
          {agents.map((agent) => (
            <AgentOption
              key={agent.name}
              agent={agent}
              selected={agent.name === selectedId}
              onSelect={() => handleSelect(agent)}
              currentLabel={t('current')}
            />
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}

const AgentOption = ({ agent, selected, onSelect, currentLabel }: {
  agent: AgentSummary; selected: boolean; onSelect: () => void; currentLabel: string
}) => (
  <button
    onClick={onSelect}
    style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      width: '100%', padding: '8px 12px', border: 'none',
      background: selected ? 'rgb(var(--bg-hover-subtle) / var(--bg-hover-subtle-alpha))' : 'transparent',
      cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s',
    }}
    onMouseEnter={(e) => {
      if (!selected) e.currentTarget.style.background = 'rgb(var(--bg-hover-muted) / var(--bg-hover-muted-alpha))'
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.background = selected ? 'rgb(var(--bg-hover-subtle) / var(--bg-hover-subtle-alpha))' : 'transparent'
    }}
  >
    <AgentAvatar name={agent.name} agentId={agent.id} size="md" />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{
        fontSize: 12, fontWeight: 500,
        color: selected ? 'rgb(var(--accent-brand))' : 'rgb(var(--text-primary))',
      }}>
        {agent.name}
      </div>
      <div style={{
        fontSize: 11, color: 'rgb(var(--text-muted))', marginTop: 2,
        overflow: 'hidden', textOverflow: 'ellipsis',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
      }}>
        {agent.description}
      </div>
    </div>
    {selected && (
      <span style={{
        fontSize: 10, padding: '1px 5px', borderRadius: 3, flexShrink: 0, marginTop: 2,
        background: 'rgb(var(--bg-hover-muted) / var(--bg-hover-muted-alpha))', color: 'rgb(var(--accent-brand))', fontWeight: 500,
      }}>
        {currentLabel}
      </span>
    )}
  </button>
)

export default AgentSelector
