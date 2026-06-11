import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ChevronRight, Search, Check, Plus, Loader2,
} from 'lucide-react'
import { DndContext, closestCenter, useSensor, useSensors, PointerSensor } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import AgentAvatar from '@/components/ui/agent-avatar'
import WorkspaceIcon from '@/components/icons/WorkspaceIcon'
import { useMemo } from 'react'
import type { AgentSummary } from '../../types/agentConfig'
import type { QuickItem } from './types'
import { getQuickItemKey } from './utils'
import { getModelsForProvider } from '@/lib/models'
import SortableQuickChip from './SortableQuickChip'
import { sendAESEvent } from '@/lib/aes'

interface LaunchCardProps {
  // Quick launch
  selectedQuickItem: QuickItem | null
  setSelectedQuickItem: (item: QuickItem) => void
  quickDropdownOpen: boolean
  setQuickDropdownOpen: (open: boolean) => void
  quickSearch: string
  setQuickSearch: (v: string) => void
  filteredQuickItems: QuickItem[]
  comboboxRef: React.RefObject<HTMLDivElement | null>
  displayedChips: QuickItem[]
  displayedChipIds: string[]
  sensors: ReturnType<typeof import('@dnd-kit/core').useSensors>
  handleSortEnd: (event: DragEndEvent) => void
  handleRemoveQuickItem: (item: QuickItem, e: React.MouseEvent) => void
  // Agent
  agents: AgentSummary[]
  selectedAgentId: string | undefined
  onAgentSelect: (name: string) => void
  onAgentReorder: (ids: string[]) => void
  // Model + launch
  model: string
  setModel: (m: string) => void
  launchingItem: string | null
  onNewChat: () => void
  onOpenCreateWsModal: () => void
}

