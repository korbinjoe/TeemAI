import { useState, useEffect, useCallback } from 'react'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { AgentSummary } from '@/types/agentConfig'
import AgentAvatar from '@/components/ui/agent-avatar'
import {
  getSelectedAgentId,
  setSelectedAgentId as persistSelectedAgentId,
} from '@/utils/agentStorage'

import { API_BASE, authFetch } from '@/config/api'

const AgentListPanel = () => {
  const { t } = useTranslation(['settings', 'common'])
  const [availableAgents, setAvailableAgents] = useState<AgentSummary[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(() => getSelectedAgentId())
  const [viewingAgent, setViewingAgent] = useState<AgentSummary | null>(null)
  const [fullAgent, setFullAgent] = useState<Record<string, unknown> | null>(null)

  const fetchAgents = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/api/agents`)
      const data: AgentSummary[] = await res.json()
      setAvailableAgents(data)
    } catch {
      toast.error(t('settings:agentList.fetchFailed'))
    }
  }, [t])

  useEffect(() => { fetchAgents() }, [fetchAgents])

  const handleView = async (agent: AgentSummary) => {
    setViewingAgent(agent)
    try {
      const res = await authFetch(`${API_BASE}/api/agents/${encodeURIComponent(agent.name)}`)
      setFullAgent(await res.json())
    } catch {
      setFullAgent(null)
    }
  }

  const handleApply = (agentId: string) => {
    setSelectedAgentId(agentId)
    persistSelectedAgentId(agentId)
    toast.success(t('settings:agentList.applied'))
  }

  return (
    <div className="flex h-full gap-4">
      {/* Left: agents list */}
      <div className="flex w-60 shrink-0 flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-text-primary">
            {t('settings:agentList.title', { count: availableAgents.length })}
          </span>
          <button
            onClick={fetchAgents}
            className="rounded p-1 text-text-secondary hover:bg-bg-tertiary hover:text-text-secondary"
            title={t('common:action.refresh')}
            tabIndex={0}
            aria-label={t('common:action.refresh')}
          >
            <RefreshCw size={12} />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
          {availableAgents.map((agent) => (
            <AgentCard
              key={agent.name} agent={agent}
              isSelected={agent.name === selectedAgentId}
              isViewing={agent.name === viewingAgent?.name}
              onView={() => handleView(agent)}
              onApply={() => handleApply(agent.name)}
              applyLabel={t('settings:agentList.apply')}
              currentLabel={t('settings:agentList.current')}
            />
          ))}
        </div>
      </div>

      {/* Right: detail view */}
      <div className="flex-1 overflow-y-auto">
        {!viewingAgent ? (
          <div className="flex h-full flex-col items-center justify-center text-text-secondary">
            <AgentAvatar name="default" size="xl" className="opacity-20" />
            <div className="mt-2 text-[13px]">{t('settings:agentList.selectHint')}</div>
          </div>
        ) : (
          <AgentDetail
            agent={viewingAgent}
            full={fullAgent}
            isSelected={viewingAgent.name === selectedAgentId}
            onApply={() => handleApply(viewingAgent.name)}
            applyLabel={t('settings:agentList.apply')}
            currentLabel={t('settings:agentList.current')}
            subAgentsLabel={t('settings:agentList.subAgents')}
            systemPromptLabel={t('settings:agentList.systemPrompt')}
            rawDefinitionLabel={t('settings:agentList.rawDefinition')}
          />
        )}
      </div>
    </div>
  )
}

const AgentCard = ({ agent, isSelected, isViewing, onView, onApply, applyLabel, currentLabel }: {
  agent: AgentSummary; isSelected: boolean; isViewing: boolean
  onView: () => void; onApply: () => void
  applyLabel: string; currentLabel: string
}) => (
  <div
    onClick={onView}
    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onView() }}
    tabIndex={0}
    role="button"
    aria-label={`View agent ${agent.name}`}
    className={cn(
      'cursor-pointer rounded-md border px-2.5 py-2 transition-all',
      isViewing
        ? 'border-accent-brand bg-accent-brand/[0.06]'
        : isSelected
          ? 'border-[rgba(82,196,26,0.4)]'
          : 'border-border-subtle hover:border-border',
    )}
  >
    <div className="flex items-center gap-2">
      <AgentAvatar name={agent.name} agentId={agent.id} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
          {agent.name}
          {isSelected && (
            <span className="rounded bg-[rgba(82,196,26,0.12)] px-1 text-xs text-accent-green">
              {currentLabel}
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-xs text-text-secondary">
          {agent.description}
        </div>
      </div>
    </div>
    {!isSelected && (
      <button
        onClick={(e) => { e.stopPropagation(); onApply() }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onApply() } }}
        className="mt-1.5 rounded border border-accent-brand bg-transparent px-2 py-0.5 text-xs text-accent-brand hover:bg-accent-brand hover:text-white"
        tabIndex={0}
        aria-label={`Apply agent ${agent.name}`}
      >
        {applyLabel}
      </button>
    )}
  </div>
)

const AgentDetail = ({ agent, full, isSelected, onApply, applyLabel, currentLabel, subAgentsLabel, systemPromptLabel, rawDefinitionLabel }: {
  agent: AgentSummary
  full: Record<string, unknown> | null
  isSelected: boolean
  onApply: () => void
  applyLabel: string
  currentLabel: string
  subAgentsLabel: string
  systemPromptLabel: string
  rawDefinitionLabel: string
}) => {
  const systemPrompt = (full as Record<string, Record<string, string>> | null)?.systemPrompt?.content ?? ''

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <AgentAvatar name={agent.name} agentId={agent.id} size="xl" />
        <div>
          <div className="text-base font-semibold text-text-primary">{agent.name}</div>
          <div className="mt-0.5 text-xs text-text-secondary">{agent.description}</div>
          <div className="mt-1.5 flex gap-1.5">
            {!isSelected && (
              <button
                onClick={onApply}
                className="rounded bg-accent-brand px-2 py-px text-xs text-white hover:opacity-90"
                tabIndex={0}
                aria-label="Apply this agent"
              >
                {applyLabel}
              </button>
            )}
            {isSelected && (
              <span className="rounded bg-[rgba(82,196,26,0.12)] px-1.5 py-px text-xs text-accent-green">
                {currentLabel}
              </span>
            )}
          </div>
        </div>
      </div>

      {agent.subAgentNames && agent.subAgentNames.length > 0 && (
        <div>
          <div className="mb-1.5 text-xs font-semibold text-text-secondary">
            {subAgentsLabel}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {agent.subAgentNames.map((id) => (
              <span
                key={id}
                className="rounded border border-accent-brand/15 bg-accent-brand/[0.06] px-2 py-0.5 text-xs text-text-secondary"
              >
                {id}
              </span>
            ))}
          </div>
        </div>
      )}

      {systemPrompt && (
        <div>
          <div className="mb-1.5 text-xs font-semibold text-text-secondary">
            {systemPromptLabel}
          </div>
          <textarea
            value={systemPrompt}
            readOnly
            rows={6}
            className="w-full resize-y rounded border border-border bg-[rgba(0,0,0,0.15)] p-2 font-mono text-xs text-text-secondary focus:outline-none"
          />
        </div>
      )}

      {full && (
        <div>
          <div className="mb-1.5 text-xs font-semibold text-text-secondary">
            {rawDefinitionLabel}
          </div>
          <textarea
            value={JSON.stringify(full, null, 2)}
            readOnly
            rows={8}
            className="w-full resize-y rounded border border-border bg-[rgba(0,0,0,0.15)] p-2 font-mono text-xs text-text-secondary focus:outline-none"
          />
        </div>
      )}
    </div>
  )
}

export default AgentListPanel
