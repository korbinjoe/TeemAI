import type { EvolutionProposal, EvolutionReviewJob } from '../../stores/EvolutionReviewJobStore'
import type { EvolutionReviewRunner } from './EvolutionReviewService'
import type { EvolutionReviewContextBuilder } from './EvolutionReviewContextBuilder'

export class SenseiReviewRunner implements EvolutionReviewRunner {
  constructor(private contextBuilder: EvolutionReviewContextBuilder) {}

  async run(job: EvolutionReviewJob, context: { allowedTools: readonly string[] }): Promise<EvolutionProposal> {
    const allowed = new Set(context.allowedTools)
    if (!allowed.has('episode_search') || !allowed.has('readonly_inspect') || !allowed.has('proposal_draft')) {
      throw new Error('Evolution review runner missing proposal-safe capabilities')
    }

    const reviewContext = this.contextBuilder.build(job)
    const lesson = buildLesson(job, reviewContext)
    const evidenceSummary = {
      trigger: job.triggerType,
      targetId: job.targetId,
      triggerEvidence: job.evidence,
      memories: reviewContext.memories,
      episodes: reviewContext.episodes,
      promptFiles: Object.keys(reviewContext.promptFiles),
    }

    return {
      evidence: evidenceSummary,
      rootCause: `The ${job.triggerType} signal indicates ${job.targetId} needs a stable runtime lesson before any prompt or skill file is changed.`,
      diff: [
        '```diff',
        '+ Add reviewed cross-session memory:',
        `+ ${lesson}`,
        '```',
      ].join('\n'),
      expectedImpact: 'Future missions for the target agent receive the reviewed lesson through Cross-Session Memory.',
      risk: 'Low: this proposal adds scoped memory only; prompt and skill files remain unchanged.',
      validationPlan: 'Apply the proposal, start the target agent on a related mission, and verify Cross-Session Memory includes the lesson.',
      rollbackPath: 'Delete the generated memory entry or reject the proposal before apply.',
      actions: [{
        type: 'memory_upsert',
        agentId: job.targetId,
        category: 'feedback',
        importance: job.triggerType === 'low_satisfaction' || job.triggerType === 'repeated_corrections' ? 3 : 2,
        source: `evolution-review:${job.id}`,
        content: lesson,
      }],
    }
  }
}

const buildLesson = (
  job: EvolutionReviewJob,
  context: ReturnType<EvolutionReviewContextBuilder['build']>,
): string => {
  const target = context.targetName ? `${context.targetName} (${job.targetId})` : job.targetId
  const episode = context.episodes[0]?.summary
  const evidence = typeof job.evidence === 'object' && job.evidence
    ? JSON.stringify(job.evidence)
    : String(job.evidence ?? '')
  const detail = episode || evidence.slice(0, 240) || 'review the triggering evidence before repeating the same approach'
  return `For ${target}, ${job.triggerType} was observed. Before similar future work, review this lesson: ${detail}`
}
