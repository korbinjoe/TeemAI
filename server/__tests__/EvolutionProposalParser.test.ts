import { describe, it, expect } from 'vitest'
import { parseEvolutionProposalMarkdown } from '../services/agent-evolution/EvolutionProposalParser'

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
`)

    expect(proposal.rootCause).toContain('ambiguous')
    expect(proposal.diff).toContain('+ new')
  })

  it('rejects missing sections', () => {
    expect(() => parseEvolutionProposalMarkdown('### Evidence\nOnly evidence')).toThrow(/missing rootCause/)
  })
})
