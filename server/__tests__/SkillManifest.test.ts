import { describe, it, expect, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { SkillManager } from '../config/SkillManager'
import { WorkspaceSeeder } from '../services/WorkspaceSeeder'
import { readSkillManifest } from '../services/skillManifest'

const skillMd = (name: string, description = 'test skill') => `---
name: ${name}
description: ${description}
---

# ${name}
`

describe('skill runtime manifest', () => {
  const tempRoots: string[] = []

  afterEach(() => {
    for (const dir of tempRoots.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('classifies runtime skills as bundled when hashes match and user otherwise', async () => {
    const root = mkdtempSync(join(tmpdir(), 'teemai-skill-manifest-'))
    tempRoots.push(root)
    const bundledAssetsDir = join(root, 'bundled', 'ai-assets')
    const teemaiHome = join(root, 'home')

    mkdirSync(join(bundledAssetsDir, 'skills', 'whiteboard'), { recursive: true })
    writeFileSync(join(bundledAssetsDir, 'skills', 'whiteboard', 'SKILL.md'), skillMd('whiteboard'))
    mkdirSync(join(teemaiHome, 'skills', 'local-only'), { recursive: true })
    writeFileSync(join(teemaiHome, 'skills', 'local-only', 'SKILL.md'), skillMd('local-only'))

    await new WorkspaceSeeder(bundledAssetsDir, teemaiHome).seed()

    const manifest = await readSkillManifest(join(teemaiHome, 'skills'))
    expect(manifest?.bundled.whiteboard).toBeDefined()
    expect(manifest?.user['local-only']).toBeDefined()

    const skillManager = new SkillManager(join(teemaiHome, 'skills'), join(teemaiHome, 'hooks'))
    await skillManager.loadBuiltinSkills()

    expect(skillManager.getSkill('whiteboard')?.source).toBe('builtin')
    expect(skillManager.getSkill('whiteboard')?.evolutionSource).toBe('bundled')
    expect(skillManager.getSkill('local-only')?.source).toBe('custom')
    expect(skillManager.getSkill('local-only')?.evolutionSource).toBe('user')
  })
})
