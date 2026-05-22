/**
 * agentWorkspaceSync —  Agent  OpenClaw workspace
 *
 *  Agent  ~/.openteam/agents/{id}/ AGENTS.md / IDENTITY.md / SOUL.md
 *  ~/.openteam/openteam.json  AgentRegistry  OpenClaw
 */

import { join } from 'path'
import { mkdir, writeFile, rm, readFile } from 'fs/promises'
import type { Agent } from '../config/types'
import { OPENTEAM_HOME } from '../config/paths'
import { createLogger } from '../lib/logger'

const log = createLogger('AgentWorkspaceSync')

const USER_CONFIG_PATH = join(OPENTEAM_HOME, 'openteam.json')
const AGENTS_DIR = join(OPENTEAM_HOME, 'agents')

interface UserAgentEntry {
  id: string
  name: string
  description?: string
  allowedTools?: string[]
  disallowedTools?: string[]
  skills?: string[]
  subAgentNames?: string[]
  provider?: string
  mcpServers?: Record<string, unknown>
}

interface UserConfig {
  agents: { list: UserAgentEntry[] }
}

async function readUserConfig(): Promise<UserConfig> {
  try {
    const raw = await readFile(USER_CONFIG_PATH, 'utf-8')
    return JSON.parse(raw) as UserConfig
  } catch {
    return { agents: { list: [] } }
  }
}

async function writeUserConfig(config: UserConfig): Promise<void> {
  await writeFile(USER_CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8')
}

function buildIdentityMd(agent: Agent): string {
  const lines: string[] = []
  lines.push(`name: ${agent.name}`)
  if (agent.icon) lines.push(`emoji: ${agent.icon}`)
  if (agent.personality?.nickname) lines.push(`nickname: ${agent.personality.nickname}`)
  if (agent.personality?.animal) lines.push(`animal: ${agent.personality.animal}`)
  return lines.join('\n') + '\n'
}

function buildSoulMd(agent: Agent): string | null {
  const p = agent.personality
  if (!p) return null

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

  const lines: string[] = []
  lines.push('## Personality')
  lines.push(p.persona || `${p.nickname || agent.name}`)
  lines.push('')
  lines.push('## Tone')
  lines.push(toneLabel[p.tone] || p.tone)
  lines.push('')
  lines.push('## Verbosity')
  lines.push(verbosityLabel[p.verbosity] || p.verbosity)
  lines.push('')
  lines.push('## Collaboration Style')
  lines.push('When collaborating with other agents, address them by short name.')
  return lines.join('\n') + '\n'
}

function agentToConfigEntry(agent: Agent): UserAgentEntry {
  const entry: UserAgentEntry = {
    id: agent.id,
    name: agent.name,
  }
  if (agent.description) entry.description = agent.description
  if (agent.allowedTools?.length) entry.allowedTools = agent.allowedTools
  if (agent.disallowedTools?.length) entry.disallowedTools = agent.disallowedTools
  if (agent.skills?.length) entry.skills = agent.skills
  if (agent.subAgentNames?.length) entry.subAgentNames = agent.subAgentNames
  if (agent.provider && agent.provider !== 'claude') entry.provider = agent.provider
  if (agent.mcpServers && Object.keys(agent.mcpServers).length > 0) {
    entry.mcpServers = agent.mcpServers
  }
  return entry
}

/**
 *  Agent  workspace  + ~/.openteam/openteam.json
 *  source=user  agent builtin
 */
export const syncAgentToWorkspace = async (agent: Agent): Promise<void> => {
  if (agent.source === 'builtin') return

  const dir = join(AGENTS_DIR, agent.id)

  try {
    await mkdir(dir, { recursive: true })

    const writes: Promise<void>[] = [
      writeFile(join(dir, 'AGENTS.md'), (agent.systemPrompt?.content || '') + '\n', 'utf-8'),
      writeFile(join(dir, 'IDENTITY.md'), buildIdentityMd(agent), 'utf-8'),
    ]

    const soulMd = buildSoulMd(agent)
    if (soulMd) {
      writes.push(writeFile(join(dir, 'SOUL.md'), soulMd, 'utf-8'))
    }

    await Promise.all(writes)

    // Update ~/.openteam/openteam.json
    const config = await readUserConfig()
    const entry = agentToConfigEntry(agent)
    const idx = config.agents.list.findIndex((e) => e.id === agent.id)
    if (idx >= 0) {
      config.agents.list[idx] = entry
    } else {
      config.agents.list.push(entry)
    }
    await writeUserConfig(config)

    log.info('Synced agent to workspace', { agentId: agent.id, dir })
  } catch (err) {
    log.error('Failed to sync agent workspace', { agentId: agent.id, error: String(err) })
  }
}

/**
 *  Agent  workspace  + ~/.openteam/openteam.json
 */
export const removeAgentWorkspace = async (agentId: string): Promise<void> => {
  const dir = join(AGENTS_DIR, agentId)

  try {
    await rm(dir, { recursive: true, force: true })

    const config = await readUserConfig()
    config.agents.list = config.agents.list.filter((e) => e.id !== agentId)
    await writeUserConfig(config)

    log.info('Removed agent workspace', { agentId, dir })
  } catch (err) {
    log.error('Failed to remove agent workspace', { agentId, error: String(err) })
  }
}
