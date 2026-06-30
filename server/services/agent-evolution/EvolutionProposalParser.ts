import { isAbsolute, sep } from 'path'
import type {
  EvolutionAction,
  EvolutionMetrics,
  EvolutionProposal,
  EvolutionReviewJob,
} from '../../stores/EvolutionReviewJobStore'

const section = (raw: string, heading: string): string => {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = raw.match(new RegExp(`(?:^|\\n)### ${escaped}\\s*\\n([\\s\\S]*?)(?=\\n### |\\n## |\\s*$)`))
  return match?.[1]?.trim() ?? ''
}

const extractJson = (raw: string): unknown => {
  const trimmed = raw.trim()
  if (!trimmed) return undefined

  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  const candidate = fence?.[1] ?? trimmed
  return JSON.parse(candidate)
}

const parseOptionalJsonSection = <T>(raw: string): T | undefined => {
  if (!raw.trim()) return undefined
  return extractJson(raw) as T
}

export const parseEvolutionProposalMarkdown = (raw: string): EvolutionProposal => {
  const trimmed = raw.trim()
  if (trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed) as EvolutionProposal
    validateEvolutionProposal(parsed)
    return parsed
  }

  const actions = parseOptionalJsonSection<EvolutionAction[]>(section(raw, 'Actions')) ?? []
  const metrics = parseOptionalJsonSection<EvolutionMetrics>(section(raw, 'Metrics'))
  const proposal: EvolutionProposal = {
    evidence: section(raw, 'Evidence'),
    rootCause: section(raw, 'Root Cause'),
    diff: section(raw, 'Change') || section(raw, 'Diff'),
    expectedImpact: section(raw, 'Expected Impact'),
    risk: section(raw, 'Risk'),
    validationPlan: section(raw, 'Validation Plan'),
    rollbackPath: section(raw, 'Rollback Path'),
    actions,
    metrics,
  }
  validateEvolutionProposal(proposal)
  return proposal
}

export const validateEvolutionProposal = (proposal: EvolutionProposal, job?: Pick<EvolutionReviewJob, 'targetType' | 'targetId'>): void => {
  const required: Array<keyof EvolutionProposal> = [
    'evidence',
    'rootCause',
    'diff',
    'expectedImpact',
    'risk',
    'validationPlan',
    'rollbackPath',
    'actions',
  ]
  for (const key of required) {
    const value = proposal[key]
    if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
      throw new Error(`Evolution proposal missing ${key}`)
    }
  }
  validateEvolutionActions(proposal.actions, job)
  validateEvolutionMetrics(proposal.metrics)
}

export const validateEvolutionActions = (
  actions: EvolutionAction[],
  job?: Pick<EvolutionReviewJob, 'targetType' | 'targetId'>,
): void => {
  if (!Array.isArray(actions) || actions.length === 0) throw new Error('Evolution proposal missing actions')
  if (actions.length > 5) throw new Error('Evolution proposal has too many actions')

  for (const action of actions) {
    if (!action || typeof action !== 'object' || typeof action.type !== 'string') {
      throw new Error('Evolution action must include type')
    }
    validateActionTarget(action, job)

    switch (action.type) {
      case 'agent_prompt_patch':
        requireString(action.agentId, 'agentId')
        requireAllowedAgentFile(action.filePath)
        requireString(action.find, 'find')
        requireString(action.replace, 'replace')
        break
      case 'skill_patch':
        requireString(action.skillName, 'skillName')
        if (action.filePath !== undefined) requireRelativePath(action.filePath, 'filePath')
        requireString(action.find, 'find')
        requireString(action.replace, 'replace')
        break
      case 'skill_create':
        requireString(action.skillName, 'skillName')
        requireString(action.description, 'description')
        requireString(action.body, 'body')
        break
      case 'skill_write_file':
        requireString(action.skillName, 'skillName')
        requireRelativePath(action.filePath, 'filePath')
        requireString(action.content, 'content')
        break
      case 'skill_archive':
        requireString(action.skillName, 'skillName')
        break
      case 'skill_restore':
        requireString(action.skillName, 'skillName')
        requireString(action.archivePath, 'archivePath')
        break
      case 'skill_pin':
        requireString(action.skillName, 'skillName')
        if (typeof action.pinned !== 'boolean') throw new Error('skill_pin action requires boolean pinned')
        break
      case 'memory_upsert':
        requireString(action.agentId, 'agentId')
        requireString(action.content, 'content')
        if (action.importance !== undefined && (typeof action.importance !== 'number' || action.importance < 0)) {
          throw new Error('memory_upsert action importance must be a non-negative number')
        }
        break
      default:
        throw new Error(`Unsupported evolution action type: ${(action as { type?: string }).type}`)
    }
  }
}

const validateActionTarget = (action: EvolutionAction, job?: Pick<EvolutionReviewJob, 'targetType' | 'targetId'>): void => {
  if (!job) return

  const actionTargetType = getActionTargetType(action)
  if (job.targetType === 'team') {
    throw new Error('Team evolution actions are not supported yet')
  }
  if (actionTargetType !== job.targetType) {
    throw new Error(`Action type ${action.type} does not match review target type ${job.targetType}`)
  }

  if (actionTargetType === 'agent' && 'agentId' in action && action.agentId !== job.targetId) {
    throw new Error(`Action target ${action.agentId} does not match review target ${job.targetId}`)
  }
  if (actionTargetType === 'skill' && 'skillName' in action && action.skillName !== job.targetId) {
    throw new Error(`Action target ${action.skillName} does not match review target ${job.targetId}`)
  }
}

const getActionTargetType = (action: EvolutionAction): 'agent' | 'skill' => {
  switch (action.type) {
    case 'agent_prompt_patch':
    case 'memory_upsert':
      return 'agent'
    case 'skill_patch':
    case 'skill_create':
    case 'skill_write_file':
    case 'skill_archive':
    case 'skill_restore':
    case 'skill_pin':
      return 'skill'
  }
  const _exhaustive: never = action
  return _exhaustive
}

const requireString = (value: unknown, field: string): void => {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Evolution action missing ${field}`)
}

const requireAllowedAgentFile = (filePath: string): void => {
  requireString(filePath, 'filePath')
  if (!['IDENTITY.md', 'AGENTS.md', 'SOUL.md'].includes(filePath)) {
    throw new Error(`Unsupported agent prompt file: ${filePath}`)
  }
}

const requireRelativePath = (filePath: string, field: string): void => {
  requireString(filePath, field)
  if (isAbsolute(filePath) || filePath.split(/[\\/]+/).includes('..') || filePath.includes(`${sep}${sep}`)) {
    throw new Error(`Evolution action ${field} must stay inside target directory`)
  }
}

const validateEvolutionMetrics = (metrics?: EvolutionMetrics): void => {
  if (!metrics) return
  for (const key of ['baselineScore', 'candidateScore', 'holdoutScore', 'sizeChange'] as const) {
    const value = metrics[key]
    if (value !== undefined && typeof value !== 'number') {
      throw new Error(`Evolution proposal metric ${key} must be numeric`)
    }
  }
  if (metrics.gates !== undefined) {
    if (!Array.isArray(metrics.gates)) throw new Error('Evolution proposal metrics.gates must be an array')
    for (const gate of metrics.gates) {
      if (!gate || typeof gate.name !== 'string' || typeof gate.passed !== 'boolean') {
        throw new Error('Evolution proposal metrics.gates entries require name and passed')
      }
    }
  }
}
