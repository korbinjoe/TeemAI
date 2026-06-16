import type { TriggerResult } from './EvolutionTrigger'
import type { EvolutionProposal, EvolutionReviewJob, EvolutionReviewJobStore } from '../../stores/EvolutionReviewJobStore'
import { validateEvolutionProposal } from './EvolutionProposalParser'

export const EVOLUTION_REVIEW_TOOLS = [
  'memory_evolve',
  'skill_evolve',
  'episode_search',
  'readonly_inspect',
] as const

export interface EvolutionReviewRunner {
  run(job: EvolutionReviewJob, context: { allowedTools: readonly string[] }): Promise<EvolutionProposal>
}

export class EvolutionReviewService {
  constructor(
    private store: EvolutionReviewJobStore,
    private runner?: EvolutionReviewRunner,
  ) {}

  enqueueFromTrigger(trigger: TriggerResult): EvolutionReviewJob {
    return this.store.create({
      targetType: 'agent',
      targetId: trigger.agentId,
      triggerType: trigger.type,
      evidence: trigger.evidence,
    })
  }

  enqueuePeriodicDue(
    agents: Array<{ agentId: string; missionCount: number; turnCount: number }>,
    thresholds = { missions: 10, turns: 50 },
  ): EvolutionReviewJob[] {
    const jobs: EvolutionReviewJob[] = []
    for (const agent of agents) {
      if (agent.missionCount < thresholds.missions && agent.turnCount < thresholds.turns) continue
      const latest = this.store.latestForTarget('agent', agent.agentId)
      if (latest && ['queued', 'running', 'proposal_ready', 'approved'].includes(latest.status)) continue
      jobs.push(this.store.create({
        targetType: 'agent',
        targetId: agent.agentId,
        triggerType: 'periodic_nudge',
        evidence: {
          missionCount: agent.missionCount,
          turnCount: agent.turnCount,
          thresholds,
        },
      }))
    }
    return jobs
  }

  async runNext(): Promise<EvolutionReviewJob | null> {
    const job = this.store.nextQueued()
    if (!job) return null

    this.store.updateStatus(job.id, 'running')
    try {
      const proposal = await this.runIsolatedReview(job)
      validateEvolutionProposal(proposal)
      this.store.setProposal(job.id, proposal)
      return this.store.get(job.id) ?? null
    } catch (err) {
      this.store.updateStatus(job.id, 'failed', err instanceof Error ? err.message : String(err))
      return this.store.get(job.id) ?? null
    }
  }

  approve(jobId: string): EvolutionReviewJob {
    this.store.updateStatus(jobId, 'approved')
    const job = this.store.get(jobId)
    if (!job) throw new Error('Evolution review job not found')
    return job
  }

  reject(jobId: string): EvolutionReviewJob {
    this.store.updateStatus(jobId, 'rejected')
    const job = this.store.get(jobId)
    if (!job) throw new Error('Evolution review job not found')
    return job
  }

  apply(jobId: string): EvolutionReviewJob {
    const job = this.store.get(jobId)
    if (!job) throw new Error('Evolution review job not found')
    if (job.status !== 'approved') throw new Error('Evolution review job must be approved before apply')
    this.store.updateStatus(jobId, 'applied')
    const applied = this.store.get(jobId)
    if (!applied) throw new Error('Evolution review job not found')
    return applied
  }

  private async runIsolatedReview(job: EvolutionReviewJob): Promise<EvolutionProposal> {
    if (this.runner) {
      return this.runner.run(job, { allowedTools: EVOLUTION_REVIEW_TOOLS })
    }
    return this.buildDefaultProposal(job)
  }

  private buildDefaultProposal(job: EvolutionReviewJob): EvolutionProposal {
    return {
      evidence: job.evidence,
      rootCause: `Review required for ${job.targetType} ${job.targetId} due to ${job.triggerType}.`,
      diff: 'Proposal only. No file changes were applied by the background review job.',
      expectedImpact: 'Give Sensei a concrete review item without mutating agent or skill files.',
      risk: 'Low: this job records a proposal and waits for approval.',
      validationPlan: 'Inspect evidence, approve only if the proposed change is still relevant, then run targeted tests.',
      rollbackPath: 'No runtime mutation has occurred; reject the proposal to discard it.',
    }
  }
}
