import { cp, mkdir, readFile, stat, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { randomUUID } from 'crypto'
import { dirname, isAbsolute, join, resolve, sep } from 'path'
import { parse as parseYaml } from 'yaml'
import type { AgentPromptFile } from '../../stores/EvolutionReviewJobStore'
import type { EvolutionEventStore } from '../../stores/EvolutionEventStore'
import type { AgentRegistry } from '../../config/AgentRegistry'
import { TEEMAI_HOME } from '../../../shared/teemai-home'
import { canonicalAgentId } from '../../../shared/utils'

const AGENT_PROMPT_FILES = new Set<AgentPromptFile>(['IDENTITY.md', 'AGENTS.md', 'SOUL.md'])
const MAX_AGENT_PROMPT_FILE_BYTES = 256 * 1024

interface AgentEvolutionDeps {
  agentRegistry: Pick<AgentRegistry, 'get'>
  evolutionEventStore?: EvolutionEventStore
  snapshotDir?: string
}

interface PatchAgentFileParams {
  agentId: string
  filePath: AgentPromptFile
  find: string
  replace: string
  actor?: string
  sourceRef?: string
  evidence?: Record<string, unknown>
}

export class AgentEvolutionService {
  private snapshotDir: string

  constructor(private deps: AgentEvolutionDeps) {
    this.snapshotDir = deps.snapshotDir ?? join(TEEMAI_HOME, 'agents', '.teemai-snapshots')
  }

  async patchAgentFile(params: PatchAgentFileParams): Promise<{ filePath: string; rollbackRef: string }> {
    const agentId = this.resolveAgentId(params.agentId)
    const filePath = this.resolveAgentFile(agentId, params.filePath)
    const raw = await readFile(filePath, 'utf-8')
    const occurrences = raw.split(params.find).length - 1
    if (occurrences !== 1) throw new Error(`Patch match must be unique; found ${occurrences}`)

    const next = raw.replace(params.find, params.replace)
    if (params.filePath === 'IDENTITY.md') this.validateIdentity(next)

    const rollbackRef = await this.createRollbackSnapshot(agentId, 'patch')
    await this.writeFileChecked(filePath, next)
    this.recordEvolutionEvent({
      agentId,
      title: `Patched agent prompt: ${agentId}`,
      description: `Updated ${params.filePath} through approved evolution proposal.`,
      changedFile: filePath,
      rollbackRef,
      sourceRef: params.sourceRef,
      evidence: params.evidence,
    })
    return { filePath, rollbackRef }
  }

  private resolveAgentId(raw: string): string {
    const agentId = canonicalAgentId(raw, this.deps.agentRegistry)
    if (!agentId) throw new Error(`Unknown agent: ${raw}`)
    return agentId
  }

  private resolveAgentFile(agentId: string, filePath: AgentPromptFile): string {
    if (!AGENT_PROMPT_FILES.has(filePath)) throw new Error(`Unsupported agent prompt file: ${filePath}`)
    if (isAbsolute(filePath)) throw new Error('Agent prompt path must be relative')
    const agent = this.deps.agentRegistry.get(agentId)
    if (!agent?.workspaceDir) throw new Error(`Agent workspace not found: ${agentId}`)
    const root = resolve(agent.workspaceDir)
    const target = resolve(root, filePath)
    if (target !== root && !target.startsWith(root + sep)) {
      throw new Error('Agent prompt path escapes agent workspace')
    }
    return target
  }

  private async createRollbackSnapshot(agentId: string, reason: string): Promise<string> {
    const agent = this.deps.agentRegistry.get(agentId)
    if (!agent?.workspaceDir) throw new Error(`Agent workspace not found: ${agentId}`)
    const snapshotPath = join(this.snapshotDir, agentId, `${Date.now()}-${randomUUID()}`)
    await mkdir(snapshotPath, { recursive: true })
    if (existsSync(agent.workspaceDir)) {
      await cp(agent.workspaceDir, snapshotPath, { recursive: true })
    } else {
      await writeFile(join(snapshotPath, '.empty.json'), JSON.stringify({ agentId, reason, empty: true }, null, 2), 'utf-8')
    }
    return snapshotPath
  }

  private validateIdentity(content: string): void {
    const parsed = parseYaml(content) as Record<string, unknown> | null
    if (!parsed || typeof parsed.name !== 'string' || parsed.name.trim().length === 0) {
      throw new Error('IDENTITY.md must include name')
    }
  }

  private async writeFileChecked(filePath: string, content: string): Promise<void> {
    if (Buffer.byteLength(content, 'utf-8') > MAX_AGENT_PROMPT_FILE_BYTES) {
      throw new Error(`Agent prompt file exceeds ${MAX_AGENT_PROMPT_FILE_BYTES} bytes`)
    }
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, content, 'utf-8')
    const written = await stat(filePath)
    if (written.size > MAX_AGENT_PROMPT_FILE_BYTES) {
      throw new Error(`Agent prompt file exceeds ${MAX_AGENT_PROMPT_FILE_BYTES} bytes`)
    }
  }

  private recordEvolutionEvent(params: {
    agentId: string
    title: string
    description: string
    changedFile: string
    rollbackRef: string
    sourceRef?: string
    evidence?: Record<string, unknown>
  }): void {
    this.deps.evolutionEventStore?.record({
      agentId: params.agentId,
      type: 'strategy_evolved',
      title: params.title,
      description: params.description,
      changedFile: params.changedFile,
      rollbackRef: params.rollbackRef,
      sourceRef: params.sourceRef,
      evidence: params.evidence,
    })
  }
}
