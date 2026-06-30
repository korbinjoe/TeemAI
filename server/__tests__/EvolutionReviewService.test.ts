import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { EVOLUTION_REVIEW_TOOLS, EvolutionReviewService } from '../services/agent-evolution/EvolutionReviewService'
import type { EvolutionProposal, EvolutionReviewJob, EvolutionReviewStatus, EvolutionReviewTargetType } from '../stores/EvolutionReviewJobStore'

class FakeReviewJobStore {
  jobs: EvolutionReviewJob[] = []

  create(params: { targetType: EvolutionReviewTargetType; targetId: string; triggerType: string; evidence: unknown }): EvolutionReviewJob {
    const now = new Date().toISOString()
    const job: EvolutionReviewJob = {
      id: `job-${this.jobs.length + 1}`,
      targetType: params.targetType,
      targetId: params.targetId,
      triggerType: params.triggerType,
      evidence: params.evidence,
      status: 'queued',
      createdAt: now,
      updatedAt: now,
    }
    this.jobs.push(job)
    return job
  }

  get(id: string): EvolutionReviewJob | undefined {
    return this.jobs.find((job) => job.id === id)
  }

  nextQueued(): EvolutionReviewJob | undefined {
    return this.jobs.find((job) => job.status === 'queued')
  }

  latestForTarget(targetType: EvolutionReviewTargetType, targetId: string): EvolutionReviewJob | undefined {
    return [...this.jobs].reverse().find((job) => job.targetType === targetType && job.targetId === targetId)
  }

  updateStatus(id: string, status: EvolutionReviewStatus, error?: string): void {
    const job = this.get(id)
    if (!job) return
    job.status = status
    job.error = error
    job.updatedAt = new Date().toISOString()
  }

  setProposal(id: string, proposal: EvolutionProposal): void {
    const job = this.get(id)
    if (!job) return
    job.proposal = proposal
    job.status = 'proposal_ready'
  }

  setAppliedActions(): void {}
}

const proposal = (evidence: unknown): EvolutionProposal => ({
  evidence,
  rootCause: 'Repeated corrections show a skill gap.',
  diff: 'No direct mutation.',
  expectedImpact: 'Better future routing.',
  risk: 'Low',
  validationPlan: 'Run targeted tests.',
  rollbackPath: 'Reject proposal.',
  actions: [{
    type: 'memory_upsert',
    agentId: 'architect',
    content: 'Remember to clarify repeated corrections before changing prompts.',
  }],
})

describe('EvolutionReviewService', () => {
  it('enqueues trigger review jobs', () => {
    const store = new FakeReviewJobStore()
    const service = new EvolutionReviewService(store as never)

    const job = service.enqueueFromTrigger({
      agentId: 'ui-designer',
      type: 'low_satisfaction',
      severity: 'high',
      evidence: { avgMss: -10 },
    })

    expect(job.status).toBe('queued')
    expect(job.targetId).toBe('ui-designer')
    expect(job.triggerType).toBe('low_satisfaction')
  })

  it('runs queued jobs through a restricted tool surface and stores a proposal', async () => {
    const store = new FakeReviewJobStore()
    const runner = { run: vi.fn(async (job: EvolutionReviewJob) => ({
      ...proposal(job.evidence),
      actions: [{
        type: 'memory_upsert',
        agentId: job.targetId,
        content: 'Remember to clarify repeated corrections before changing prompts.',
      }],
    })) }
    const service = new EvolutionReviewService(store as never, runner)
    service.enqueueFromTrigger({
      agentId: 'architect',
      type: 'repeated_corrections',
      severity: 'high',
      evidence: { examples: ['c1'] },
    })

    const job = await service.runNext()

    expect(runner.run).toHaveBeenCalledWith(expect.any(Object), { allowedTools: EVOLUTION_REVIEW_TOOLS })
    expect(EVOLUTION_REVIEW_TOOLS).toEqual(['episode_search', 'readonly_inspect', 'proposal_draft'])
    expect(job?.status).toBe('proposal_ready')
    expect(job?.proposal?.validationPlan).toBe('Run targeted tests.')
  })

  it('queues periodic nudges when mission or turn thresholds are reached', () => {
    const store = new FakeReviewJobStore()
    const service = new EvolutionReviewService(store as never)

    const jobs = service.enqueuePeriodicDue([
      { agentId: 'lead', missionCount: 10, turnCount: 1 },
      { agentId: 'quiet-agent', missionCount: 1, turnCount: 1 },
    ])

    expect(jobs).toHaveLength(1)
    expect(jobs[0].triggerType).toBe('periodic_nudge')
  })

  it('does not mutate files while producing review proposals', async () => {
    const root = mkdtempSync(join(tmpdir(), 'teemai-review-service-'))
    const skillDir = join(root, 'skills', 'bundled-skill')
    mkdirSync(skillDir, { recursive: true })
    const skillPath = join(skillDir, 'SKILL.md')
    writeFileSync(skillPath, 'original', 'utf-8')

    try {
      const store = new FakeReviewJobStore()
      const service = new EvolutionReviewService(store as never, {
        run: vi.fn(async (job) => ({
          ...proposal({ ...job.evidence, suggestedFile: skillPath }),
          actions: [{
            type: 'memory_upsert',
            agentId: job.targetId,
            content: 'Proposal only memory action.',
          }],
        })),
      })
      service.enqueueFromTrigger({
        agentId: 'sensei',
        type: 'stale_prompt',
        severity: 'medium',
        evidence: { skillPath },
      })

      await service.runNext()

      expect(readFileSync(skillPath, 'utf-8')).toBe('original')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('requires approval before apply', async () => {
    const store = new FakeReviewJobStore()
    const applyExecutor = {
      apply: vi.fn(async (jobId: string) => {
        store.updateStatus(jobId, 'applied')
        return store.get(jobId)!
      }),
    }
    const service = new EvolutionReviewService(store as never, {
      run: vi.fn(async (job) => ({
        ...proposal(job.evidence),
        actions: [{
          type: 'memory_upsert',
          agentId: job.targetId,
          content: 'Approved memory action.',
        }],
      })),
    }, applyExecutor)
    const queued = service.enqueueFromTrigger({
      agentId: 'lead',
      type: 'low_satisfaction',
      severity: 'high',
      evidence: {},
    })
    await service.runNext()

    await expect(service.apply(queued.id)).rejects.toThrow(/must be approved/)
    expect(service.approve(queued.id).status).toBe('approved')
    await expect(service.apply(queued.id)).resolves.toMatchObject({ status: 'applied' })
    expect(applyExecutor.apply).toHaveBeenCalledWith(queued.id)
  })

  it('fails queued jobs when no review runner is configured', async () => {
    const store = new FakeReviewJobStore()
    const service = new EvolutionReviewService(store as never)
    const queued = service.enqueueFromTrigger({
      agentId: 'lead',
      type: 'low_satisfaction',
      severity: 'high',
      evidence: {},
    })

    const job = await service.runNext()

    expect(job?.status).toBe('failed')
    expect(store.get(queued.id)?.error).toMatch(/runner unavailable/)
  })
})
