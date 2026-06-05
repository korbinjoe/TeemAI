import { mkdir, writeFile, rm, readdir, readFile, copyFile, chmod, symlink, lstat, readlink } from 'fs/promises'
import { join, dirname } from 'path'
import { homedir } from 'os'
import { existsSync } from 'fs'
import type { SkillDefinition, SkillHooksConfig, SkillHookCommand } from './types'
import { createLogger } from '../lib/logger'

const log = createLogger('SkillManager')

export class SkillManager {
  private skills: Map<string, SkillDefinition> = new Map()
  private hooksDir: string

  /**
   * @param builtinDir  skills ai-assets/skills/
   * @param hooksDir  hooks ai-assets/hooks/ {HOOKS_DIR}
   */
  constructor(private builtinDir: string, hooksDir?: string) {
    this.hooksDir = hooksDir || join(dirname(builtinDir), 'hooks')
  }

  async loadBuiltinSkills(): Promise<void> {
    await this.loadSkillsFromDir(this.builtinDir, 'builtin')
    const home = homedir()
    await this.loadSkillsFromDir(join(home, '.claude', 'skills'), 'custom')
    await this.loadSkillsFromDir(join(home, '.codex', 'skills'), 'custom')
  }

  private async loadSkillsFromDir(dir: string, source: 'builtin' | 'custom'): Promise<void> {
    if (!existsSync(dir)) return
    const entries = await readdir(dir, { withFileTypes: true })
    let count = 0
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const skillPath = join(dir, entry.name, 'SKILL.md')
      if (!existsSync(skillPath)) continue
      const raw = await readFile(skillPath, 'utf-8')
      const skill = this.parseSkillMd(raw, entry.name)
      if (skill) {
        skill.source = source
        skill.filePath = skillPath
        this.resolveSkillDirInHooks(skill)
        this.skills.set(skill.name, skill)
        count++
      }
    }
    log.info('Loaded skills', { count, source, dir })
  }

  /**
   *  builtin skills  ~/.claude/skills/
   *  Claude Code  TeemAI  Skill
   */
  async syncBuiltinToClaudeHome(): Promise<void> {
    const claudeSkillsDir = join(homedir(), '.claude', 'skills')
    await mkdir(claudeSkillsDir, { recursive: true })

    let count = 0
    for (const [name, skill] of this.skills) {
      if (skill.source !== 'builtin' || !skill.filePath) continue
      const sourceDir = dirname(skill.filePath)
      const targetLink = join(claudeSkillsDir, name)

      if (existsSync(targetLink)) {
        try {
          const stat = await lstat(targetLink)
          if (stat.isSymbolicLink()) {
            const current = await readlink(targetLink)
            if (current !== sourceDir) continue
          }
        } catch { /* ignore */ }
        continue
      }

      try {
        await symlink(sourceDir, targetLink)
        count++
      } catch (err) {
        log.warn('Failed to symlink skill to ~/.claude/skills/', { name, error: String(err) })
      }
    }
    if (count > 0) {
      log.info('Synced builtin skills to ~/.claude/skills/', { count })
    }
  }

  registerCustomSkill(skill: SkillDefinition): void {
    skill.source = 'custom'
    this.skills.set(skill.name, skill)
  }

  removeSkill(name: string): boolean {
    return this.skills.delete(name)
  }

  getSkill(name: string): SkillDefinition | undefined {
    return this.skills.get(name)
  }

  /**  skill  SKILL.md  undefined */
  getSkillDir(name: string): string | undefined {
    const skill = this.skills.get(name)
    if (!skill?.filePath) return undefined
    return dirname(skill.filePath)
  }

  listSkills(): SkillDefinition[] {
    return Array.from(this.skills.values())
  }

  async syncSkillsToDisk(targetCwd: string, enabledSkillNames: string[]): Promise<void> {
    const skillsDir = join(targetCwd, '.claude', 'skills')
    await mkdir(skillsDir, { recursive: true })

    for (const name of enabledSkillNames) {
      const skill = this.skills.get(name)
      if (!skill) continue
      const skillDir = join(skillsDir, name)
      await mkdir(skillDir, { recursive: true })
      await writeFile(
        join(skillDir, 'SKILL.md'),
        this.serializeSkillMd(skill),
        'utf-8',
      )

      if (skill.filePath) {
        const sourceDir = dirname(skill.filePath)
        for (const subDir of ['scripts', 'references']) {
          const srcSubDir = join(sourceDir, subDir)
          if (existsSync(srcSubDir)) {
            await this.syncDirectory(srcSubDir, join(skillDir, subDir))
          }
        }
      }
    }
    log.info('Synced skills to disk', { count: enabledSkillNames.length, skillsDir })
  }

  private async syncDirectory(srcDir: string, destDir: string): Promise<void> {
    await mkdir(destDir, { recursive: true })
    const entries = await readdir(srcDir, { withFileTypes: true })
    for (const entry of entries) {
      const srcPath = join(srcDir, entry.name)
      const destPath = join(destDir, entry.name)
      if (entry.isDirectory()) {
        await this.syncDirectory(srcPath, destPath)
      } else {
        await copyFile(srcPath, destPath)
        if (entry.name.endsWith('.sh') || entry.name.endsWith('.py')) {
          await chmod(destPath, 0o755)
        }
      }
    }
  }

  async removeSkillFromDisk(targetCwd: string, skillName: string): Promise<void> {
    const skillDir = join(targetCwd, '.claude', 'skills', skillName)
    if (existsSync(skillDir)) {
      await rm(skillDir, { recursive: true })
      log.info('Removed skill from disk', { skillName, skillDir })
    }
  }

  parseSkillMd(raw: string, fallbackName: string): SkillDefinition | null {
    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
    if (!fmMatch) return null

    const fm = fmMatch[1]
    const body = fmMatch[2]
    const name = this.extractField(fm, 'name') || fallbackName
    const description = this.extractMultilineField(fm, 'description') || ''
    const allowedTools = this.extractField(fm, 'allowed-tools')
    const hooks = this.parseHooks(fm)

    return {
      name,
      description,
      content: body.trim(),
      allowedTools,
      hooks,
      enabled: true,
      source: 'builtin',
    }
  }

  private serializeSkillMd(skill: SkillDefinition): string {
    const lines = ['---']
    lines.push(`name: ${skill.name}`)
    lines.push('description: >')
    for (const descLine of skill.description.split('\n')) {
      lines.push(`  ${descLine.trim()}`)
    }
    if (skill.allowedTools) {
      lines.push(`allowed-tools: ${skill.allowedTools}`)
    }
    lines.push('---')
    lines.push('')
    lines.push(skill.content)
    return lines.join('\n')
  }

  private extractField(yaml: string, field: string): string | undefined {
    const re = new RegExp(`^${field}:\\s*(.+)$`, 'm')
    const match = yaml.match(re)
    return match?.[1]?.trim()
  }

  private extractMultilineField(yaml: string, field: string): string {
    const singleMatch = yaml.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'))
    if (singleMatch && !singleMatch[1].startsWith('>') && !singleMatch[1].startsWith('|')) {
      return singleMatch[1].trim()
    }

    const blockMatch = yaml.match(new RegExp(`^${field}:\\s*[>|]\\s*\\n((?:\\s+.+\\n?)+)`, 'm'))
    if (blockMatch) {
      return blockMatch[1]
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .join(' ')
    }
    return ''
  }

  /**
   *  frontmatter  hooks
   * ```
   * hooks:
   *   PostToolUse:
   *     - command: bash {SKILL_DIR}/scripts/foo.sh
   *       timeout: 5
   *   Stop:
   *     - command: bash {SKILL_DIR}/scripts/bar.sh
   * ```
   */
  private parseHooks(yaml: string): SkillHooksConfig | undefined {
    const hooksMatch = yaml.match(/^hooks:\s*\n((?:[\t ]+.+\n?)+)/m)
    if (!hooksMatch) return undefined

    const block = hooksMatch[1]
    const config: SkillHooksConfig = {}
    const events = ['PreToolUse', 'PostToolUse', 'Notification', 'Stop'] as const

    for (const event of events) {
      const eventRe = new RegExp(`^\\s{2}${event}:\\s*\\n((?:\\s{4,}.+\\n?)+)`, 'm')
      const eventMatch = block.match(eventRe)
      if (!eventMatch) continue

      const items: SkillHookCommand[] = []
      const lines = eventMatch[1].split('\n').filter(Boolean)
      let current: Partial<SkillHookCommand> | null = null

      for (const line of lines) {
        const cmdMatch = line.match(/^\s+-\s+command:\s*(.+)$/)
        if (cmdMatch) {
          if (current?.command) items.push(current as SkillHookCommand)
          current = { command: cmdMatch[1].trim() }
          continue
        }
        if (!current) continue
        const timeoutMatch = line.match(/^\s+timeout:\s*(\d+)/)
        if (timeoutMatch) current.timeout = Number(timeoutMatch[1])
        const matcherMatch = line.match(/^\s+matcher:\s*(.+)/)
        if (matcherMatch) current.matcher = matcherMatch[1].trim()
      }
      if (current?.command) items.push(current as SkillHookCommand)
      if (items.length) config[event] = items
    }

    return Object.keys(config).length ? config : undefined
  }

  private resolveSkillDirInHooks(skill: SkillDefinition): void {
    if (!skill.hooks || !skill.filePath) return
    const skillDir = dirname(skill.filePath)
    const events = ['PreToolUse', 'PostToolUse', 'Notification', 'Stop'] as const
    for (const event of events) {
      const cmds = skill.hooks[event]
      if (!cmds) continue
      for (const cmd of cmds) {
        cmd.command = cmd.command
          .replace(/\{SKILL_DIR\}/g, skillDir)
          .replace(/\{HOOKS_DIR\}/g, this.hooksDir)
      }
    }
  }
}
