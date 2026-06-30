import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { EvolutionOptimizationLab } from '../services/agent-evolution/EvolutionOptimizationLab'
import type { EvolutionReviewJob, EvolutionProposal } from '../stores/EvolutionReviewJobStore'

class FakeStore {
  jobs: EvolutionReviewJob[] = []

  create(params: { targetType: 'agent' | 'skill' | 'team'; targetId: string; triggerType: string; evidence: unknown }): EvolutionReviewJob {
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

  setProposal(id: string, proposal: EvolutionProposal): void {
    const job = this.get(id)
    if (!job) return
    job.proposal = proposal
    job.status = 'proposal_ready'
  }

  get(id: string): EvolutionReviewJob | undefined {
    return this.jobs.find((job) => job.id === id)
  }
}

const dataset = [
  { split: 'holdout' as const, taskInput: 'review code', expectedBehavior: 'code review security callback validation' },
  { split: 'train' as const, taskInput: 'find issue', expectedBehavior: 'security validation' },
]

describe('EvolutionOptimizationLab', () => {
  it('creates proposal-only jobs for winning skill candidates', () => {
    const store = new FakeStore()
    const lab = new EvolutionOptimizationLab({ reviewJobStore: store as never, maxGrowthRatio: 3 })

    const job = lab.run({
      target: {
        type: 'skill',
        skillName: 'code-review',
        baselineText: 'review code',
        candidateText: 'review code security callback validation',
      },
      dataset,
      datasetSource: 'synthetic',
    })

    expect(job?.status).toBe('proposal_ready')
    expect(job?.proposal?.actions[0]).toMatchObject({ type: 'skill_patch', skillName: 'code-review' })
    expect(job?.proposal?.metrics?.holdoutScore).toBeGreaterThan(job?.proposal?.metrics?.baselineScore ?? 0)
  })

  it('rejects holdout regressions and does not enqueue proposals', () => {
    const store = new FakeStore()
    const setProposal = vi.spyOn(store, 'setProposal')
    const lab = new EvolutionOptimizationLab({ reviewJobStore: store as never })

    const job = lab.run({
      target: {
        type: 'skill',
        skillName: 'code-review',
        baselineText: 'review code security callback validation',
        candidateText: 'unrelated words',
      },
      dataset,
      datasetSource: 'synthetic',
    })

    expect(job).toBeNull()
    expect(setProposal).not.toHaveBeenCalled()
  })

  it('rejects candidates that exceed size growth gates', () => {
    const store = new FakeStore()
    const lab = new EvolutionOptimizationLab({ reviewJobStore: store as never, maxGrowthRatio: 0.2 })

    const job = lab.run({
      target: {
        type: 'agent_prompt_section',
        agentId: 'code-reviewer',
        filePath: 'SOUL.md',
        baselineText: 'code review security callback validation',
        candidateText: `code review security callback validation ${'extra '.repeat(20)}`,
      },
      dataset,
      datasetSource: 'golden',
    })

    expect(job).toBeNull()
  })

  it('loads optional golden JSONL datasets', () => {
    const root = mkdtempSync(join(tmpdir(), 'teemai-optimization-lab-'))
    const goldenPath = join(root, 'golden.jsonl')
    writeFileSync(goldenPath, [
      JSON.stringify({ split: 'train', taskInput: 'find issue', expectedBehavior: 'security validation' }),
      JSON.stringify({ split: 'holdout', taskInput: 'review code', expectedBehavior: 'code review security callback validation' }),
    ].join('\n'), 'utf-8')

    try {
      const store = new FakeStore()
      const lab = new EvolutionOptimizationLab({ reviewJobStore: store as never, maxGrowthRatio: 3 })

      const job = lab.run({
        target: {
          type: 'skill',
          skillName: 'code-review',
          baselineText: 'review code',
          candidateText: 'review code security callback validation',
        },
        goldenJsonlPath: goldenPath,
      })

      expect(job?.status).toBe('proposal_ready')
      expect(job?.proposal?.metrics?.datasetSource).toBe(`golden:${goldenPath}`)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('generates a synthetic dataset when no dataset is provided', () => {
    const store = new FakeStore()
    const lab = new EvolutionOptimizationLab({ reviewJobStore: store as never, maxGrowthRatio: 3 })

    const job = lab.run({
      target: {
        type: 'agent_prompt_section',
        agentId: 'code-reviewer',
        filePath: 'SOUL.md',
        baselineText: 'review code',
        candidateText: 'review code security callback validation',
      },
    })

    expect(job?.status).toBe('proposal_ready')
    expect(job?.proposal?.metrics?.datasetSource).toBe('synthetic')
  })
})
