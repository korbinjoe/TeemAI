#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function readText(filePath) {
  return readFileSync(filePath, 'utf8')
}

function listDir(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
}

function safeStat(path) {
  try {
    return statSync(path)
  } catch {
    return null
  }
}

function isDirectoryEntry(parentDir, entry) {
  if (entry.isDirectory()) return true
  if (!entry.isSymbolicLink()) return false
  return Boolean(safeStat(join(parentDir, entry.name))?.isDirectory())
}

function toStringArray(value) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : []
}

function unique(values) {
  return [...new Set(values)].sort()
}

function addDeclaredSkill(map, skill, agentId) {
  if (!skill || !agentId) return
  if (!map.has(skill)) map.set(skill, new Set())
  map.get(skill).add(agentId)
}

function addAgentConfig(declared, agent) {
  if (!agent || typeof agent !== 'object') return
  const id = String(agent.id ?? '').trim()
  if (!id) return

  declared.agentIds.add(id)
  for (const skill of toStringArray(agent.skills)) {
    addDeclaredSkill(declared.skillsByAgent, skill, id)
  }
  for (const agentId of [...toStringArray(agent.subAgentNames), ...toStringArray(agent.expertAgentIds)]) {
    declared.agentIds.add(agentId)
  }
}

function parseYamlFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!match) return null
  return parseYaml(match[1]) ?? {}
}

function deriveLayout(root) {
  const repoAssetsDir = join(root, 'ai-assets')
  if (existsSync(repoAssetsDir)) {
    return {
      configPath: join(root, 'teemai.json'),
      assetsDir: repoAssetsDir,
      skillsDir: join(repoAssetsDir, 'skills'),
      agentsDir: join(repoAssetsDir, 'agents'),
    }
  }

  return {
    configPath: join(root, 'teemai.json'),
    assetsDir: root,
    skillsDir: join(root, 'skills'),
    agentsDir: join(root, 'agents'),
  }
}

function collectDeclared({ configPath, agentsDir }) {
  const declared = {
    skillsByAgent: new Map(),
    agentIds: new Set(),
  }

  if (existsSync(configPath)) {
    const config = readJson(configPath)
    const agentsSection = config.agents
    const agents = Array.isArray(agentsSection)
      ? agentsSection
      : Array.isArray(agentsSection?.list)
        ? agentsSection.list
        : []

    for (const agent of agents) {
      addAgentConfig(declared, agent)
    }
  }

  for (const entry of listDir(agentsDir)) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue
    const filePath = join(agentsDir, entry.name)
    try {
      const meta = parseYamlFrontmatter(readText(filePath))
      if (!meta) continue
      const id = entry.name.replace(/\.md$/, '')
      addAgentConfig(declared, { id, ...meta })
    } catch {
      continue
    }
  }

  return declared
}

function validateSkillDirectory(skillsDir, entry) {
  const skillDir = join(skillsDir, entry.name)
  const skillMd = join(skillDir, 'SKILL.md')

  if (!existsSync(skillMd)) {
    return { ok: false, reason: 'directory exists but SKILL.md is missing' }
  }

  const raw = readText(skillMd)
  if (raw.trim().length === 0) {
    return { ok: false, reason: 'SKILL.md exists but is empty' }
  }

  let meta
  try {
    meta = parseYamlFrontmatter(raw)
  } catch (err) {
    return { ok: false, reason: `SKILL.md frontmatter is invalid YAML: ${err instanceof Error ? err.message : String(err)}` }
  }

  if (!meta) {
    return { ok: false, reason: 'SKILL.md is missing YAML frontmatter' }
  }
  if (typeof meta.name !== 'string' || meta.name.trim().length === 0) {
    return { ok: false, reason: 'SKILL.md frontmatter is missing name' }
  }
  if (meta.name.trim() !== entry.name) {
    return { ok: false, reason: `SKILL.md name (${meta.name}) does not match directory (${entry.name})` }
  }

  return { ok: true }
}

function collectShippedSkills(skillsDir, availableSkillNames) {
  const shipped = new Set(availableSkillNames ?? [])
  const malformedSkills = []

  for (const entry of listDir(skillsDir)) {
    if (!isDirectoryEntry(skillsDir, entry)) continue
    const result = validateSkillDirectory(skillsDir, entry)
    if (!result.ok) {
      malformedSkills.push({ skill: entry.name, reason: result.reason })
      continue
    }
    shipped.add(entry.name)
  }

  return { shipped, malformedSkills }
}

