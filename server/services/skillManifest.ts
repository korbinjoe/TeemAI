import { readFile } from 'fs/promises'
import { join } from 'path'

export const SKILL_MANIFEST_FILE = '.teemai-manifest.json'

export type SkillLifecycleSource = 'bundled' | 'user' | 'agent'

export interface SkillManifestEntry {
  sourcePath?: string
  runtimePath: string
  hash?: string
  seededAt?: string
  detectedAt?: string
}

export interface SkillManifest {
  version: 1
  generatedAt: string
  bundled: Record<string, SkillManifestEntry>
  user: Record<string, SkillManifestEntry>
  agent: Record<string, SkillManifestEntry>
}

export const emptySkillManifest = (): SkillManifest => ({
  version: 1,
  generatedAt: new Date().toISOString(),
  bundled: {},
  user: {},
  agent: {},
})

export const readSkillManifest = async (skillsDir: string): Promise<SkillManifest | null> => {
  try {
    const raw = await readFile(join(skillsDir, SKILL_MANIFEST_FILE), 'utf-8')
    const parsed = JSON.parse(raw) as SkillManifest
    if (!parsed || parsed.version !== 1) return null
    return {
      ...emptySkillManifest(),
      ...parsed,
      bundled: parsed.bundled ?? {},
      user: parsed.user ?? {},
      agent: parsed.agent ?? {},
    }
  } catch {
    return null
  }
}

export const getSkillManifestSource = (
  manifest: SkillManifest | null | undefined,
  skillName: string,
): SkillLifecycleSource | undefined => {
  if (!manifest) return undefined
  if (manifest.bundled[skillName]) return 'bundled'
  if (manifest.agent[skillName]) return 'agent'
  if (manifest.user[skillName]) return 'user'
  return undefined
}

export const getSkillManifestEntry = (
  manifest: SkillManifest | null | undefined,
  skillName: string,
): SkillManifestEntry | undefined => {
  const source = getSkillManifestSource(manifest, skillName)
  return source ? manifest?.[source][skillName] : undefined
}
