import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'
import { toast } from 'sonner'
import type { Agent, SkillDefinition } from '../types/agentConfig'
import { API_BASE, authFetch } from '@/config/api'
import { getHiredAgentIds, hireAgent } from '@/utils/teamStorage'
import {
  agentProviderFromIdentityField,
  formatIdentityProviderYamlValue,
  parseIdentityProviderField,
} from '@/lib/agentIdentityProvider'

const HIRE_TEAM_DIALOG_DELAY_MS = 720

/**
 *  AGENTS.md react-router `location.state`
 */
export const AGENT_NEW_PREFILL_AGENTS_STATE_KEY = 'prefillAgentsMd' as const

export const AGENT_NEW_OPEN_AI_GENERATE_STATE_KEY = 'openAgentAiGenerateDialog' as const

/**  `/agents/new/edit`  location.state */
export type AgentNewEditLocationState = {
  [AGENT_NEW_PREFILL_AGENTS_STATE_KEY]?: string
  [AGENT_NEW_OPEN_AI_GENERATE_STATE_KEY]?: boolean
}

export type EditorTab = 'IDENTITY.md' | 'AGENTS.md' | 'SOUL.md'

const createEmptyAgent = (): Agent => ({
  id: '',
  name: '',
  description: '',
  icon: '🤖',
  systemPrompt: { mode: 'append', content: '' },
  tags: [],
  source: 'user',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
})

const IDENTITY_TOP_LEVEL_KEYS_LOWER = new Set([
  'name', 'emoji', 'description', 'nickname', 'animal',
  'provider', 'allowedtools', 'disallowedtools',
])

/**
 *  IDENTITY.md  `parseIdentityContent`
 *  Agent  `buildIdentityContent(agent, true)`
 *
 *  `handleSave`  `parseIdentityContent`
 * - name → Agent.name
 * - emoji `icon`→ Agent.icon `emoji:`
 * - description → Agent.description
 * - provider `Claude Code` / `claudecode` / `claude` / `Codex` / `codex`  **** Claude  `Claude Code`Codex  `Codex` `codex`  `Agent.provider === 'codex'` Claude
 * - allowedTools / disallowedTools Agent `undefined`
 * - nickname / animal `parseSoulContent`  `Agent.personality`
 */
export function serializeIdentityFromParsed(parsed: ParsedIdentity): string {
  const providerYaml = formatIdentityProviderYamlValue(parsed.provider)
  const lines: string[] = [
    `name: ${parsed.name}`,
    `description: ${parsed.description}`,
    `nickname: ${parsed.nickname}`,
    `animal: ${parsed.animal}`,
    `provider: ${providerYaml}`,
  ]

  if (parsed.allowedTools.length > 0) {
    lines.push('allowedTools:')
    parsed.allowedTools.forEach((t) => lines.push(`  - ${t}`))
  } else {
    lines.push('allowedTools: []')
  }

  if (parsed.disallowedTools.length > 0) {
    lines.push('disallowedTools:')
    parsed.disallowedTools.forEach((t) => lines.push(`  - ${t}`))
  } else {
    lines.push('disallowedTools: []')
  }

  return lines.join('\n')
}

export function buildIdentityContent(agent: Agent, isNew: boolean): string {
  if (isNew) {
    return serializeIdentityFromParsed({
      name: '',
      icon: '🤖',
      description: '',
      nickname: '',
      animal: '',
      provider: 'claude',
      allowedTools: [],
      disallowedTools: [],
    })
  }
  return serializeIdentityFromParsed({
    name: agent.name,
    icon: agent.icon || '🤖',
    description: agent.description || '',
    nickname: agent.personality?.nickname || '',
    animal: agent.personality?.animal || '',
    provider: agent.provider === 'codex' ? 'codex' : 'claude',
    allowedTools: [...(agent.allowedTools || [])],
    disallowedTools: [...(agent.disallowedTools || [])],
  })
}

export const getIdentityParseWarnings = (content: string): string[] => {
  const hits: string[] = []
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    if (/^-\s/.test(trimmed)) continue
    const m = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:/)
    if (!m) continue
    const key = m[1]
    if (!IDENTITY_TOP_LEVEL_KEYS_LOWER.has(key.toLowerCase())) {
      hits.push(i18n.t('agents:tools.unrecognizedField', { key }))
    }
  }
  return [...new Set(hits)]
}

