/**
 * NewChatForm —
 *
 *  +
 *  NewChatFullDialog EmptyTabPage
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Search, ChevronRight, Check, Loader2, Plus } from 'lucide-react'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import AgentAvatar from '@/components/ui/agent-avatar'
import WorkspaceIcon from '@/components/icons/WorkspaceIcon'
import { cn } from '@/lib/utils'
import { DEFAULT_MODEL, getModelsForProvider } from '@/lib/models'
import { sortAgents } from '@/utils/teamStorage'
import { loadLastSession, saveLastSession } from '@/components/home/storage'
import { API_BASE, authFetch } from '@/config/api'
import { WS_EVENTS, useWorkspaceCreatedRefresh } from '@/hooks/useWorkspaceEvents'
import { sendAESEvent } from '@/lib/aes'
import type { AgentSummary } from '@/types/agentConfig'
import type { WorkspaceInfo } from '@/components/home/types'

interface NewChatFormProps {
  currentWorkspaceId?: string
  currentAgentId?: string | null
  onCreated?: () => void
}

const NewChatForm = ({ currentWorkspaceId, currentAgentId, onCreated }: NewChatFormProps) => {
  const navigate = useNavigate()
  const { t } = useTranslation(['home', 'workspace', 'common'])

  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([])
  const [agents, setAgents] = useState<AgentSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)

  const [selectedWsId, setSelectedWsId] = useState<string | undefined>(currentWorkspaceId)
  const [selectedAgentIdState, setSelectedAgentIdState] = useState<string | undefined>(
    () => currentAgentId ?? undefined,
  )
  const lastSession = useMemo(() => loadLastSession(), [])
  const [model, setModel] = useState(lastSession?.model ?? DEFAULT_MODEL)
  const [chatTitle, setChatTitle] = useState('New Session')

  const [wsDropdownOpen, setWsDropdownOpen] = useState(false)
  const [wsSearch, setWsSearch] = useState('')
  const comboboxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!currentAgentId) return
    setSelectedAgentIdState(currentAgentId)
  }, [currentAgentId])

  useEffect(() => {
    setLoading(true)
    setSelectedWsId(currentWorkspaceId)
    setChatTitle('New Session')
    Promise.all([
      authFetch(`${API_BASE}/api/workspaces`).then((r) => r.ok ? r.json() : []).catch(() => []),
      authFetch(`${API_BASE}/api/agents`).then((r) => r.ok ? r.json() : []).catch(() => []),
    ]).then(([ws, agentList]) => {
      setWorkspaces(ws)
      setAgents(sortAgents(agentList))
    }).finally(() => setLoading(false))
  }, [currentWorkspaceId])

  useEffect(() => {
    if (selectedAgentIdState || agents.length === 0) return
    const defaultAgent = agents.find((a) => a.id === 'fullstack-product-engineer') || agents[0]
    if (!defaultAgent) return
    setSelectedAgentIdState(defaultAgent.id)
    const compatible = getModelsForProvider(defaultAgent.provider)
    if (!compatible.some((m) => m.value === model)) {
      setModel(compatible[0]?.value ?? DEFAULT_MODEL)
    }
  }, [agents, selectedAgentIdState, model])

  useWorkspaceCreatedRefresh(setWorkspaces, setSelectedWsId)

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
  const selectedAgent = agents.find((a) => a.id === selectedAgentIdState)
  const availableModels = useMemo(
    () => getModelsForProvider(selectedAgent?.provider),
    [selectedAgent?.provider],
  )

  const handleAgentSelect = useCallback((agentId: string) => {
    setSelectedAgentIdState(agentId)
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
        source: 'form',
      })
      const res = await authFetch(`${API_BASE}/api/workspaces/quick-start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Create failed')
      }
      const { workspace, chat } = await res.json()
      onCreated?.()
      navigate(`/workspace/${workspace.id}/chat/${chat.id}`, {
        state: { isNew: true, agentId: selectedAgent?.id },
      })
    } catch (err) {
      console.error('[NewChatForm] Create failed:', err)
      toast.error(t('common:error.createFailed'))
    } finally {
      setCreating(false)
    }
  }, [selectedWs, model, chatTitle, selectedAgent, navigate, onCreated, t])

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-text-secondary text-sm">
        <Loader2 size={16} className="animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* 0. SessionName */}
      <div>
        <div className="text-xs text-text-secondary mb-2">{t('workspace:newChat.sessionName')}</div>
        <input
          value={chatTitle}
          onChange={(e) => setChatTitle(e.target.value)}
          placeholder="New Session"
          className="flex h-9 w-full rounded-md border border-border bg-bg-input px-3 text-sm text-text-emphasis placeholder:text-text-muted outline-none focus:border-accent-brand/40 transition-colors"
        />
      </div>

      {/* 1. SelectWorkspace */}
      <div>
        <div className="text-xs text-text-secondary mb-2">{t('home:selectWorkspace')}</div>
        <div ref={comboboxRef} className="relative">
          <div
            onClick={() => setWsDropdownOpen(!wsDropdownOpen)}
            role="combobox"
            aria-expanded={wsDropdownOpen}
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setWsDropdownOpen(!wsDropdownOpen) }}
            className="flex items-center gap-2 h-9 w-full rounded-md border border-border bg-bg-input px-3 cursor-pointer hover:border-accent-brand/40 transition-colors"
          >
            {selectedWs ? (
              <>
                <WorkspaceIcon size={14} className="shrink-0 text-accent-brand" />
                <span className="text-sm text-text-emphasis truncate flex-1">{selectedWs.name}</span>
                <span className="text-xs text-text-secondary shrink-0">
                  {selectedWs.repositories.length} repo{selectedWs.repositories.length !== 1 ? 's' : ''}
                </span>
              </>
            ) : (
              <span className="text-sm text-text-secondary">{t('home:selectRepoOrWorkspace')}</span>
            )}
            <ChevronRight size={12} className={cn(
              'shrink-0 text-text-secondary transition-transform',
              wsDropdownOpen && 'rotate-90',
            )} />
          </div>

          {wsDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-md border border-border bg-bg-elevated shadow-lg overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle">
                <Search size={12} className="shrink-0 text-text-secondary" />
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
                  <div className="px-3 py-2 text-xs text-text-secondary">{t('home:noMatch')}</div>
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
                        <span className="text-xs text-text-secondary shrink-0">
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

      {/* 2. SelectDigital worker */}
      <div>
        <div className="text-xs text-text-secondary mb-2">{t('home:selectAgent')}</div>
        {agents.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {agents.map((agent) => (
              <Tooltip key={agent.id} delayDuration={300}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => handleAgentSelect(agent.id)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-lg transition-all cursor-pointer',
                      selectedAgentIdState === agent.id
                        ? 'bg-accent-brand/10 ring-1 ring-accent-brand/40'
                        : 'hover:bg-bg-hover-subtle',
                    )}
                  >
                    <AgentAvatar name={agent.name} agentId={agent.id} size="lg" />
                    <span className="text-xs text-text-emphasis truncate max-w-[100px]">
                      {agent.name}
                    </span>
                    <span className={cn(
                      'text-xs px-1.5 py-px rounded-sm font-mono',
                      agent.provider === 'codex'
                        ? 'bg-accent-brand/10 text-accent-brand'
                        : 'bg-accent-orange/10 text-accent-orange',
                    )}>
                      {agent.provider === 'codex' ? 'Codex' : 'Claude Code'}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[200px]">
                  {agent.description || agent.name}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        ) : (
          <div className="text-xs text-text-secondary py-3">{t('home:noAgents')}</div>
        )}
      </div>

      {/* 3. Model + Start */}
      <div className="flex items-center gap-2">
        <div className="w-44 shrink-0">
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger className="h-9 text-xs">
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
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-accent-brand h-9 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {creating ? (
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

export default NewChatForm