function collectMissingAgents(agentsDir, requiredAgentIds) {
  const missingAgents = []

  for (const agentId of [...requiredAgentIds].sort()) {
    const agentDir = join(agentsDir, agentId)
    if (!existsSync(agentDir) || !safeStat(agentDir)?.isDirectory()) {
      missingAgents.push({ agent: agentId, reason: `agents/${agentId}/ does not exist` })
      continue
    }

    const hasSoul = existsSync(join(agentDir, 'SOUL.md'))
    const hasIdentity = existsSync(join(agentDir, 'IDENTITY.md'))
    if (!hasSoul && !hasIdentity) {
      missingAgents.push({ agent: agentId, reason: `agents/${agentId}/ has neither SOUL.md nor IDENTITY.md` })
    }
  }

  return missingAgents
}

export function validateAiAssets(options) {
  const root = resolve(options.root)
  const layout = deriveLayout(root)
  const configPath = options.configPath ? resolve(options.configPath) : layout.configPath
  const agentsDir = options.agentsDir ? resolve(options.agentsDir) : layout.agentsDir
  const skillsDir = options.skillsDir ? resolve(options.skillsDir) : layout.skillsDir

  const declared = collectDeclared({ configPath, agentsDir })
  const { shipped, malformedSkills } = collectShippedSkills(skillsDir, options.availableSkillNames)

  const missingSkills = [...declared.skillsByAgent.entries()]
    .filter(([skill]) => !shipped.has(skill))
    .map(([skill, declaredBy]) => ({ skill, declaredBy: unique([...declaredBy]) }))
    .sort((a, b) => a.skill.localeCompare(b.skill))

  const missingAgents = collectMissingAgents(agentsDir, declared.agentIds)

  return {
    root,
    configPath,
    skillsDir,
    agentsDir,
    missingSkills,
    missingAgents,
    malformedSkills: malformedSkills.sort((a, b) => a.skill.localeCompare(b.skill)),
  }
}

export function isAiAssetsReportHealthy(report) {
  return report.missingSkills.length === 0
    && report.missingAgents.length === 0
    && report.malformedSkills.length === 0
}

export function flattenAiAssetsFindings(report) {
  return [
    ...report.missingSkills.map(({ skill }) => `skill:${skill}`),
    ...report.missingAgents.map(({ agent }) => `agent:${agent}`),
    ...report.malformedSkills.map(({ skill }) => `malformed-skill:${skill}`),
  ].sort()
}

export function toAiAssetsHealth(report) {
  return {
    status: isAiAssetsReportHealthy(report) ? 'ok' : 'degraded',
    missing: flattenAiAssetsFindings(report),
  }
}

export function formatAiAssetsReport(report) {
  const lines = []

  if (report.missingSkills.length > 0) {
    lines.push('Missing declared skills:')
    for (const { skill, declaredBy } of report.missingSkills) {
      lines.push(`  - ${skill} (declared by: ${declaredBy.join(', ')})`)
      lines.push(`    expected: ${join(report.skillsDir, skill, 'SKILL.md')}`)
    }
  }

  if (report.missingAgents.length > 0) {
    if (lines.length > 0) lines.push('')
    lines.push('Missing declared agents:')
    for (const { agent, reason } of report.missingAgents) {
      lines.push(`  - ${agent}: ${reason}`)
    }
  }

  if (report.malformedSkills.length > 0) {
    if (lines.length > 0) lines.push('')
    lines.push('Malformed skills:')
    for (const { skill, reason } of report.malformedSkills) {
      lines.push(`  - ${skill}: ${reason}`)
    }
  }

  return lines.join('\n')
}

const modulePath = fileURLToPath(import.meta.url)
const isMain = process.argv[1] && resolve(process.argv[1]) === modulePath

if (isMain) {
  const report = validateAiAssets({ root: process.cwd() })

  if (!isAiAssetsReportHealthy(report)) {
    console.error(formatAiAssetsReport(report))
    console.error('\nai-assets integrity check FAILED.')
    console.error('Fix: make every skill in teemai.json agents.list[].skills ship with a matching ai-assets/skills/<name>/SKILL.md, or remove the declaration.')
    process.exit(1)
  }

  console.log('ai-assets integrity check passed.')
}