export function buildSoulContent(agent: Agent, isNew: boolean): string {
  if (isNew) {
    return [
      '## Personality',
      'Describe the agent personality traits and behavior style...',
      '',
      '## Tone',
      'casual — communicate in a relaxed natural tone',
      '',
      '## Verbosity',
      'moderate — describe key steps and results adequately',
      '',
      '## Collaboration Style',
      'When collaborating with other agents, address them by short name.',
    ].join('\n')
  }

  const p = agent.personality
  if (!p) {
    return [
      '## Personality',
      '',
      '## Tone',
      'casual — communicate in a relaxed natural tone',
      '',
      '## Verbosity',
      'moderate — describe key steps and results adequately',
      '',
      '## Collaboration Style',
      'When collaborating with other agents, address them by short name.',
    ].join('\n')
  }

  const toneLabel: Record<string, string> = {
    formal: 'formal — use a formal, professional tone',
    casual: 'casual — communicate in a relaxed natural tone',
    playful: 'playful — communicate with a lively and fun tone',
  }
  const verbosityLabel: Record<string, string> = {
    concise: 'concise — clarify key steps and outputs without elaboration',
    moderate: 'moderate — describe key steps and results adequately',
    detailed: 'detailed — explain thought process and each step in detail',
  }

  return [
    '## Personality',
    p.persona || `${p.nickname || agent.name}`,
    '',
    '## Tone',
    toneLabel[p.tone] || p.tone,
    '',
    '## Verbosity',
    verbosityLabel[p.verbosity] || p.verbosity,
    '',
    '## Collaboration Style',
    'When collaborating with other agents, address them by short name.',
  ].join('\n')
}

export interface ParsedIdentity {
  name: string
  icon: string
  description: string
  nickname: string
  animal: string
  provider: string
  allowedTools: string[]
  disallowedTools: string[]
}

export function parseIdentityContent(content: string): ParsedIdentity {
  const result: ParsedIdentity = {
    name: '', icon: '🤖', description: '', nickname: '',
    animal: '', provider: 'claude', allowedTools: [], disallowedTools: [],
  }
  let currentListKey: 'allowedTools' | 'disallowedTools' | null = null

  for (const line of content.split('\n')) {
    const listItem = line.match(/^\s+-\s+(.*)/)
    if (listItem && currentListKey) {
      result[currentListKey].push(listItem[1].trim())
      continue
    }
    currentListKey = null

    const colonIdx = line.indexOf(':')
    if (colonIdx < 0) continue
    const key = line.slice(0, colonIdx).trim()
    const val = line.slice(colonIdx + 1).trimStart()

    const keyNorm = key.toLowerCase()
    if (keyNorm === 'name') result.name = val
    else if (keyNorm === 'emoji') result.icon = val || '🤖'
    else if (keyNorm === 'description') result.description = val
    else if (keyNorm === 'nickname') result.nickname = val
    else if (keyNorm === 'animal') result.animal = val
    else if (keyNorm === 'provider') {
      const trimmed = val.trim()
      const resolved = parseIdentityProviderField(trimmed)
      result.provider = resolved ?? trimmed
    }
    else if (keyNorm === 'allowedtools') { if (val === '[]') result.allowedTools = []; else currentListKey = 'allowedTools' }
    else if (keyNorm === 'disallowedtools') { if (val === '[]') result.disallowedTools = []; else currentListKey = 'disallowedTools' }
  }

  return result
}

const identityMdHasTopLevelKey = (content: string, keyLower: string): boolean => {
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    if (/^-\s/.test(trimmed)) continue
    const m = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:/)
    if (m && m[1].toLowerCase() === keyLower) return true
  }
  return false
}

function parseSoulContent(content: string): import('../types/agentConfig').AgentPersonality | undefined {
  const sectionMap: Record<string, string> = {}
  let currentSection = ''

  for (const line of content.split('\n')) {
    if (line.startsWith('## ')) {
      currentSection = line.slice(3).trim()
      sectionMap[currentSection] = ''
    } else if (currentSection) {
      const prev = sectionMap[currentSection]
      sectionMap[currentSection] = prev ? `${prev}\n${line}` : line
    }
  }

  const toneText = (sectionMap['tone'] || '').trim()
  let tone: import('../types/agentConfig').AgentPersonality['tone'] = 'casual'
  if (toneText.startsWith('formal')) tone = 'formal'
  else if (toneText.startsWith('playful')) tone = 'playful'

  const verbosityText = (sectionMap['verbosity'] || '').trim()
  let verbosity: import('../types/agentConfig').AgentPersonality['verbosity'] = 'moderate'
  if (verbosityText.startsWith('concise')) verbosity = 'concise'
  else if (verbosityText.startsWith('detailed')) verbosity = 'detailed'

  const persona = (sectionMap['persona'] || '').trim()
  if (!persona && tone === 'casual' && verbosity === 'moderate') return undefined

  return { nickname: '', animal: '', emoji: '', tone, verbosity, persona }
}

