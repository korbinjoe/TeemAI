/**
 * WorkspaceSeeder -
 *
 *  app bundle  ai-assets/{agents,skills,workspace}
 *  ~/.teemai/{agents,skills,workspace}
 * agents/skills workspace
 *
 * Node 18  withFileTypes: true  entry.parentPath
 */

import { createHash, type Hash } from 'crypto'
import { mkdir, readFile, writeFile, readdir, rm, lstat, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { join, relative } from 'path'
import { createLogger } from '../lib/logger'
import { emptySkillManifest, SKILL_MANIFEST_FILE } from './skillManifest'

const log = createLogger('WorkspaceSeeder')

export class WorkspaceSeeder {
  constructor(
    /** extraResources/ai-assets/ asar  */
    private bundledAssetsDir: string,
    private teemaiHome: string,
  ) {}

  async seed(): Promise<void> {
    await Promise.all([
      this.seedDir('agents', true),
      this.seedDir('skills', true),
      this.seedDir('hooks', true),
      this.seedDir('system', true),
      this.seedTeemAIJson(),
    ])
    await this.writeSkillManifest()
    await this.ensureAgentMemoryDirs()
  }

  private async ensureAgentMemoryDirs(): Promise<void> {
    const agentsDir = join(this.teemaiHome, 'agents')
    if (!existsSync(agentsDir)) return
    try {
      const entries = await readdir(agentsDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
        await mkdir(join(agentsDir, entry.name, 'memory'), { recursive: true })
      }
      log.debug('Ensured memory/ dirs for all agents')
    } catch (err) {
      log.warn('Failed to ensure agent memory dirs', { error: String(err) })
    }
  }

  /**
   *  bundled teemai.json  ~/.teemai/teemai.json
   * -  bundled  agent  agent
   */
  private async seedTeemAIJson(): Promise<void> {
    const src = join(this.bundledAssetsDir, '..', 'teemai.json')
    const dst = join(this.teemaiHome, 'teemai.json')

    if (!existsSync(src)) {
      log.debug('Bundled teemai.json not found, skipping seed')
      return
    }

    if (!existsSync(dst)) {
      await writeFile(dst, await readFile(src))
      log.info('Seeded teemai.json to user home')
      return
    }

    try {
      const bundledRaw = await readFile(src, 'utf-8')
      const userRaw = await readFile(dst, 'utf-8')
      const bundled = JSON.parse(bundledRaw) as Record<string, unknown>
      const user = JSON.parse(userRaw) as Record<string, unknown>

      const bundledAgents = (bundled as { agents?: { list?: Array<{ id: string }> } }).agents
      const userAgents = (user as { agents?: { list?: Array<{ id: string }> } }).agents
      if (!bundledAgents?.list || !userAgents?.list) return

      const builtinIds = new Set(bundledAgents.list.map((a) => a.id))

      const userCreatedAgents = userAgents.list.filter((a) => !builtinIds.has(a.id))

      const merged = { ...bundled }
      const mergedAgentsSection = { ...(bundled as { agents: Record<string, unknown> }).agents }
      mergedAgentsSection.list = [...bundledAgents.list, ...userCreatedAgents]
      ;(merged as { agents: Record<string, unknown> }).agents = mergedAgentsSection

      await writeFile(dst, JSON.stringify(merged, null, 2) + '\n', 'utf-8')
      log.info('Merged bundled teemai.json into user config', {
        builtinUpdated: bundledAgents.list.length,
        userPreserved: userCreatedAgents.length,
      })
    } catch (err) {
      log.warn('Failed to merge teemai.json, skipping', { error: String(err) })
    }
  }

  private async seedDir(sub: string, overwrite = false): Promise<void> {
    const src = join(this.bundledAssetsDir, sub)
    const dst = join(this.teemaiHome, sub)

    if (!existsSync(src)) {
      log.debug('Seed source not found, skipping', { sub })
      return
    }

    await this.copyRecursive(src, dst, overwrite)
    log.info('WorkspaceSeeder: done', { sub })
  }

  private async writeSkillManifest(): Promise<void> {
    const bundledSkillsDir = join(this.bundledAssetsDir, 'skills')
    const runtimeSkillsDir = join(this.teemaiHome, 'skills')
    if (!existsSync(runtimeSkillsDir)) return

    try {
      const manifest = emptySkillManifest()
      manifest.generatedAt = new Date().toISOString()

      const bundledSkillNames = await this.listSkillDirs(bundledSkillsDir)
      const runtimeSkillNames = await this.listSkillDirs(runtimeSkillsDir)

      const bundledHashes = new Map<string, string>()
      for (const name of bundledSkillNames) {
        const sourcePath = join(bundledSkillsDir, name)
        bundledHashes.set(name, await this.hashDirectory(sourcePath))
      }

      for (const name of runtimeSkillNames) {
        const runtimePath = join(runtimeSkillsDir, name)
        const runtimeHash = await this.hashDirectory(runtimePath)
        const bundledHash = bundledHashes.get(name)
        if (bundledHash && bundledHash === runtimeHash) {
          manifest.bundled[name] = {
            sourcePath: join(bundledSkillsDir, name),
            runtimePath,
            hash: runtimeHash,
            seededAt: manifest.generatedAt,
          }
        } else {
          manifest.user[name] = {
            runtimePath,
            hash: runtimeHash,
            detectedAt: manifest.generatedAt,
          }
        }
      }

      await writeFile(
        join(runtimeSkillsDir, SKILL_MANIFEST_FILE),
        JSON.stringify(manifest, null, 2) + '\n',
        'utf-8',
      )
      log.info('Wrote skill manifest', {
        bundled: Object.keys(manifest.bundled).length,
        user: Object.keys(manifest.user).length,
      })
    } catch (err) {
      log.warn('Failed to write skill manifest', { error: err instanceof Error ? err.message : String(err) })
    }
  }

  private async listSkillDirs(dir: string): Promise<string[]> {
    if (!existsSync(dir)) return []
    const entries = await readdir(dir, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory() && existsSync(join(dir, entry.name, 'SKILL.md')))
      .map((entry) => entry.name)
      .sort()
  }

  private async hashDirectory(dir: string): Promise<string> {
    const hash = createHash('sha256')
    await this.hashDirectoryInto(dir, dir, hash)
    return `sha256:${hash.digest('hex')}`
  }

  private async hashDirectoryInto(root: string, dir: string, hash: Hash): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })
    entries.sort((a, b) => a.name.localeCompare(b.name))

    for (const entry of entries) {
      if (entry.name === SKILL_MANIFEST_FILE) continue
      const fullPath = join(dir, entry.name)
      const relPath = relative(root, fullPath)
      if (entry.isDirectory()) {
        await this.hashDirectoryInto(root, fullPath, hash)
      } else if (entry.isFile()) {
        hash.update(relPath)
        hash.update('\0')
        hash.update(await readFile(fullPath))
        hash.update('\0')
      }
    }
  }

  /**
   * Remove symlink entries so bundled ai-assets copy into ~/.teemai instead of
   * writing through a symlink to an external repo (e.g. browser-plugin).
   */
  private async removeSymlinkIfPresent(path: string): Promise<void> {
    if (!existsSync(path)) return
    try {
      const stat = await lstat(path)
      if (!stat.isSymbolicLink()) return
      await rm(path)
      log.info('Removed symlink before seed', { path })
    } catch (err) {
      log.warn('Failed to remove symlink before seed', { path, error: String(err) })
    }
  }

  private async copyRecursive(src: string, dst: string, overwrite: boolean): Promise<void> {
    await mkdir(dst, { recursive: true })

    const entries = await readdir(src, { withFileTypes: true })

    for (const entry of entries) {
      const srcPath = join(src, entry.name)
      const dstPath = join(dst, entry.name)

      // stat() follows symlinks; a dangling symlink (e.g. a packaged skill
      // pointing at an external repo absent from the bundle) throws ENOENT.
      // Skip it instead of letting boot crash the whole app.
      let srcStat
      try {
        srcStat = await stat(srcPath)
      } catch (err) {
        log.warn('Skipping unreadable seed entry (broken symlink?)', { srcPath, error: String(err) })
        continue
      }

      if (srcStat.isDirectory()) {
        if (overwrite) await this.removeSymlinkIfPresent(dstPath)
        await this.copyRecursive(srcPath, dstPath, overwrite)
      } else if (overwrite || !existsSync(dstPath)) {
        if (overwrite) await this.removeSymlinkIfPresent(dstPath)
        await writeFile(dstPath, await readFile(srcPath))
        log.debug('Seeded', { file: dstPath })
      }
    }
  }
}
