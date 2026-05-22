
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import AgentAvatar from '@/components/ui/agent-avatar'
import type { Agent } from '../../types/agentConfig'

interface AgentPaletteProps {
  agents: Agent[]
  /** Kept for future use when canvas handles drop events */
  onDropAgent?: (agent: Agent, position: { x: number; y: number }) => void
}

const AgentPalette = ({ agents }: AgentPaletteProps) => {
  const { t } = useTranslation(['agents', 'common'])
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return agents
    const q = search.toLowerCase()
    return agents.filter((a) =>
      a.name.toLowerCase().includes(q)
      || a.description.toLowerCase().includes(q)
      || a.tags?.some((tag) => tag.toLowerCase().includes(q)),
    )
  }, [agents, search])

  const handleDragStart = (e: React.DragEvent, agent: Agent) => {
    e.dataTransfer.setData('application/agent', JSON.stringify(agent))
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div className="w-[200px] shrink-0 border-r border-border-subtle bg-bg-secondary flex flex-col overflow-hidden">
      <div className="p-2 border-b border-border-subtle">
        <div className="flex items-center gap-1.5 bg-bg-input border border-border rounded-md px-2 py-1">
          <Search size={11} className="text-text-secondary shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('agents:team.palette.searchPlaceholder')}
            className="bg-transparent border-none outline-none text-text-primary text-xs w-full"
            aria-label={t('agents:team.palette.searchLabel')}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {filtered.length > 0 && (
          <PaletteGroup label={t('agents:team.palette.agents')} agents={filtered} onDragStart={handleDragStart} />
        )}
        {filtered.length === 0 && (
          <div className="text-center text-text-secondary text-xs py-4">
            {search ? t('agents:team.palette.noResults') : t('agents:team.palette.empty')}
          </div>
        )}
      </div>
    </div>
  )
}

const PaletteGroup = ({ label, agents, onDragStart }: {
  label: string
  agents: Agent[]
  onDragStart: (e: React.DragEvent, agent: Agent) => void
}) => (
  <div className="mb-3">
    <div className="text-xs font-semibold uppercase tracking-[0.6px] text-text-secondary mb-1.5 px-1">
      {label} ({agents.length})
    </div>
    <div className="flex flex-col gap-1">
      {agents.map((agent) => (
        <div
          key={agent.name}
          draggable
          onDragStart={(e) => onDragStart(e, agent)}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1.5 rounded cursor-grab active:cursor-grabbing',
            'border border-transparent hover:border-border hover:bg-bg-hover-subtle',
            'transition-all select-none',
          )}
          title={agent.description}
        >
          <GripVertical size={10} className="text-text-muted/50 shrink-0" />
          <AgentAvatar name={agent.name} agentId={agent.id} size="xs" />
          <div className="flex-1 min-w-0">
            <div className="text-xs text-text-primary truncate">{agent.name}</div>
          </div>
        </div>
      ))}
    </div>
  </div>
)

export default AgentPalette
