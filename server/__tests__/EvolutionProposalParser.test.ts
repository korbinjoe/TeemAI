import { describe, it, expect } from 'vitest'
import { parseEvolutionProposalMarkdown, validateEvolutionActions, validateEvolutionProposal } from '../services/agent-evolution/EvolutionProposalParser'

describe('EvolutionProposalParser', () => {
  it('parses and validates Sensei proposal markdown', () => {
    const proposal = parseEvolutionProposalMarkdown(`
## Evolution Proposal: lead - routing

### Evidence
- wb: repeated corrections

### Root Cause
Routing criteria are ambiguous.

### Change
\`\`\`diff
- old
+ new
\`\`\`

### Expected Impact
Better routing.

### Risk
May over-route.

### Validation Plan
Run routing eval.

### Rollback Path
Reject or revert snapshot.

### Actions
[
  {
    "type": "agent_prompt_patch",
    "agentId": "lead",
    "filePath": "SOUL.md",
    "find": "old",
    "replace": "new"
  }
]
`)

    expect(proposal.rootCause).toContain('ambiguous')
    expect(proposal.diff).toContain('+ new')
    expect(proposal.actions).toHaveLength(1)
  })

  it('rejects missing sections', () => {
    expect(() => parseEvolutionProposalMarkdown('### Evidence\nOnly evidence')).toThrow(/missing rootCause/)
  })

  it('rejects missing actions', () => {
    expect(() => validateEvolutionProposal({
      evidence: 'signal',
      rootCause: 'Cause',
      diff: 'Diff',
      expectedImpact: 'Impact',
      risk: 'Risk',
      validationPlan: 'Plan',
      rollbackPath: 'Rollback',
      actions: [],
    })).toThrow(/missing actions/)
  })

  it('rejects unsupported agent files and path traversal', () => {
    expect(() => validateEvolutionActions([{
      type: 'agent_prompt_patch',
      agentId: 'lead',
      filePath: '../server/index.ts' as never,
      find: 'old',
      replace: 'new',
    }])).toThrow(/Unsupported agent prompt file/)

    expect(() => validateEvolutionActions([{
      type: 'skill_write_file',
      skillName: 'demo',
      filePath: '../outside.md',
      content: 'bad',
    }])).toThrow(/must stay inside target directory/)
  })

  it('rejects target mismatches and malformed metrics', () => {
    expect(() => validateEvolutionProposal({
      evidence: 'signal',
      rootCause: 'Cause',
      diff: 'Diff',
      expectedImpact: 'Impact',
      risk: 'Risk',
      validationPlan: 'Plan',
      rollbackPath: 'Rollback',
      actions: [{
        type: 'agent_prompt_patch',
        agentId: 'lead',
        filePath: 'SOUL.md',
        find: 'old',
        replace: 'new',
      }],
    }, { targetType: 'agent', targetId: 'architect' })).toThrow(/does not match/)

    expect(() => validateEvolutionProposal({
      evidence: 'signal',
      rootCause: 'Cause',
      diff: 'Diff',
      expectedImpact: 'Impact',
      risk: 'Risk',
      validationPlan: 'Plan',
      rollbackPath: 'Rollback',
      actions: [{
        type: 'skill_pin',
        skillName: 'demo',
        pinned: true,
      }],
      metrics: { baselineScore: 'bad' as never },
    })).toThrow(/baselineScore/)
  })

  it('rejects action types that do not match the review target type', () => {
    expect(() => validateEvolutionProposal({
      evidence: 'signal',
      rootCause: 'Cause',
      diff: 'Diff',
      expectedImpact: 'Impact',
      risk: 'Risk',
      validationPlan: 'Plan',
      rollbackPath: 'Rollback',
      actions: [{
        type: 'skill_pin',
        skillName: 'demo',
        pinned: true,
      }],
    }, { targetType: 'agent', targetId: 'lead' })).toThrow(/does not match review target type agent/)

    expect(() => validateEvolutionProposal({
      evidence: 'signal',
      rootCause: 'Cause',
      diff: 'Diff',
      expectedImpact: 'Impact',
      risk: 'Risk',
      validationPlan: 'Plan',
      rollbackPath: 'Rollback',
      actions: [{
        type: 'memory_upsert',
        agentId: 'lead',
        content: 'lesson',
      }],
    }, { targetType: 'skill', targetId: 'demo' })).toThrow(/does not match review target type skill/)
  })
})
