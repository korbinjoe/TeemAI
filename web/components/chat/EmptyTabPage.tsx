/**
 * EmptyTabPage —
 *
 *  Chat Tab
 *  NewChatForm LaunchCard
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  Search, ChevronRight, Check, Loader2, Command, ArrowRight, Plus
} from 'lucide-react'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import AgentAvatar from '@/components/ui/agent-avatar'
import WorkspaceIcon from '@/components/icons/WorkspaceIcon'
import OpenTeamLogo from '@/components/icons/OpenTeamLogo'
import { cn } from '@/lib/utils'
import { DEFAULT_MODEL, getModelsForProvider } from '@/lib/models'
import { sortAgents } from '@/utils/teamStorage'
import { loadLastSession, saveLastSession } from '@/components/home/storage'
import { API_BASE, authFetch } from '@/config/api'
import { WS_EVENTS, useWorkspaceCreatedRefresh } from '@/hooks/useWorkspaceEvents'
import { getWebSocketClient } from '@/services/WebSocketClient'
import { sendAESEvent } from '@/lib/aes'
import type { AgentSummary } from '@/types/agentConfig'
import type { AgentPhase } from '@/types/chat'
import type { WorkspaceInfo } from '@/components/home/types'
import ActiveSessionBar from '@/components/home/ActiveSessionBar'

const SHORTCUTS = [
  { keys: ['N'], label: 'emptyTab.shortcut.newChat' },
  { keys: ['1', '~', '9'], label: 'emptyTab.shortcut.switchTab' },
  { keys: ['W'], label: 'emptyTab.shortcut.closeTab' },
] as const

const EmptyTabPage = () => {
  const navigate = useNavigate()
  const { t } = useTranslation(['workspace', 'home', 'common'])

  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([])
  const [agents, setAgents] = useState<AgentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  const lastSession = useMemo(() => loadLastSession(), [])
  const [selectedWsId, setSelectedWsId] = useState<string | undefined>()
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>()
  const [model, setModel] = useState(lastSession?.model ?? DEFAULT_MODEL)
  const [chatTitle, setChatTitle] = useState('')

  const [tabPhases, setTabPhases] = useState<Map<string, AgentPhase>>(new Map())
  useEffect(() => {
    const ws = getWebSocketClient()
    const handleActivity = (p: { chatId: string; phase?: string }) => {
      if (!p.phase) return
      setTabPhases((prev) => { const m = new Map(prev); m.set(p.chatId, p.phase as AgentPhase); return m })
    }
    ws.on('chat:activity', handleActivity)
    return () => { ws.off('chat:activity', handleActivity) }
  }, [])

  const [agentSearch, setAgentSearch] = useState('')
  const [wsDropdownOpen, setWsDropdownOpen] = useState(false)
  const [wsSearch, setWsSearch] = useState('')
  const comboboxRef = useRef<HTMLDivElement>(null)

  useWorkspaceCreatedRefresh(setWorkspaces, setSelectedWsId)

  useEffect(() => {
    Promise.all([
      authFetch(`${API_BASE}/api/workspaces`).then((r) => r.ok ? r.json() : []).catch(() => []),
      authFetch(`${API_BASE}/api/agents`).then((r) => r.ok ? r.json() : []).catch(() => []),
    ]).then(([ws, agentList]: [WorkspaceInfo[], AgentSummary[]]) => {
      setWorkspaces(ws)
      const sorted = sortAgents(agentList)
      setAgents(sorted)
      if (ws.length > 0) setSelectedWsId(ws[0].id)
      const defaultAgent = sorted.find((a) => a.id === 'fullstack-product-engineer') || sorted[0]
      if (defaultAgent) {
        setSelectedAgentId(defaultAgent.id)
        const compatible = getModelsForProvider(defaultAgent.provider)
        setModel((prev) => compatible.some((m) => m.value === prev) ? prev : (compatible[0]?.value ?? DEFAULT_MODEL))
      }
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!wsDropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (comboboxRef.current && !comboboxRef.current.contains(e.target as Node)) {
        setWsDropdownOpen(false)
        setWsSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [wsDropdownOpen])

  const selectedWs = workspaces.find((ws) => ws.id === selectedWsId)
  const selectedAgent = agents.find((a) => a.id === selectedAgentId)
  const availableModels = useMemo(
    () => getModelsForProvider(selectedAgent?.provider),
    [selectedAgent?.provider],
  )

  const handleAgentSelect = useCallback((agentId: string) => {
    setSelectedAgentId(agentId)
    const agent = agents.find((a) => a.id === agentId)
    const compatible = getModelsForProvider(agent?.provider)
    if (!compatible.some((m) => m.value === model)) {
      setModel(compatible[0]?.value ?? DEFAULT_MODEL)
    }
  }, [agents, model])

  const filteredWorkspaces = useMemo(() => {
    const q = wsSearch.trim().toLowerCase()
    if (!q) return workspaces
    return workspaces.filter((ws) =>
      ws.name.toLowerCase().includes(q) ||
      ws.repositories.some((r) => r.path.toLowerCase().includes(q)),
    )
  }, [workspaces, wsSearch])

  const filteredAgents = useMemo(() => {
    const q = agentSearch.trim().toLowerCase()
    if (!q) return agents
    return agents.filter((a) =>
      a.name.toLowerCase().includes(q) ||
      a.id.toLowerCase().includes(q) ||
      (a.description ?? '').toLowerCase().includes(q) ||
      (a.personality?.nickname ?? '').toLowerCase().includes(q),
    )
  }, [agents, agentSearch])

  const handleCreate = useCallback(async () => {
    if (!selectedWs) return
    setCreating(true)
    try {
      const paths = selectedWs.repositories.map((r) => r.path)
      const finalTitle = chatTitle.trim() || 'New Session'
      const body = {
        ...(paths.length === 1 ? { repoPath: paths[0] } : { repoPaths: paths }),
        model,
        title: finalTitle,
        ...(selectedAgent ? { agentId: selectedAgent.id } : {}),
        workspaceId: selectedWs.id,
      }
      saveLastSession({ repos: paths, model, agentId: selectedAgent?.id })
      sendAESEvent('chat', 'chat_created', {
        agentName: selectedAgent?.name,
        workspaceId: selectedWs.id,
        source: 'empty_tab',
      })
      const res = await fetch(`${API_BASE}/api/workspaces/quick-start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Create failed')
      }
      const { workspace, chat } = await res.json()
      navigate(`/workspace/${workspace.id}/chat/${chat.id}`, {
        state: { isNew: true, agentId: selectedAgent?.id },
      })
    } catch (err) {
      console.error('[EmptyTabPage] Create failed:', err)
      toast.error(t('common:error.createFailed'))
    } finally {
      setCreating(false)
    }
  }, [selectedWs, model, chatTitle, selectedAgent, navigate, t])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-bg-primary">
        <Loader2 size={20} className="animate-spin text-text-muted" />
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center h-full overflow-y-auto bg-bg-primary">
      <div className="flex-1 min-h-[60px] max-h-[120px]" />

      <div className="w-full max-w-[520px] px-6">
        <div className="flex items-center gap-3 mb-8">
          <OpenTeamLogo size={32} className="text-accent-brand" />
          <div>
            <h1 className="text-base font-nunito font-extrabold tracking-wide text-text-emphasis leading-tight">
              OpenTeam
            </h1>
            <p className="text-[11px] text-text-muted tracking-wide">
              Your AI Team, Always On
            </p>
          </div>
        </div>

        <ActiveSessionBar tabPhases={tabPhases} />

        {/* ── Quick Start: Continue with last setup ── */}
        {lastSession && selectedWs && selectedAgent && (
          <div className="mb-5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-2">
              {t('home:quickStart', { defaultValue: 'Quick Start' })}
            </div>
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-accent-brand/20 bg-accent-brand/[0.05] hover:bg-accent-brand/[0.09] hover:border-accent-brand/35 transition-all cursor-pointer text-left"
            >
              <AgentAvatar name={selectedAgent.name} agentId={selectedAgent.id} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-text-emphasis">
                  {t('home:continueLastSetup', { defaultValue: 'Continue with last setup' })}
                </div>
                <div className="text-[11px] text-text-secondary mt-0.5 truncate">
                  {selectedWs.name} · {selectedAgent.personality?.nickname || selectedAgent.name} · {model}
                </div>
              </div>
              {creating ? (
                <Loader2 size={14} className="animate-spin text-accent-brand shrink-0" />
              ) : (
                <ArrowRight size={14} className="text-accent-brand shrink-0" />
              )}
            </button>
          </div>
        )}

        {/* ── SessionName ── */}
        <div className="mb-4">
          <input
            value={chatTitle}
            onChange={(e) => setChatTitle(e.target.value)}
            placeholder={t('workspace:newChat.titlePlaceholder', 'New Session')}
            className="w-full h-10 rounded-lg border border-border bg-bg-elevated px-3 text-sm text-text-emphasis placeholder:text-text-muted outline-none focus:border-accent-brand/50 transition-colors"
          />
        </div>

        {/* ── WorkspaceSelect ── */}
        <div className="mb-5" ref={comboboxRef}>
          <div className="text-[11px] text-text-muted mb-1.5 uppercase tracking-wider font-medium">
            {t('home:selectWorkspace')}
          </div>
          <div className="relative">
            <div
              onClick={() => setWsDropdownOpen(!wsDropdownOpen)}
              role="combobox"
              aria-expanded={wsDropdownOpen}
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setWsDropdownOpen(!wsDropdownOpen) }}
              className="flex items-center gap-2 h-9 w-full rounded-lg border border-border bg-bg-elevated px-3 cursor-pointer hover:border-accent-brand/40 transition-colors"
            >
              {selectedWs ? (
                <>
                  <WorkspaceIcon size={14} className="shrink-0 text-accent-brand" />
                  <span className="text-sm text-text-emphasis truncate flex-1">{selectedWs.name}</span>
                  <span className="text-[11px] text-text-muted shrink-0">
                    {selectedWs.repositories.length} repo{selectedWs.repositories.length !== 1 ? 's' : ''}
                  </span>
                </>
              ) : (
                <span className="text-sm text-text-muted">{t('home:selectRepoOrWorkspace')}</span>
              )}
              <ChevronRight size={12} className={cn(
                'shrink-0 text-text-muted transition-transform',
                wsDropdownOpen && 'rotate-90',
              )} />
            </div>

            {wsDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-lg border border-border bg-bg-elevated shadow-lg overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle">
                  <Search size={12} className="shrink-0 text-text-muted" />
                  <input
                    value={wsSearch}
                    onChange={(e) => setWsSearch(e.target.value)}
                    placeholder={t('home:searchPlaceholder')}
                    autoFocus
                    className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-muted outline-none"
                  />
                </div>
                <div className="max-h-56 overflow-y-auto py-1">
                  {filteredWorkspaces.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-text-muted">{t('home:noMatch')}</div>
                  ) : (
                    filteredWorkspaces.map((ws) => {
                      const isSelected = selectedWsId === ws.id
                      return (
                        <button
                          key={ws.id}
                          onClick={() => { setSelectedWsId(ws.id); setWsDropdownOpen(false); setWsSearch('') }}
                          className={cn(
                            'flex items-center gap-2 w-full px-3 py-1.5 text-left transition-colors hover:bg-bg-hover-muted',
                            isSelected && 'bg-bg-hover-muted',
                          )}
                        >
                          <WorkspaceIcon size={12} className="shrink-0 text-accent-brand" />
                          <span className="text-xs text-text-primary truncate flex-1">{ws.name}</span>
                          <span className="text-[11px] text-text-muted shrink-0">
                            {ws.repositories.length} repo{ws.repositories.length !== 1 ? 's' : ''}
                          </span>
                          {isSelected && <Check size={12} className="shrink-0 text-accent-green" />}
                      </button>
                    )
                  })
                )}
                <button
                  onClick={() => {
                    setWsDropdownOpen(false)
                    setWsSearch('')
                    // trigger create
                    window.dispatchEvent(new CustomEvent(WS_EVENTS.OPEN_CREATE_MODAL))
                  }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-left transition-colors hover:bg-bg-hover-muted border-t border-border-subtle mt-1 pt-1.5"
                >
                  <Plus size={12} className="shrink-0 text-accent-brand" />
                  <span className="text-xs text-accent-brand">{t('home:createWorkspace')}</span>
                </button>
              </div>
            </div>
          )}
          </div>
        </div>

        {/* ── Agent Picker (vertical list) ── */}
        <div className="mb-5">
          <div className="rounded-lg border border-border bg-bg-secondary overflow-hidden">
            {/* Search */}
            <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-border-subtle">
              <Search size={13} className="text-text-muted shrink-0" />
              <input
                value={agentSearch}
                onChange={(e) => setAgentSearch(e.target.value)}
                placeholder={t('home:searchAgent', { defaultValue: 'Search agents...' })}
                className="flex-1 bg-transparent border-none outline-none text-[13px] text-text-primary placeholder:text-text-muted"
              />
            </div>

            {/* Agent list */}
            <div className="max-h-[240px] overflow-y-auto py-1.5 px-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted px-2.5 py-1.5">
                {t('home:selectAgent')}
              </div>
              {filteredAgents.map((agent) => {
                const isSelected = selectedAgentId === agent.id
                return (
                  <button
                    key={agent.id}
                    onClick={() => handleAgentSelect(agent.id)}
                    className={cn(
                      'flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg transition-all text-left mb-0.5',
                      isSelected
                        ? 'bg-accent-brand/[0.08] border border-accent-brand/20'
                        : 'border border-transparent hover:bg-bg-hover-subtle',
                    )}
                  >
                    <AgentAvatar name={agent.name} agentId={agent.id} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-text-emphasis truncate">
                        {agent.personality?.nickname || agent.name}
                      </div>
                      {agent.description && (
                        <div className="text-[11px] text-text-secondary mt-0.5 truncate">
                          {agent.description}
                        </div>
                      )}
                    </div>
                    {agent.provider && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-bg-hover-muted text-text-muted shrink-0">
                        {agent.provider}
                      </span>
                    )}
                    {isSelected && (
                      <Check size={14} className="text-accent-brand shrink-0" />
                    )}
                  </button>
                )
              })}
              {filteredAgents.length === 0 && agentSearch && (
                <div className="text-xs text-text-muted py-3 px-2.5 text-center">
                  {t('home:noMatch', { defaultValue: 'No matching agents' })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Model + Start ── */}
        <div className="flex items-center gap-2 mb-8">
          <div className="w-44 shrink-0">
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="h-9 text-xs rounded-lg">
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
            onClick={handleCreate}
            disabled={!selectedWs || creating}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent-brand h-9 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <ArrowRight size={14} />
            )}
            {t('home:startChat')}
          </button>
        </div>

        <div className="border-t border-border-subtle mb-5" />

        <div className="flex items-center justify-center gap-5 flex-wrap">
          {SHORTCUTS.map(({ keys, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className="flex items-center gap-0.5">
                <kbd className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1 rounded bg-bg-hover-muted border border-border-subtle text-[10px] text-text-muted font-mono">
                  <Command size={9} />
                </kbd>
                {keys.map((k) => (
                  <kbd
                    key={k}
                    className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1 rounded bg-bg-hover-muted border border-border-subtle text-[10px] text-text-muted font-mono"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
              <span className="text-[11px] text-text-muted">
                {t(`workspace:${label}`)}
              </span>
            </div>
          ))}
        </div>

        <div className="text-center mt-3 mb-6">
          <span className="text-[11px] text-text-muted/60">
            {t('workspace:emptyTab.shortcut.parallelHint')}
          </span>
        </div>
      </div>

      <div className="flex-[2]" />
    </div>
  )
}

export default EmptyTabPage
