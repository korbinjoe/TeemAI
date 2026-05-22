/**
 * AgentTargetBar —  Agent
 *  chip  +  MentionMenu
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import MentionMenu, { type MentionItem } from './MentionMenu'
import type { AgentSummary } from '@/types/agentConfig'
import type { AgentActivity } from '@/types/chat'

interface AgentTargetBarProps {
  agents: AgentSummary[]
  expertActivities: Record<string, AgentActivity>
  selectedId: string | null
  onSelect: (agent: AgentSummary) => void
}

const AgentTargetBar = ({
  agents,
  expertActivities,
  selectedId,
  onSelect,
}: AgentTargetBarProps) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuIndex, setMenuIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const agentItems: MentionItem[] = useMemo(
    () => agents.map((agent) => ({ kind: 'agent', agent })),
    [agents],
  )

  if (agents.length === 0) return null

  const selectedAgent = agents.find(
    (a) => a.name === selectedId || (a.id ?? a.name) === selectedId,
  ) ?? agents[0]

  const handleSelect = useCallback((agent: AgentSummary) => {
    onSelect(agent)
    setMenuOpen(false)
  }, [onSelect])

  useEffect(() => {
    if (!menuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMenuIndex((i) => Math.min(i + 1, agents.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMenuIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        handleSelect(agents[menuIndex])
      } else if (e.key === 'Escape') {
        setMenuOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [menuOpen, menuIndex, agents, handleSelect])

  const handleToggle = () => {
    if (!menuOpen) {
      const idx = agents.findIndex((a) => a.name === selectedAgent.name)
      setMenuIndex(idx >= 0 ? idx : 0)
    }
    setMenuOpen((prev) => !prev)
  }

  if (agents.length === 1) {
    return (
      <div className="flex items-center gap-1 px-2.5 py-1">
        <span className="text-[11px] text-text-muted">@</span>
        <span className="text-xs font-medium text-text-emphasis">{selectedAgent.name}</span>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative px-2 py-0.5">
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          'flex items-center gap-0.5 px-1.5 py-0.5 rounded transition-colors border-none cursor-pointer',
          'bg-transparent hover:bg-bg-hover-muted',
        )}
      >
        <span className="text-[11px] text-text-muted">@</span>
        <span className="text-xs font-medium text-accent-brand max-w-[140px] truncate">
          {selectedAgent.name}
        </span>
        <ChevronDown size={11} className={cn(
          'text-text-muted transition-transform',
          menuOpen && 'rotate-180',
        )} />
      </button>

      {menuOpen && (
        <MentionMenu
          items={agentItems}
          activities={expertActivities}
          selectedIndex={menuIndex}
          onSelect={(item) => { if (item.kind === 'agent') handleSelect(item.agent) }}
          showFilesSection={false}
        />
      )}
    </div>
  )
}

export default AgentTargetBar
