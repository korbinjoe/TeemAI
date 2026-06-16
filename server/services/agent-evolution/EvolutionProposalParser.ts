import type { EvolutionProposal } from '../../stores/EvolutionReviewJobStore'

const section = (raw: string, heading: string): string => {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = raw.match(new RegExp(`(?:^|\\n)### ${escaped}\\s*\\n([\\s\\S]*?)(?=\\n### |\\n## |\\s*$)`))
  return match?.[1]?.trim() ?? ''
}

export const parseEvolutionProposalMarkdown = (raw: string): EvolutionProposal => {
  const proposal: EvolutionProposal = {
    evidence: section(raw, 'Evidence'),
    rootCause: section(raw, 'Root Cause'),
    diff: section(raw, 'Change') || section(raw, 'Diff'),
    expectedImpact: section(raw, 'Expected Impact'),
    risk: section(raw, 'Risk'),
    validationPlan: section(raw, 'Validation Plan'),
    rollbackPath: section(raw, 'Rollback Path'),
  }
  validateEvolutionProposal(proposal)
  return proposal
}

export const validateEvolutionProposal = (proposal: EvolutionProposal): void => {
  const required: Array<keyof EvolutionProposal> = [
    'evidence',
    'rootCause',
    'diff',
    'expectedImpact',
    'risk',
    'validationPlan',
    'rollbackPath',
  ]
  for (const key of required) {
    const value = proposal[key]
    if (value === undefined || value === '') {
      throw new Error(`Evolution proposal missing ${key}`)
    }
  }
}
