import { cp, mkdir, readFile, rename, rm, stat, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { randomUUID } from 'crypto'
import { dirname, isAbsolute, join, resolve, sep } from 'path'
import { parse as parseYaml } from 'yaml'
import type { SkillEvolutionStore } from '../../stores/SkillEvolutionStore'
import type { EvolutionEventStore, EvolutionEventType } from '../../stores/EvolutionEventStore'
import type { SkillLifecycleSource } from '../skillManifest'

const MAX_SKILL_FILE_BYTES = 256 * 1024

export class SkillEvolutionApprovalRequiredError extends Error {
  constructor(
    public readonly skillName: string,
    public readonly source: SkillLifecycleSource,
    public readonly action: string,
  ) {
    super(`Approval required to ${action} ${source} skill: ${skillName}`)
    this.name = 'SkillEvolutionApprovalRequiredError'
  }
}

interface SkillEvolutionServiceDeps {
  skillsDir: string
  store: SkillEvolutionStore
  evolutionEventStore?: EvolutionEventStore
  snapshotDir?: string
}

interface MutationOptions {
  approved?: boolean
  actor?: string
}

export class SkillEvolutionService {
  private snapshotDir: string

  constructor(private deps: SkillEvolutionServiceDeps) {
    this.snapshotDir = deps.snapshotDir ?? join(deps.skillsDir, '.teemai-snapshots')
  }

  async createSkill(params: {
    name: string
    description: string
    body: string
    createdBy?: string
    approved?: boolean
  }): Promise<{ skillName: string; path: string; rollbackRef: string }> {
    this.assertValidSkillName(params.name)
    await this.requireApproval(params.name, 'create', params.approved)
    const skillDir = this.skillDir(params.name)
    const rollbackRef = await this.createRollbackSnapshot(params.name, 'create')
    await mkdir(skillDir, { recursive: true })
    const content = [
      '---',
      `name: ${params.name}`,
      `description: ${params.description}`,
      '---',
      '',
      params.body.trim(),
      '',
    ].join('\n')
    this.validateSkillMd(content)
    await this.writeFileChecked(join(skillDir, 'SKILL.md'), content)
    this.deps.store.upsert({
      skillName: params.name,
      source: 'agent',
      path: skillDir,
      createdBy: params.createdBy,
      updatedBy: params.createdBy,
    })
    this.deps.store.bumpPatch(params.name)
    this.recordEvolutionEvent({
      agentId: params.createdBy ?? 'sensei',
      type: 'skill_acquired',
      title: `Created skill ${params.name}`,
      description: params.description,
      changedFile: join(skillDir, 'SKILL.md'),
      rollbackRef,
    })
    return { skillName: params.name, path: skillDir, rollbackRef }
  }

  async patchSkill(params: {
    skillName: string
    filePath?: string
    find: string
    replace: string
  } & MutationOptions): Promise<{ filePath: string; rollbackRef: string }> {
    await this.requireApproval(params.skillName, 'patch', params.approved)
    const filePath = this.resolveSkillFile(params.skillName, params.filePath ?? 'SKILL.md')
    const raw = await readFile(filePath, 'utf-8')
    const occurrences = raw.split(params.find).length - 1
    if (occurrences !== 1) {
      throw new Error(`Patch match must be unique; found ${occurrences}`)
    }
    const next = raw.replace(params.find, params.replace)
    if ((params.filePath ?? 'SKILL.md') === 'SKILL.md') this.validateSkillMd(next)
    const rollbackRef = await this.createRollbackSnapshot(params.skillName, 'patch')
    await this.writeFileChecked(filePath, next)
    this.deps.store.bumpPatch(params.skillName)
    this.recordSkillPatchEvent(params.skillName, 'Patched skill file', filePath, rollbackRef, params.actor)
    return { filePath, rollbackRef }
  }

  async writeSkillFile(params: {
    skillName: string
    filePath: string
    content: string
  } & MutationOptions): Promise<{ filePath: string; rollbackRef: string }> {
    await this.requireApproval(params.skillName, 'write_file', params.approved)
    if (params.filePath === 'SKILL.md') this.validateSkillMd(params.content)
    const filePath = this.resolveSkillFile(params.skillName, params.filePath)
    const rollbackRef = await this.createRollbackSnapshot(params.skillName, 'write_file')
    await mkdir(dirname(filePath), { recursive: true })
    await this.writeFileChecked(filePath, params.content)
    this.deps.store.bumpPatch(params.skillName)
    this.recordSkillPatchEvent(params.skillName, 'Wrote skill file', filePath, rollbackRef, params.actor)
    return { filePath, rollbackRef }
  }

  async removeSkillFile(params: {
    skillName: string
    filePath: string
  } & MutationOptions): Promise<{ filePath: string; rollbackRef: string }> {
    if (params.filePath === 'SKILL.md') throw new Error('SKILL.md cannot be removed')
    await this.requireApproval(params.skillName, 'remove_file', params.approved)
    const filePath = this.resolveSkillFile(params.skillName, params.filePath)
    const rollbackRef = await this.createRollbackSnapshot(params.skillName, 'remove_file')
    await rm(filePath, { force: true })
    this.deps.store.bumpPatch(params.skillName)
    this.recordSkillPatchEvent(params.skillName, 'Removed skill file', filePath, rollbackRef, params.actor)
    return { filePath, rollbackRef }
  }

  async archiveSkill(skillName: string, options: MutationOptions = {}): Promise<{ archivePath: string; rollbackRef: string }> {
    await this.requireApproval(skillName, 'archive', options.approved)
    const rollbackRef = await this.createRollbackSnapshot(skillName, 'archive')
    const archivePath = join(this.deps.skillsDir, '.teemai-archive', `${skillName}-${Date.now()}`)
    await mkdir(dirname(archivePath), { recursive: true })
    await rename(this.skillDir(skillName), archivePath)
    this.deps.store.setArchived(skillName, true)
    this.recordSkillLifecycleEvent(skillName, 'Archived skill', archivePath, rollbackRef, options.actor)
    return { archivePath, rollbackRef }
  }

  async restoreSkill(skillName: string, archivePath: string, options: MutationOptions = {}): Promise<{ path: string; rollbackRef: string }> {
    await this.requireApproval(skillName, 'restore', options.approved)
    const rollbackRef = await this.createRollbackSnapshot(skillName, 'restore')
    const target = this.skillDir(skillName)
    await mkdir(dirname(target), { recursive: true })
    await rename(archivePath, target)
    this.deps.store.setArchived(skillName, false)
    this.recordSkillLifecycleEvent(skillName, 'Restored skill', target, rollbackRef, options.actor)
    return { path: target, rollbackRef }
  }

  async pinSkill(skillName: string, pinned: boolean, actor?: string): Promise<void> {
    this.deps.store.setPinned(skillName, pinned)
    this.recordEvolutionEvent({
      agentId: actor ?? 'sensei',
      type: 'milestone',
      title: pinned ? `Pinned skill ${skillName}` : `Unpinned skill ${skillName}`,
      description: pinned ? 'Skill excluded from curator archival.' : 'Skill returned to normal curator lifecycle.',
    })
  }

  private async requireApproval(skillName: string, action: string, approved?: boolean): Promise<void> {
    const existing = this.deps.store.get(skillName)
    if (!existing) return
    if ((existing.source === 'bundled' || existing.source === 'user') && !approved) {
      throw new SkillEvolutionApprovalRequiredError(skillName, existing.source, action)
    }
  }

  private async createRollbackSnapshot(skillName: string, reason: string): Promise<string> {
    this.assertValidSkillName(skillName)
    const snapshotPath = join(this.snapshotDir, skillName, `${Date.now()}-${randomUUID()}`)
    await mkdir(snapshotPath, { recursive: true })
    const sourceDir = this.skillDir(skillName)

    if (existsSync(sourceDir)) {
      await cp(sourceDir, snapshotPath, { recursive: true })
    } else {
      await writeFile(join(snapshotPath, '.empty.json'), JSON.stringify({ skillName, reason, empty: true }, null, 2), 'utf-8')
    }

    return snapshotPath
  }

  private skillDir(skillName: string): string {
    this.assertValidSkillName(skillName)
    return join(this.deps.skillsDir, skillName)
  }

  private resolveSkillFile(skillName: string, filePath: string): string {
    this.assertValidSkillName(skillName)
    if (!filePath || isAbsolute(filePath)) throw new Error('Skill file path must be relative')
    const root = resolve(this.skillDir(skillName))
    const target = resolve(root, filePath)
    if (target !== root && !target.startsWith(root + sep)) {
      throw new Error('Skill file path escapes skill directory')
    }
    return target
  }

  private async writeFileChecked(filePath: string, content: string): Promise<void> {
    if (Buffer.byteLength(content, 'utf-8') > MAX_SKILL_FILE_BYTES) {
      throw new Error(`Skill file exceeds ${MAX_SKILL_FILE_BYTES} bytes`)
    }
    await writeFile(filePath, content, 'utf-8')
    const written = await stat(filePath)
    if (written.size > MAX_SKILL_FILE_BYTES) {
      throw new Error(`Skill file exceeds ${MAX_SKILL_FILE_BYTES} bytes`)
    }
  }

  private validateSkillMd(content: string): void {
    const match = content.match(/^---\n([\s\S]*?)\n---\n/)
    if (!match) throw new Error('SKILL.md must include YAML frontmatter')
    const frontmatter = parseYaml(match[1]) as Record<string, unknown> | null
    if (!frontmatter?.name || typeof frontmatter.name !== 'string') {
      throw new Error('SKILL.md frontmatter must include name')
    }
    if (!frontmatter.description || typeof frontmatter.description !== 'string') {
      throw new Error('SKILL.md frontmatter must include description')
    }
  }

  private assertValidSkillName(name: string): void {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) {
      throw new Error(`Invalid skill name: ${name}`)
    }
  }

  private recordSkillPatchEvent(skillName: string, title: string, changedFile: string, rollbackRef: string, actor?: string): void {
    this.recordEvolutionEvent({
      agentId: actor ?? 'sensei',
      type: 'strategy_evolved',
      title: `${title}: ${skillName}`,
      description: `Updated controlled skill asset ${skillName}.`,
      changedFile,
      rollbackRef,
    })
  }

  private recordSkillLifecycleEvent(skillName: string, title: string, changedFile: string, rollbackRef: string, actor?: string): void {
    this.recordEvolutionEvent({
      agentId: actor ?? 'sensei',
      type: 'milestone',
      title: `${title}: ${skillName}`,
      description: `Updated lifecycle state for ${skillName}.`,
      changedFile,
      rollbackRef,
    })
  }

  private recordEvolutionEvent(params: {
    agentId: string
    type: EvolutionEventType
    title: string
    description: string
    changedFile?: string
    rollbackRef?: string
  }): void {
    this.deps.evolutionEventStore?.record({
      agentId: params.agentId,
      type: params.type,
      title: params.title,
      description: params.description,
      changedFile: params.changedFile,
      rollbackRef: params.rollbackRef,
      sourceRef: params.changedFile,
    })
  }
}
