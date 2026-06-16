export interface MissingSkill {
  skill: string
  declaredBy: string[]
}

export interface MissingAgent {
  agent: string
  reason: string
}

export interface MalformedSkill {
  skill: string
  reason: string
}

export interface AiAssetsReport {
  root: string
  configPath: string
  skillsDir: string
  agentsDir: string
  missingSkills: MissingSkill[]
  missingAgents: MissingAgent[]
  malformedSkills: MalformedSkill[]
}

export interface ValidateAiAssetsOptions {
  root: string
  configPath?: string
  skillsDir?: string
  agentsDir?: string
  availableSkillNames?: string[]
}

export interface AiAssetsHealth {
  status: 'ok' | 'degraded'
  missing: string[]
}

export function validateAiAssets(options: ValidateAiAssetsOptions): AiAssetsReport
export function isAiAssetsReportHealthy(report: AiAssetsReport): boolean
export function flattenAiAssetsFindings(report: AiAssetsReport): string[]
export function toAiAssetsHealth(report: AiAssetsReport): AiAssetsHealth
export function formatAiAssetsReport(report: AiAssetsReport): string

