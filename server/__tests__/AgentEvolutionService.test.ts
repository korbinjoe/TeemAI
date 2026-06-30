import { describe, it, expect, afterEach, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { AgentEvolutionService } from '../services/agent-evolution/AgentEvolutionService'

const makeRegistry = (workspaceDir: string) => ({
  get: vi.fn((id: string) => id === 'lead' ? {
    id: 'lead',
    name: 'Lead',
    description: '',
    icon: '',
    systemPrompt: { mode: 'append' as const, content: '' },
    skills: [],
    mcpServers: {},
    workspaceDir,
  } : undefined),
})

describe('AgentEvolutionService', () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  })

  const setup = () => {
    const root = mkdtempSync(join(tmpdir(), 'teemai-agent-evolution-'))
    roots.push(root)
    const workspaceDir = join(root, 'agents', 'lead')
    mkdirSync(workspaceDir, { recursive: true })
    writeFileSync(join(workspaceDir, 'IDENTITY.md'), 'name: Lead\nnickname: Lead\n', 'utf-8')
    writeFileSync(join(workspaceDir, 'SOUL.md'), 'Old instruction.\n', 'utf-8')
    writeFileSync(join(workspaceDir, 'AGENTS.md'), 'Agent notes.\n', 'utf-8')
    const eventStore = { record: vi.fn() }
    const service = new AgentEvolutionService({
      agentRegistry: makeRegistry(workspaceDir) as never,
      evolutionEventStore: eventStore as never,
      snapshotDir: join(root, 'snapshots'),
    })
    return { root, workspaceDir, eventStore, service }
  }

  it('patches allowed agent prompt files with snapshot and event', async () => {
    const { workspaceDir, eventStore, service } = setup()

    const result = await service.patchAgentFile({
      agentId: 'lead',
      filePath: 'SOUL.md',
      find: 'Old instruction.',
      replace: 'New instruction.',
      sourceRef: 'review:1',
    })

    expect(readFileSync(join(workspaceDir, 'SOUL.md'), 'utf-8')).toContain('New instruction.')
    expect(readFileSync(join(result.rollbackRef, 'SOUL.md'), 'utf-8')).toContain('Old instruction.')
    expect(eventStore.record).toHaveBeenCalledWith(expect.objectContaining({
      agentId: 'lead',
      type: 'strategy_evolved',
      changedFile: result.filePath,
      rollbackRef: result.rollbackRef,
      sourceRef: 'review:1',
    }))
  })

  it('rejects unsupported files and non-unique matches', async () => {
    const { service } = setup()

    await expect(service.patchAgentFile({
      agentId: 'lead',
      filePath: '../outside.md' as never,
      find: 'x',
      replace: 'y',
    })).rejects.toThrow(/Unsupported agent prompt file/)

    await expect(service.patchAgentFile({
      agentId: 'lead',
      filePath: 'SOUL.md',
      find: 'missing',
      replace: 'new',
    })).rejects.toThrow(/unique/)
  })

  it('rejects invalid identity yaml and keeps original content', async () => {
    const { workspaceDir, service } = setup()

    await expect(service.patchAgentFile({
      agentId: 'lead',
      filePath: 'IDENTITY.md',
      find: 'name: Lead\nnickname:',
      replace: 'nickname: Broken\nnickname:',
    })).rejects.toThrow(/Map keys|must include name/)

    expect(readFileSync(join(workspaceDir, 'IDENTITY.md'), 'utf-8')).toContain('name: Lead')
  })

  it('rejects unknown agents without creating snapshots', async () => {
    const { root, service } = setup()

    await expect(service.patchAgentFile({
      agentId: 'unknown',
      filePath: 'SOUL.md',
      find: 'Old',
      replace: 'New',
    })).rejects.toThrow(/Unknown agent/)

    expect(existsSync(join(root, 'snapshots', 'unknown'))).toBe(false)
  })
})
