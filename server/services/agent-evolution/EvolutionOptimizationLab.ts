import { readFileSync } from 'fs'
import type {
  EvolutionAction,
  EvolutionMetrics,
  EvolutionProposal,
  EvolutionReviewJob,
  EvolutionReviewJobStore,
} from '../../stores/EvolutionReviewJobStore'
import { validateEvolutionProposal } from './EvolutionProposalParser'

export type OptimizationTarget =
  | { type: 'skill'; skillName: string; filePath?: string; baselineText: string; candidateText: string }
  | { type: 'agent_prompt_section'; agentId: string; filePath: 'IDENTITY.md' | 'AGENTS.md' | 'SOUL.md'; baselineText: string; candidateText: string }

export interface OptimizationExample {
  taskInput: string
  expectedBehavior: string
  split: 'train' | 'holdout'
}

interface EvolutionOptimizationLabDeps {
  reviewJobStore: Pick<EvolutionReviewJobStore, 'create' | 'setProposal' | 'get'>
  maxGrowthRatio?: number
}

export class EvolutionOptimizationLab {
  constructor(private deps: EvolutionOptimizationLabDeps) {}

  run(params: {
    target: OptimizationTarget
    dataset?: OptimizationExample[]
    datasetSource?: string
    goldenJsonlPath?: string
    syntheticCount?: number
  }): EvolutionReviewJob | null {
    const { dataset, datasetSource } = this.resolveDataset(params)
    const holdout = dataset.filter((example) => example.split === 'holdout')
    const baselineScore = scoreText(params.target.baselineText, holdout)
    const candidateScore = scoreText(params.target.candidateText, holdout)
    const sizeChange = params.target.candidateText.length - params.target.baselineText.length
    const gates = this.evaluateGates(params.target, candidateScore, baselineScore)
    const metrics: EvolutionMetrics = {
      baselineScore,
      candidateScore,
      holdoutScore: candidateScore,
      datasetSource,
      sizeChange,
      gates,
    }

    if (gates.some((gate) => !gate.passed)) return null

    const action = toAction(params.target)
    const targetId = params.target.type === 'skill' ? params.target.skillName : params.target.agentId
    const targetType = params.target.type === 'skill' ? 'skill' : 'agent'
    const job = this.deps.reviewJobStore.create({
      targetType,
      targetId,
      triggerType: 'optimization_lab',
      evidence: {
        datasetSource,
        baselineScore,
        candidateScore,
        sizeChange,
      },
    })

    const proposal: EvolutionProposal = {
      evidence: job.evidence,
      rootCause: 'Optimization lab found a candidate that scored better on held-out examples.',
      diff: buildDiff(params.target.baselineText, params.target.candidateText),
      expectedImpact: 'Improve the target behavior measured by the evaluation dataset.',
      risk: 'Medium: candidate text still requires human review before apply.',
      validationPlan: 'Review metrics and run targeted regression tests before applying.',
      rollbackPath: 'Reject the proposal, or use the generated rollback snapshot after apply.',
      actions: [action],
      metrics,
    }
    validateEvolutionProposal(proposal, job)
    this.deps.reviewJobStore.setProposal(job.id, proposal)
    return this.deps.reviewJobStore.get(job.id) ?? job
  }

  private evaluateGates(
    target: OptimizationTarget,
    candidateScore: number,
    baselineScore: number,
  ): Array<{ name: string; passed: boolean; message?: string }> {
    const growth = (target.candidateText.length - target.baselineText.length) / Math.max(1, target.baselineText.length)
    const maxGrowth = this.deps.maxGrowthRatio ?? 0.2
    return [
      {
        name: 'holdout_improvement',
        passed: candidateScore > baselineScore,
        message: `baseline=${baselineScore.toFixed(3)} candidate=${candidateScore.toFixed(3)}`,
      },
      {
        name: 'size_growth',
        passed: growth <= maxGrowth,
        message: `growth=${growth.toFixed(3)} max=${maxGrowth.toFixed(3)}`,
      },
      {
        name: 'semantic_preservation',
        passed: semanticOverlap(target.baselineText, target.candidateText) >= 0.2,
        message: 'Candidate must retain meaningful vocabulary overlap with baseline.',
      },
    ]
  }

