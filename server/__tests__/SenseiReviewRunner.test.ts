import { describe, it, expect, vi } from 'vitest'
import { SenseiReviewRunner } from '../services/agent-evolution/SenseiReviewRunner'
import type { EvolutionReviewJob } from '../stores/EvolutionReviewJobStore'

const job: EvolutionReviewJob = {
  id: 'job-1',
  targetType: 'agent',
  targetId: 'lead',
  triggerType: 'low_satisfaction',
  evidence: { avgMss: -10 },
  status: 'queued',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

describe('SenseiReviewRunner', () => {
  it('produces structured memory proposals with proposal-safe capabilities', async () => {
    const contextBuilder = {
      build: vi.fn(() => ({
        targetId: 'lead',
        targetName: 'Lead',
        triggerType: 'low_satisfaction',
        evidence: job.evidence,
        promptFiles: { 'SOUL.md': 'Current prompt' },
        memories: [],
        episodes: [{ title: 'Prior issue', summary: 'Clarify acceptance criteria first.', outcome: 'success' }],
      })),
    }
    const runner = new SenseiReviewRunner(contextBuilder as never)

    const proposal = await runner.run(job, { allowedTools: ['episode_search', 'readonly_inspect', 'proposal_draft'] })

    expect(proposal.actions).toEqual([expect.objectContaining({
      type: 'memory_upsert',
      agentId: 'lead',
      source: 'evolution-review:job-1',
    })])
    expect(proposal.diff).toContain('Add reviewed cross-session memory')
    expect(contextBuilder.build).toHaveBeenCalledWith(job)
  })

  it('rejects unsafe review surfaces', async () => {
    const runner = new SenseiReviewRunner({ build: vi.fn() } as never)

    await expect(runner.run(job, { allowedTools: ['Write'] })).rejects.toThrow(/proposal-safe/)
  })
})
