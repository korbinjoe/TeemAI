import { describe, it, expect, vi } from 'vitest'
import { ConfigCompiler } from '../runtime/ConfigCompiler'
import { MemoryGrowthCapture } from '../services/agent-evolution/MemoryGrowthCapture'
import type { Agent, AgentMemory } from '../config/types'
import type { SkillManager } from '../config/SkillManager'
import type { HooksConfigManager } from '../runtime/HooksConfigManager'
import type { MemoryStore } from '../stores/MemoryStore'
import type { WhiteboardEntry } from '../../shared/whiteboard-types'

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'fullstack-engineer',
    name: 'Fullstack Engineer',
    description: 'test',
    icon: 'T',
    systemPrompt: { mode: 'append', content: 'Base prompt' },
    tags: [],
    source: 'builtin',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeMemory(overrides: Partial<AgentMemory>): AgentMemory {
  return {
    id: 'memory-1',
    agentId: 'fullstack-engineer',
    category: 'context',
    content: 'Use the service boundary from the prior decision.',
    source: 'wb:chat-1:entry-1',
    importance: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('self-evolution signal wiring', () => {
  it('captures whiteboard memory under canonical agent id', () => {
    const create = vi.fn()
    const memoryStore = {
      listAllSources: () => [],
      create,
    } as unknown as MemoryStore
    const registry = {
      get: (id: string) => id === 'fullstack-engineer' ? { id } : undefined,
      list: () => [{ id: 'fullstack-engineer' }],
    }
    const capture = new MemoryGrowthCapture(memoryStore, {} as never, registry as never)

    const entry: WhiteboardEntry = {
      id: 'entry-1',
      chatId: 'chat-1',
      seq: 1,
      type: 'decision',
      by: 'fullstack-engineer:auto',
      summary: 'Use the service boundary from the prior decision.',
      status: 'active',
      timestamp: new Date().toISOString(),
    }

    capture.onWhiteboardEntry('chat-1', entry)

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      agentId: 'fullstack-engineer',
      source: 'wb:chat-1:entry-1',
    }))
  })

  it('injects prompt memory by agent.id before legacy agent.name fallback', async () => {
    const skillManager = {
      listSkills: () => [],
      getSkill: () => undefined,
      getSkillDir: () => undefined,
    } as unknown as SkillManager
    const hooksConfigManager = {
      writeConfig: vi.fn(async () => '/tmp/teemai-test-settings.json'),
      cleanup: vi.fn(async () => undefined),
    } as unknown as HooksConfigManager
    const memoryByAgent = new Map<string, AgentMemory[]>([
      ['fullstack-engineer', [makeMemory({ id: 'canonical-memory', content: 'Canonical decision.' })]],
      ['Fullstack Engineer', [makeMemory({ id: 'legacy-memory', agentId: 'Fullstack Engineer', source: 'wb:chat-1:entry-2', content: 'Legacy display-name decision.' })]],
    ])
    const memoryStore = {
      getForPromptInjection: vi.fn((agentId: string) => memoryByAgent.get(agentId) ?? []),
    } as unknown as MemoryStore

    const compiler = new ConfigCompiler(skillManager, hooksConfigManager, memoryStore)
    const compiled = await compiler.compile(
      makeAgent(),
      { repositories: [{ path: process.cwd() }], serverPort: 1234 },
      'claude',
    )

    const promptIdx = compiled.args.indexOf('--append-system-prompt')
    expect(promptIdx).toBeGreaterThanOrEqual(0)
    const prompt = compiled.args[promptIdx + 1]
    expect(prompt).toContain('Canonical decision.')
    expect(prompt).toContain('Legacy display-name decision.')
    expect(memoryStore.getForPromptInjection).toHaveBeenNthCalledWith(1, 'fullstack-engineer', 20)
    expect(memoryStore.getForPromptInjection).toHaveBeenNthCalledWith(2, 'Fullstack Engineer', 20)

    await compiled.cleanup()
  })

  it('bumps skill use when a skill is injected into the prompt', async () => {
    const skillManager = {
      listSkills: () => [],
      getSkill: (name: string) => name === 'api-integrator'
        ? { name, description: 'API', content: 'Use {SKILL_DIR}/scripts/run.sh', enabled: true, source: 'builtin' as const }
        : undefined,
      getSkillDir: (name: string) => name === 'api-integrator' ? '/tmp/api-integrator' : undefined,
    } as unknown as SkillManager
    const hooksConfigManager = {
      writeConfig: vi.fn(async () => '/tmp/teemai-test-settings.json'),
      cleanup: vi.fn(async () => undefined),
    } as unknown as HooksConfigManager
    const bumpUse = vi.fn()
    const compiler = new ConfigCompiler(
      skillManager,
      hooksConfigManager,
      undefined,
      undefined,
      undefined,
      undefined,
      { bumpUse } as never,
    )

    const compiled = await compiler.compile(
      makeAgent({ skills: ['api-integrator'] }),
      { repositories: [{ path: process.cwd() }], serverPort: 1234 },
      'claude',
    )

    expect(bumpUse).toHaveBeenCalledWith('api-integrator')
    await compiled.cleanup()
  })

  it('injects prior similar episodes when episodic retrieval finds matches', async () => {
    const skillManager = {
      listSkills: () => [],
      getSkill: () => undefined,
      getSkillDir: () => undefined,
    } as unknown as SkillManager
    const hooksConfigManager = {
      writeConfig: vi.fn(async () => '/tmp/teemai-test-settings.json'),
      cleanup: vi.fn(async () => undefined),
    } as unknown as HooksConfigManager
    const episodicMemoryService = {
      search: vi.fn(() => [{
        id: 'ep-1',
        agentId: 'fullstack-engineer',
        missionId: 'mission-1',
        title: 'Implemented OAuth callback validation',
        summary: 'Validate provider state before token exchange.',
        outcome: 'success',
        tags: ['auth'],
        files: ['server/routes/auth.ts'],
        startedAt: '2026-06-10T00:00:00.000Z',
        completedAt: '2026-06-10T00:00:00.000Z',
        score: 10,
      }]),
    }
    const compiler = new ConfigCompiler(
      skillManager,
      hooksConfigManager,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      episodicMemoryService as never,
    )

    const compiled = await compiler.compile(
      makeAgent({ description: 'Implement OAuth callback validation' }),
      { repositories: [{ path: process.cwd() }], serverPort: 1234 },
      'claude',
    )

    const promptIdx = compiled.args.indexOf('--append-system-prompt')
    const prompt = compiled.args[promptIdx + 1]
    expect(prompt).toContain('## Prior Similar Episodes')
    expect(prompt).toContain('Implemented OAuth callback validation')
    expect(episodicMemoryService.search).toHaveBeenCalledWith('fullstack-engineer', expect.any(String), 3)
    await compiled.cleanup()
  })
})