  private resolveDataset(params: {
    target: OptimizationTarget
    dataset?: OptimizationExample[]
    datasetSource?: string
    goldenJsonlPath?: string
    syntheticCount?: number
  }): { dataset: OptimizationExample[]; datasetSource: string } {
    const parts: OptimizationExample[] = []
    const sources: string[] = []

    if (params.dataset?.length) {
      parts.push(...params.dataset.map((example, index) => normalizeExample(example, `dataset[${index}]`)))
      sources.push(params.datasetSource ?? 'provided')
    }

    if (params.goldenJsonlPath) {
      parts.push(...loadGoldenOptimizationDataset(params.goldenJsonlPath))
      sources.push(`golden:${params.goldenJsonlPath}`)
    }

    if (parts.length === 0) {
      parts.push(...generateSyntheticOptimizationDataset(params.target, params.syntheticCount))
      sources.push('synthetic')
    }

    if (!parts.some((example) => example.split === 'holdout')) {
      throw new Error('Optimization dataset must include at least one holdout example')
    }

    return {
      dataset: parts,
      datasetSource: params.datasetSource ?? sources.join('+'),
    }
  }
}

export const loadGoldenOptimizationDataset = (jsonlPath: string): OptimizationExample[] => {
  return readFileSync(jsonlPath, 'utf-8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return normalizeExample(JSON.parse(line) as Partial<OptimizationExample>, `${jsonlPath}:${index + 1}`)
      } catch (err) {
        if (err instanceof SyntaxError) {
          throw new Error(`Invalid optimization JSONL at ${jsonlPath}:${index + 1}`)
        }
        throw err
      }
    })
}

export const generateSyntheticOptimizationDataset = (
  target: OptimizationTarget,
  count = 4,
): OptimizationExample[] => {
  const targetName = target.type === 'skill' ? target.skillName : target.agentId
  const vocabulary = [...wordSet(`${target.baselineText} ${target.candidateText}`)].slice(0, 8)
  const expectedBehavior = vocabulary.length > 0
    ? vocabulary.slice(0, 6).join(' ')
    : 'preserve target behavior'
  const total = Math.max(2, count)

  return Array.from({ length: total }, (_, index) => ({
    taskInput: `Evaluate ${targetName} on ${vocabulary[index % Math.max(1, vocabulary.length)] ?? 'target behavior'}`,
    expectedBehavior,
    split: index === total - 1 ? 'holdout' : 'train',
  }))
}

const normalizeExample = (example: Partial<OptimizationExample>, label: string): OptimizationExample => {
  if (typeof example.taskInput !== 'string' || example.taskInput.trim().length === 0) {
    throw new Error(`Optimization example ${label} missing taskInput`)
  }
  if (typeof example.expectedBehavior !== 'string' || example.expectedBehavior.trim().length === 0) {
    throw new Error(`Optimization example ${label} missing expectedBehavior`)
  }
  if (example.split !== 'train' && example.split !== 'holdout') {
    throw new Error(`Optimization example ${label} must use split train or holdout`)
  }
  return {
    taskInput: example.taskInput,
    expectedBehavior: example.expectedBehavior,
    split: example.split,
  }
}

const scoreText = (text: string, examples: OptimizationExample[]): number => {
  if (examples.length === 0) return 0
  const targetWords = wordSet(text)
  let total = 0
  for (const example of examples) {
    const expected = wordSet(`${example.taskInput} ${example.expectedBehavior}`)
    const overlap = [...expected].filter((word) => targetWords.has(word)).length
    total += expected.size === 0 ? 0 : overlap / expected.size
  }
  return total / examples.length
}

const toAction = (target: OptimizationTarget): EvolutionAction => {
  if (target.type === 'skill') {
    return {
      type: 'skill_patch',
      skillName: target.skillName,
      filePath: target.filePath,
      find: target.baselineText,
      replace: target.candidateText,
    }
  }
  return {
    type: 'agent_prompt_patch',
    agentId: target.agentId,
    filePath: target.filePath,
    find: target.baselineText,
    replace: target.candidateText,
  }
}

const semanticOverlap = (a: string, b: string): number => {
  const left = wordSet(a)
  const right = wordSet(b)
  if (left.size === 0) return 0
  return [...left].filter((word) => right.has(word)).length / left.size
}

const wordSet = (text: string): Set<string> => {
  return new Set(text.toLowerCase().split(/[^a-z0-9_-]+/i).filter((word) => word.length >= 4))
}

const buildDiff = (baseline: string, candidate: string): string => {
  return [
    '```diff',
    `- ${baseline.slice(0, 1000)}`,
    `+ ${candidate.slice(0, 1000)}`,
    '```',
  ].join('\n')
}
