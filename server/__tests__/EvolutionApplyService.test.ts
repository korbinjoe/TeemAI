import { describe, it, expect, vi } from 'vitest'
import { EvolutionApplyService } from '../services/agent-evolution/EvolutionApplyService'
import type { EvolutionReviewJob } from '../stores/EvolutionReviewJobStore'

const makeJob = (status: EvolutionReviewJob['status'] = 'approved'): EvolutionReviewJob => {
  const now = new Date().toISOString()
  return {
    id: 'job-1',
    targetType: 'agent',
    targetId: 'lead',
    triggerType: 'low_satisfaction',
    evidence: { avgMss: -5 },
    status,
    createdAt: now,
    updatedAt: now,
    proposal: {
      evidence: { avgMss: -5 },
      rootCause: 'Repeated corrections.',
      diff: 'diff',
      expectedImpact: 'impact',
      risk: 'low',
      validationPlan: 'test',
      rollbackPath: 'snapshot',
      actions: [{
        type: 'agent_prompt_patch',
        agentId: 'lead',
        filePath: 'SOUL.md',
        find: 'old',
        replace: 'new',
      }],
    },
  }
}

describe('EvolutionApplyService', () => {
  it('rejects unapproved jobs before mutating services', async () => {
    const job = makeJob('proposal_ready')
    const store = {
      get: vi.fn(() => job),
      updateStatus: vi.fn(),
      setAppliedActions: vi.fn(),
    }
    const agentEvolutionService = { patchAgentFile: vi.fn() }
    const service = new EvolutionApplyService({
      reviewJobStore: store as never,
      skillEvolutionService: {} as never,
      agentEvolutionService: agentEvolutionService as never,
    })

    await expect(service.apply(job.id)).rejects.toThrow(/must be approved/)
    expect(agentEvolutionService.patchAgentFile).not.toHaveBeenCalled()
  })

  it('applies agent prompt actions and persists action results', async () => {
    const job = makeJob('approved')
    const appliedJob = { ...job, status: 'applied' as const }
    const store = {
      get: vi.fn((id: string) => id === job.id ? (store.updateStatus.mock.calls.length ? appliedJob : job) : undefined),
      updateStatus: vi.fn(),
      setAppliedActions: vi.fn(),
    }
    const agentEvolutionService = {
      patchAgentFile: vi.fn(async () => ({ filePath: '/tmp/SOUL.md', rollbackRef: '/tmp/snap' })),
    }
    const service = new EvolutionApplyService({
      reviewJobStore: store as never,
      skillEvolutionService: {} as never,
      agentEvolutionService: agentEvolutionService as never,
    })

    await expect(service.apply(job.id)).resolves.toMatchObject({ status: 'applied' })
    expect(agentEvolutionService.patchAgentFile).toHaveBeenCalledWith(expect.objectContaining({
      agentId: 'lead',
      filePath: 'SOUL.md',
      sourceRef: 'evolution-review:job-1',
    }))
    expect(store.setAppliedActions).toHaveBeenCalledWith(job.id, [expect.objectContaining({
      status: 'applied',
      changedFile: '/tmp/SOUL.md',
      rollbackRef: '/tmp/snap',
    })])
    expect(store.updateStatus).toHaveBeenCalledWith(job.id, 'applied')
  })

  it('routes approved skill patches through SkillEvolutionService', async () => {
    const job: EvolutionReviewJob = {
      ...makeJob('approved'),
      targetType: 'skill',
      targetId: 'demo-skill',
      proposal: {
        ...makeJob('approved').proposal!,
        actions: [{
          type: 'skill_patch',
          skillName: 'demo-skill',
          find: 'old',
          replace: 'new',
        }],
      },
    }
    const store = {
      get: vi.fn(() => job),
      updateStatus: vi.fn(),
      setAppliedActions: vi.fn(),
    }
    const skillEvolutionService = {
      patchSkill: vi.fn(async () => ({ filePath: '/tmp/SKILL.md', rollbackRef: '/tmp/snap' })),
    }
    const service = new EvolutionApplyService({
      reviewJobStore: store as never,
      skillEvolutionService: skillEvolutionService as never,
      agentEvolutionService: {} as never,
    })

    await service.apply(job.id)
    expect(skillEvolutionService.patchSkill).toHaveBeenCalledWith(expect.objectContaining({
      skillName: 'demo-skill',
      approved: true,
      actor: 'sensei',
    }))
  })
})
