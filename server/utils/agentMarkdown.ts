import { stringify as yamlStringify } from 'yaml'
import { parse as yamlParse } from 'yaml'
import type { Agent, AgentPersonality } from '../config/types'

/** Agent → Markdown（YAML frontmatter + body） */
export const agentToMarkdown = (agent: Agent): string => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meta: Record<string, any> = {
    name: agent.name,
    description: agent.description,
  }

  if (agent.provider && agent.provider !== 'claude') meta.provider = agent.provider
  if (agent.model) meta.model = agent.model
  if (agent.maxTurns) meta.maxTurns = agent.maxTurns
  if (agent.tags?.length) meta.tags = agent.tags

  if (agent.personality) {
    meta.personality = agent.personality
  }

  if (agent.skills?.length) meta.skills = agent.skills
  if (agent.subAgentNames?.length) meta.subAgentNames = agent.subAgentNames
  if (agent.allowedTools?.length) meta.allowedTools = agent.allowedTools
  if (agent.disallowedTools?.length) meta.disallowedTools = agent.disallowedTools

  if (agent.mcpServers && Object.keys(agent.mcpServers).length > 0) {
    meta.mcpServers = agent.mcpServers
  }

  if (agent.hooks) meta.hooks = agent.hooks

  const yaml = yamlStringify(meta, { lineWidth: 0 }).trimEnd()
  const body = agent.systemPrompt.content || ''

  return `---\n${yaml}\n---\n\n${body}\n`
}

/** Markdown → Agent  id/source/dates */
export const markdownToAgent = (markdown: string, base: Agent): Agent => {
  const fmMatch = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!fmMatch) {
    throw new Error('Invalid markdown: missing YAML frontmatter (---)')
  }

  const meta = yamlParse(fmMatch[1]) as Record<string, unknown>
  const body = fmMatch[2].trim()

  if (!meta.name || typeof meta.name !== 'string') {
    throw new Error('Frontmatter missing required field: name')
  }

  const rawP = meta.personality as Record<string, unknown> | undefined
  const personality: AgentPersonality | undefined = rawP?.nickname ? {
    nickname: String(rawP.nickname),
    animal: String(rawP.animal ?? ''),
    emoji: String(rawP.emoji ?? ''),
    tone: (['formal', 'casual', 'playful'].includes(String(rawP.tone)) ? String(rawP.tone) : 'casual') as AgentPersonality['tone'],
    verbosity: (['concise', 'moderate', 'detailed'].includes(String(rawP.verbosity)) ? String(rawP.verbosity) : 'moderate') as AgentPersonality['verbosity'],
    persona: String(rawP.persona ?? ''),
  } : undefined

  return {
    ...base,
    name: String(meta.name),
    description: String(meta.description ?? ''),
    provider: meta.provider === 'codex' ? 'codex' : undefined,
    model: meta.model ? String(meta.model) : undefined,
    maxTurns: typeof meta.maxTurns === 'number' ? meta.maxTurns : undefined,
    tags: Array.isArray(meta.tags) ? meta.tags.map(String) : [],
    personality,
    systemPrompt: { mode: base.systemPrompt.mode, content: body },
    skills: Array.isArray(meta.skills) ? meta.skills.map(String) : undefined,
    subAgentNames: Array.isArray(meta.subAgentNames) ? meta.subAgentNames.map(String) : undefined,
    allowedTools: Array.isArray(meta.allowedTools) ? meta.allowedTools.map(String) : undefined,
    disallowedTools: Array.isArray(meta.disallowedTools) ? meta.disallowedTools.map(String) : undefined,
    mcpServers: (meta.mcpServers as Agent['mcpServers']) ?? undefined,
    hooks: (meta.hooks as Agent['hooks']) ?? undefined,
    updatedAt: new Date().toISOString(),
  }
}
