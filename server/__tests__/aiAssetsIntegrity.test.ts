import { mkdtemp, mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { describe, expect, it } from 'vitest'
import {
  toAiAssetsHealth,
  validateAiAssets,
} from '../../scripts/check-ai-assets-integrity.mjs'

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'teemai-ai-assets-'))
  await mkdir(join(root, 'ai-assets', 'skills'), { recursive: true })
  await mkdir(join(root, 'ai-assets', 'agents'), { recursive: true })
  return root
}

async function writeTeemaiConfig(root: string, agents: Array<Record<string, unknown>>) {
  await writeFile(
    join(root, 'teemai.json'),
    JSON.stringify({ agents: { list: agents } }, null, 2),
    'utf8',
  )
}

async function writeAgent(root: string, id: string) {
  const dir = join(root, 'ai-assets', 'agents', id)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'SOUL.md'), `Soul for ${id}\n`, 'utf8')
}

async function writeSkill(root: string, name: string) {
  const dir = join(root, 'ai-assets', 'skills', name)
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: test skill\n---\n\n# ${name}\n`,
    'utf8',
  )
}

describe('ai-assets integrity validator', () => {
  it('returns an empty report when all declared assets are present', async () => {
    const root = await createFixture()
    await writeTeemaiConfig(root, [
      { id: 'lead', skills: ['handoff', 'whiteboard'], subAgentNames: ['expert'] },
      { id: 'expert', skills: ['handoff'] },
    ])
    await writeAgent(root, 'lead')
    await writeAgent(root, 'expert')
    await writeSkill(root, 'handoff')
    await writeSkill(root, 'whiteboard')

    const report = validateAiAssets({ root })

    expect(report.missingSkills).toEqual([])
    expect(report.missingAgents).toEqual([])
    expect(report.malformedSkills).toEqual([])
    expect(toAiAssetsHealth(report)).toEqual({ status: 'ok', missing: [] })
  })

  it('reports a declared-but-missing skill with declaring agent ids', async () => {
    const root = await createFixture()
    await writeTeemaiConfig(root, [
      { id: 'lead', skills: ['handoff', 'workflow'] },
      { id: 'expert', skills: ['workflow'] },
    ])
    await writeAgent(root, 'lead')
    await writeAgent(root, 'expert')
    await writeSkill(root, 'workflow')

    const report = validateAiAssets({ root })

    expect(report.missingSkills).toEqual([
      { skill: 'handoff', declaredBy: ['lead'] },
    ])
    expect(toAiAssetsHealth(report).status).toBe('degraded')
  })

  it('reports a skill directory that is missing SKILL.md as malformed', async () => {
    const root = await createFixture()
    await writeTeemaiConfig(root, [
      { id: 'lead', skills: ['whiteboard'] },
    ])
    await writeAgent(root, 'lead')
    await mkdir(join(root, 'ai-assets', 'skills', 'whiteboard'), { recursive: true })

    const report = validateAiAssets({ root })

    expect(report.malformedSkills).toEqual([
      { skill: 'whiteboard', reason: 'directory exists but SKILL.md is missing' },
    ])
    expect(report.missingSkills).toEqual([
      { skill: 'whiteboard', declaredBy: ['lead'] },
    ])
  })
})