const LaunchCard = ({
  selectedQuickItem, setSelectedQuickItem,
  quickDropdownOpen, setQuickDropdownOpen,
  quickSearch, setQuickSearch,
  filteredQuickItems,
  comboboxRef,
  displayedChips, displayedChipIds,
  sensors, handleSortEnd, handleRemoveQuickItem,
  agents, selectedAgentId, onAgentSelect, onAgentReorder,
  model, setModel,
  launchingItem, onNewChat, onOpenCreateWsModal,
}: LaunchCardProps) => {
  const navigate = useNavigate()
  const { t } = useTranslation(['home', 'common'])

  const selectedAgent = agents.find((a) => a.name === selectedAgentId)
  const availableModels = useMemo(
    () => getModelsForProvider(selectedAgent?.provider),
    [selectedAgent?.provider],
  )

  return (
    <div>
      {/* Section Title */}
      <div className="text-sm font-semibold text-text-emphasis mb-4">
        {t('home:quickLaunch')}
      </div>

      {/* Step 1: SelectWorkspace */}
      <div className="mb-5">
        <div className="text-xs text-text-secondary mb-2">{t('home:selectWorkspace')}</div>

        <div ref={comboboxRef} className="relative">
          <div
            onClick={() => setQuickDropdownOpen(!quickDropdownOpen)}
            role="combobox"
            aria-expanded={quickDropdownOpen}
            aria-label={t('home:selectRepoOrWorkspace')}
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setQuickDropdownOpen(!quickDropdownOpen) }}
            className="flex items-center gap-2 h-9 w-full rounded-md border border-border bg-bg-input px-3 cursor-pointer hover:border-accent-brand/40 transition-colors"
          >
            {selectedQuickItem ? (
              <>
                <WorkspaceIcon size={14} className="shrink-0 text-accent-brand" />
                <span className="text-sm text-text-emphasis truncate flex-1">
                  {selectedQuickItem.type === 'workspace'
                    ? selectedQuickItem.label
                    : selectedQuickItem.paths[0].split('/').pop()}
                </span>
                {selectedQuickItem.workspaceId === 'default' && (
                  <span className="text-xs px-1 py-px rounded bg-accent-brand/10 text-accent-brand shrink-0">
                    Default
                  </span>
                )}
                <span className="text-xs text-text-secondary shrink-0">
                  {selectedQuickItem.type === 'workspace'
                    ? `${selectedQuickItem.paths.length} repos`
                    : 'work'}
                </span>
              </>
            ) : (
              <span className="text-sm text-text-secondary">{t('home:selectRepoOrWorkspace')}</span>
            )}
            <ChevronRight size={12} className={cn(
              'shrink-0 text-text-secondary transition-transform',
              quickDropdownOpen && 'rotate-90',
            )} />
          </div>

          {quickDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-md border border-border bg-bg-elevated shadow-lg overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle">
                <Search size={12} className="shrink-0 text-text-secondary" />
                <input
                  value={quickSearch}
                  onChange={(e) => setQuickSearch(e.target.value)}
                  placeholder={t('home:searchPlaceholder')}
                  autoFocus
                  className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-muted outline-none"
                />
              </div>
              <div className="max-h-72 overflow-y-auto py-1">
                {filteredQuickItems.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-text-secondary">{t('home:noMatch')}</div>
                ) : (
                  filteredQuickItems.map((item) => {
                    const isSelected = selectedQuickItem?.workspaceId === item.workspaceId
                    return (
                      <button
                        key={item.type === 'workspace' ? `ws-${item.workspaceId}` : `repo-${item.paths[0]}`}
                        onClick={() => {
                          setSelectedQuickItem(item)
                          setQuickDropdownOpen(false)
                          setQuickSearch('')
                        }}
                        aria-label={t('home:selectWorkspace')}
                        tabIndex={0}
                        className={cn(
                          'flex items-center gap-2 w-full px-3 py-1.5 text-left transition-colors hover:bg-bg-hover-muted',
                          isSelected && 'bg-bg-hover-muted',
                        )}
                      >
                        <WorkspaceIcon size={12} className="shrink-0 text-accent-brand" />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-text-primary truncate flex items-center gap-1.5">
                            {item.type === 'workspace' ? item.label : item.paths[0].split('/').pop()}
                            {item.workspaceId === 'default' && (
                              <span className="text-xs px-1 py-px rounded bg-accent-brand/10 text-accent-brand shrink-0">
                                Default
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-text-secondary shrink-0">
                          {item.type === 'workspace'
                            ? `${item.paths.length} repo${item.paths.length !== 1 ? 's' : ''}`
                            : 'work'}
                        </span>
                        {isSelected && <Check size={12} className="shrink-0 text-accent-green" />}
                      </button>
                    )
                  })
                )}
                <button
                  onClick={() => {
                    setQuickDropdownOpen(false)
                    setQuickSearch('')
                    onOpenCreateWsModal()
                  }}
                  aria-label={t('home:createWorkspace')}
                  tabIndex={0}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-left transition-colors hover:bg-bg-hover-muted border-t border-border-subtle mt-1 pt-1.5"
                >
                  <Plus size={12} className="shrink-0 text-accent-brand" />
                  <span className="text-xs text-accent-brand">{t('home:createWorkspace')}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Quick chips — sortable */}
        {displayedChips.length > 0 && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleSortEnd}
          >
            <SortableContext items={displayedChipIds} strategy={horizontalListSortingStrategy}>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {displayedChips.map((item) => (
                  <SortableQuickChip
                    key={getQuickItemKey(item)}
                    item={item}
                    isSelected={
                      selectedQuickItem?.workspaceId === item.workspaceId
                    }
                    onSelect={() => setSelectedQuickItem(item)}
                    onRemove={(e) => handleRemoveQuickItem(item, e)}
                    selectLabel={t('home:selectWorkspace')}
                    deleteLabel={`${t('common:action.delete')} ${item.label}`}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Step 2: SelectDigital worker */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-text-secondary">{t('home:selectAgent')}</span>
          <button
            onClick={() => navigate('/agents')}
            aria-label={t('home:manage')}
            tabIndex={0}
            className="text-xs text-text-secondary hover:text-accent-brand transition-colors flex items-center gap-0.5"
          >
            {t('home:manage')} <ChevronRight size={10} />
          </button>
        </div>

        {agents.length > 0 ? (
          <AgentSortableList
            agents={agents}
            selectedAgentId={selectedAgentId}
            onAgentSelect={onAgentSelect}
            onReorder={onAgentReorder}
          />
        ) : (
          <div className="flex items-center gap-3 py-4 px-3 rounded-md border border-dashed border-border">
            <Plus size={16} className="text-text-secondary" />
            <div>
              <div className="text-xs text-text-secondary">{t('home:noAgents')}</div>
              <button
                onClick={() => navigate('/agents')}
                aria-label={t('home:goCreate')}
                tabIndex={0}
                className="text-xs text-accent-brand hover:underline mt-0.5"
              >
                {t('home:goCreate')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Model + StartConversation */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="w-full sm:w-44 shrink-0">
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger aria-label={t('home:selectModel')} className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableModels.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <button
          onClick={() => { sendAESEvent('chat', 'chat_created', { agentName: selectedAgent?.name, workspaceId: selectedQuickItem?.workspaceId }); onNewChat() }}
          disabled={launchingItem !== null}
          aria-label={t('home:startChat')}
          tabIndex={0}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-accent-brand h-9 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {launchingItem ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Plus size={14} />
          )}
          {t('home:startChat')}
        </button>
      </div>
    </div>
  )
}

/* -- Sortable Agent List -- */

const AgentSortableList = ({ agents, selectedAgentId, onAgentSelect, onReorder }: {
  agents: AgentSummary[]
  selectedAgentId: string | undefined
  onAgentSelect: (name: string) => void
  onReorder: (ids: string[]) => void
}) => {
  const { t } = useTranslation(['home'])
  const agentSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = agents.findIndex((a) => a.id === active.id)
    const newIdx = agents.findIndex((a) => a.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    const reordered = arrayMove(agents, oldIdx, newIdx)
    onReorder(reordered.map((a) => a.id))
  }

  return (
    <DndContext sensors={agentSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={agents.map((a) => a.id)} strategy={horizontalListSortingStrategy}>
        <div className="flex gap-2 overflow-x-auto flex-nowrap md:grid md:grid-cols-3 md:overflow-visible">
          {agents.map((agent) => (
            <SortableAgentChip
              key={agent.id}
              agent={agent}
              isSelected={selectedAgentId === agent.name}
              onSelect={() => onAgentSelect(agent.name)}
              selectLabel={t('home:selectAgent')}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

const SortableAgentChip = ({ agent, isSelected, onSelect, selectLabel }: {
  agent: AgentSummary
  isSelected: boolean
  onSelect: () => void
  selectLabel: string
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: agent.id })

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <button
          ref={setNodeRef}
          {...attributes}
          {...listeners}
          onClick={onSelect}
          aria-label={`${selectLabel} ${agent.name}`}
          tabIndex={0}
          style={{
            transform: CSS.Transform.toString(transform),
            transition,
          }}
          className={cn(
            'flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-lg transition-all cursor-pointer select-none',
            isSelected
              ? 'bg-accent-brand/10 ring-1 ring-accent-brand/40'
              : 'hover:bg-bg-hover-subtle',
            isDragging && 'opacity-50 z-50',
          )}
        >
          <AgentAvatar name={agent.name} agentId={agent.id} size="lg" />
          <span className="text-xs text-text-emphasis truncate max-w-[120px]">
            {agent.name}
          </span>
          <span className={cn(
            'text-xs px-1.5 py-px rounded-sm font-mono',
            agent.provider === 'codex'
              ? 'bg-accent-brand/10 text-accent-brand'
              : agent.provider === 'qoder'
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-accent-orange/10 text-accent-orange',
          )}>
            {agent.provider === 'codex' ? 'Codex' : agent.provider === 'qoder' ? 'Qoder' : 'Claude Code'}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[200px]">
        {agent.description || agent.name}
      </TooltipContent>
    </Tooltip>
  )
}

export default LaunchCard