// ── Hook ──

const useAgentEditor = () => {
  const { t } = useTranslation(['agents'])
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const isNew = id === 'new'

  const [agent, setAgent] = useState<Agent>(createEmptyAgent)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [skills, setSkills] = useState<SkillDefinition[]>([])
  const [cloneModalOpen, setCloneModalOpen] = useState(false)
  const [cloneName, setCloneName] = useState('')
  const [hireTeamPrompt, setHireTeamPrompt] = useState<{ id: string; name: string } | null>(null)
  const [hireTeamSubmitting, setHireTeamSubmitting] = useState(false)
  const hireTeamDialogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const newAgentPrefillConsumedRef = useRef(false)

  const clearHireTeamDialogTimer = useCallback(() => {
    if (hireTeamDialogTimerRef.current) {
      clearTimeout(hireTeamDialogTimerRef.current)
      hireTeamDialogTimerRef.current = null
    }
  }, [])

  useEffect(() => () => clearHireTeamDialogTimer(), [clearHireTeamDialogTimer])
  const [activeTab, setActiveTab] = useState<EditorTab>('IDENTITY.md')

  const [identityMd, setIdentityMd] = useState(() => buildIdentityContent(createEmptyAgent(), true))
  const [agentsMd, setAgentsMd] = useState('')
  const [soulMd, setSoulMd] = useState(() => buildSoulContent(createEmptyAgent(), true))

  const isReadonly = agent.source === 'builtin' && !isNew

  const fetchAgent = useCallback(async () => {
    if (isNew) return
    setLoading(true)
    try {
      const res = await authFetch(`${API_BASE}/api/agents/${encodeURIComponent(id!)}`)
      if (!res.ok) throw new Error('Agent not found')
      const data: Agent = await res.json()
      setAgent(data)
      setAgentsMd(data.systemPrompt?.content || '')
      setIdentityMd(buildIdentityContent(data, false))
      setSoulMd(buildSoulContent(data, false))
    } catch {
      toast.error('Failed to load agent')
      navigate('/agents')
    } finally {
      setLoading(false)
    }
  }, [id, isNew, navigate])

  const fetchSkills = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/api/skills`)
      if (res.ok) setSkills(await res.json())
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { fetchAgent() }, [fetchAgent])
  useEffect(() => { fetchSkills() }, [fetchSkills])

  useEffect(() => {
    if (!isNew) newAgentPrefillConsumedRef.current = false
  }, [isNew])

  /**
   *  AGENTS.md /agents/new/edit  location.state
   */
  useEffect(() => {
    if (!isNew || newAgentPrefillConsumedRef.current) return
    const raw = (location.state as AgentNewEditLocationState | null)?.[AGENT_NEW_PREFILL_AGENTS_STATE_KEY]
    if (typeof raw !== 'string' || !raw.trim()) return
    newAgentPrefillConsumedRef.current = true
    setAgentsMd(raw)
    setDirty(true)
    setActiveTab('AGENTS.md')
    navigate('/agents/new/edit', { replace: true, state: {} })
  }, [isNew, location.state, navigate])

  const updateIdentityMd = (v: string) => { setIdentityMd(v); setDirty(true) }
  const updateAgentsMd = (v: string) => { setAgentsMd(v); setDirty(true) }
  const updateSoulMd = (v: string) => { setSoulMd(v); setDirty(true) }

  const handleSave = async (): Promise<{ id: string; isNew: boolean } | null> => {
    setSaving(true)
    try {
      const parsed = parseIdentityContent(identityMd)
      const soul = parseSoulContent(soulMd)
      const hasEmojiKey = identityMdHasTopLevelKey(identityMd, 'emoji')
      const hasAnimalKey = identityMdHasTopLevelKey(identityMd, 'animal')
      const resolvedIcon = hasEmojiKey ? (parsed.icon || '🤖') : (agent.icon || '🤖')
      const personalityMerged = soul
        ? {
            ...soul,
            nickname: parsed.nickname,
            animal: hasAnimalKey ? parsed.animal : (agent.personality?.animal ?? ''),
            emoji: hasEmojiKey ? (parsed.icon || '🤖') : (agent.personality?.emoji ?? resolvedIcon),
          }
        : undefined

      const agentData: Agent = {
        ...agent,
        name: parsed.name || agent.name,
        icon: resolvedIcon,
        description: parsed.description,
        provider: agentProviderFromIdentityField(parsed.provider),
        allowedTools: parsed.allowedTools.length > 0 ? parsed.allowedTools : undefined,
        disallowedTools: parsed.disallowedTools.length > 0 ? parsed.disallowedTools : undefined,
        personality: personalityMerged,
        systemPrompt: { mode: 'append', content: agentsMd },
        updatedAt: new Date().toISOString(),
      }

      if (isNew) {
        agentData.id = ''
        agentData.source = 'user'
        agentData.createdAt = new Date().toISOString()

        if (!agentData.name.trim()) throw new Error(i18n.t('agents:save.nameRequired'))

        const res = await authFetch(`${API_BASE}/api/agents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(agentData),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to save')
        }
        const { agent: saved } = await res.json()
        toast.success('Agent saved')
        setDirty(false)
        navigate(`/agents/${encodeURIComponent(saved.id)}/edit`, { replace: true })
        clearHireTeamDialogTimer()
        const savedId = saved.id
        const savedName = saved.name || i18n.t('agents:save.unnamed')
        hireTeamDialogTimerRef.current = setTimeout(() => {
          hireTeamDialogTimerRef.current = null
          setHireTeamPrompt({ id: savedId, name: savedName })
        }, HIRE_TEAM_DIALOG_DELAY_MS)
        return { id: savedId, isNew: true }
      } else {
        const res = await authFetch(`${API_BASE}/api/agents/${encodeURIComponent(id!)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(agentData),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to update')
        }
        const { agent: updated } = await res.json()
        setAgent(updated)
        toast.success('Agent saved')
        setDirty(false)
        return { id: updated.id, isNew: false }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save agent')
      return null
    } finally {
      setSaving(false)
    }
  }

  const handleClone = async () => {
    if (!cloneName.trim()) return
    try {
      const res = await fetch(
        `${API_BASE}/api/agents/${encodeURIComponent(agent.id)}/clone`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: cloneName.trim() }),
        },
      )
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || 'Failed to clone')
        return
      }
      const cloned = await res.json()
      toast.success('Agent cloned')
      setCloneModalOpen(false)
      navigate(`/agents/${encodeURIComponent(cloned.id)}/edit`)
    } catch {
      toast.error('Failed to clone agent')
    }
  }

  const handleOpenCloneModal = () => {
    setCloneName(`${agent.name}-copy`)
    setCloneModalOpen(true)
  }

  const dismissHireTeamDialog = useCallback(() => {
    clearHireTeamDialogTimer()
    setHireTeamPrompt(null)
  }, [clearHireTeamDialogTimer])

  const confirmHireTeam = useCallback(async () => {
    if (!hireTeamPrompt) return
    setHireTeamSubmitting(true)
    try {
      const idsBefore = await getHiredAgentIds()
      const wasInTeam = idsBefore.includes(hireTeamPrompt.id)
      await hireAgent(hireTeamPrompt.id)
      toast.success(
        wasInTeam
          ? t('agents:hireTeamToast.alreadyInRoster')
          : t('agents:hireTeamToast.enlisted', { name: hireTeamPrompt.name }),
      )
      setHireTeamPrompt(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('agents:hireTeamToast.failed'))
    } finally {
      setHireTeamSubmitting(false)
    }
  }, [hireTeamPrompt, t])

  return {
    agent,
    loading,
    saving,
    dirty,
    skills,
    isNew,
    isReadonly,
    identityMd,
    agentsMd,
    soulMd,
    activeTab,
    setActiveTab,
    cloneModalOpen,
    cloneName,
    setCloneModalOpen,
    setCloneName,
    updateIdentityMd,
    updateAgentsMd,
    updateSoulMd,
    handleSave,
    handleClone,
    handleOpenCloneModal,
    hireTeamPrompt,
    hireTeamSubmitting,
    dismissHireTeamDialog,
    confirmHireTeam,
  }
}

export default useAgentEditor
