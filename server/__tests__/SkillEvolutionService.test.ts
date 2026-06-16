import { describe, it, expect, afterEach, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { SkillEvolutionApprovalRequiredError, SkillEvolutionService } from '../services/agent-evolution/SkillEvolutionService'
import type { SkillEvolutionRecord, SkillEvolutionStore } from '../stores/SkillEvolutionStore'

const validSkillMd = (name = 'agent-skill') => `---
name: ${name}
description: Test skill
---

# ${name}
Old body.
`

const makeStore = (records: SkillEvolutionRecord[] = []) => {
  const map = new Map(records.map((record) => [record.skillName, record]))
  return {
    get: vi.fn((name: string) => map.get(name)),
    upsert: vi.fn((params: { skillName: string; source: SkillEvolutionRecord['source']; path: string; sourceHash?: string; createdBy?: string; updatedBy?: string }) => {
      const now = new Date().toISOString()
      map.set(params.skillName, {
        skillName: params.skillName,
        source: params.source,
        path: params.path,
        sourceHash: params.sourceHash,
        createdBy: params.createdBy,
        updatedBy: params.updatedBy,
        createdAt: now,
        updatedAt: now,
        useCount: 0,
        viewCount: 0,
        patchCount: 0,
        pinned: false,
      })
    }),
    bumpPatch: vi.fn(),
    setArchived: vi.fn(),
    setPinned: vi.fn(),
  } as unknown as SkillEvolutionStore
}

const record = (skillName: string, source: SkillEvolutionRecord['source'], path: string): SkillEvolutionRecord => ({
  skillName,
  source,
  path,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  useCount: 0,
  viewCount: 0,
  patchCount: 0,
  pinned: false,
})

describe('SkillEvolutionService', () => {
  const tempRoots: string[] = []

  afterEach(() => {
    for (const dir of tempRoots.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  const setupSkill = (source: SkillEvolutionRecord['source'] = 'agent') => {
    const root = mkdtempSync(join(tmpdir(), 'teemai-skill-evolution-'))
    tempRoots.push(root)
    const skillsDir = join(root, 'skills')
    const skillDir = join(skillsDir, 'agent-skill')
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(join(skillDir, 'SKILL.md'), validSkillMd(), 'utf-8')
    const store = makeStore([record('agent-skill', source, skillDir)])
    const service = new SkillEvolutionService({ skillsDir, store })
    return { root, skillsDir, skillDir, store, service }
  }

  it('creates agent skills with valid frontmatter and telemetry', async () => {
    const root = mkdtempSync(join(tmpdir(), 'teemai-skill-create-'))
    tempRoots.push(root)
    const skillsDir = join(root, 'skills')
    const store = makeStore()
    const service = new SkillEvolutionService({ skillsDir, store })

    const result = await service.createSkill({
      name: 'new-skill',
      description: 'New skill',
      body: '# New skill',
      createdBy: 'sensei',
    })

    expect(existsSync(join(skillsDir, 'new-skill', 'SKILL.md'))).toBe(true)
    expect(result.rollbackRef).toContain('.teemai-snapshots')
    expect(store.upsert).toHaveBeenCalledWith(expect.objectContaining({
      skillName: 'new-skill',
      source: 'agent',
      createdBy: 'sensei',
    }))
    expect(store.bumpPatch).toHaveBeenCalledWith('new-skill')
  })

  it('rejects bundled skill mutation without approval', async () => {
    const { service, skillDir } = setupSkill('bundled')

    await expect(service.writeSkillFile({
      skillName: 'agent-skill',
      filePath: 'SKILL.md',
      content: validSkillMd(),
    })).rejects.toBeInstanceOf(SkillEvolutionApprovalRequiredError)

    expect(readFileSync(join(skillDir, 'SKILL.md'), 'utf-8')).toContain('Old body.')
  })

  it('rejects path traversal', async () => {
    const { service } = setupSkill('agent')

    await expect(service.writeSkillFile({
      skillName: 'agent-skill',
      filePath: '../outside.md',
      content: 'bad',
      approved: true,
    })).rejects.toThrow(/escapes skill directory/)
  })

  it('rejects invalid SKILL.md frontmatter', async () => {
    const { service } = setupSkill('agent')

    await expect(service.writeSkillFile({
      skillName: 'agent-skill',
      filePath: 'SKILL.md',
      content: '---\ndescription: Missing name\n---\nBody',
      approved: true,
    })).rejects.toThrow(/frontmatter must include name/)
  })

  it('rejects oversized skill files', async () => {
    const { service } = setupSkill('agent')

    await expect(service.writeSkillFile({
      skillName: 'agent-skill',
      filePath: 'references/large.md',
      content: 'x'.repeat(300 * 1024),
      approved: true,
    })).rejects.toThrow(/exceeds/)
  })

  it('creates rollback snapshot before patching', async () => {
    const { service, skillDir, store } = setupSkill('agent')

    const result = await service.patchSkill({
      skillName: 'agent-skill',
      find: 'Old body.',
      replace: 'New body.',
      approved: true,
    })

    expect(readFileSync(join(skillDir, 'SKILL.md'), 'utf-8')).toContain('New body.')
    expect(readFileSync(join(result.rollbackRef, 'SKILL.md'), 'utf-8')).toContain('Old body.')
    expect(store.bumpPatch).toHaveBeenCalledWith('agent-skill')
  })

  it('archives, restores, and pins through lifecycle store methods', async () => {
    const { service, skillDir, store } = setupSkill('agent')

    const archived = await service.archiveSkill('agent-skill', { approved: true })
    expect(existsSync(skillDir)).toBe(false)
    expect(existsSync(archived.archivePath)).toBe(true)
    expect(store.setArchived).toHaveBeenCalledWith('agent-skill', true)

    await service.restoreSkill('agent-skill', archived.archivePath, { approved: true })
    expect(existsSync(skillDir)).toBe(true)
    expect(store.setArchived).toHaveBeenCalledWith('agent-skill', false)

    await service.pinSkill('agent-skill', true)
    expect(store.setPinned).toHaveBeenCalledWith('agent-skill', true)
  })
})
