import type { AgentMemory, MemoryCategory } from '../../config/types'
import type { MemoryStore } from '../../stores/MemoryStore'
import type { SkillEvolutionService } from './SkillEvolutionService'
import type { AgentEvolutionService } from './AgentEvolutionService'
import type {
  AppliedEvolutionAction,
  EvolutionAction,
  EvolutionReviewJob,
  EvolutionReviewJobStore,
} from '../../stores/EvolutionReviewJobStore'
import { validateEvolutionActions } from './EvolutionProposalParser'

interface EvolutionApplyDeps {
  reviewJobStore: Pick<EvolutionReviewJobStore, 'get' | 'updateStatus' | 'setAppliedActions'>
  skillEvolutionService: SkillEvolutionService
  agentEvolutionService: AgentEvolutionService
  memoryStore?: MemoryStore
}

export class EvolutionApplyService {
  constructor(private deps: EvolutionApplyDeps) {}

  async apply(jobId: string): Promise<EvolutionReviewJob> {
    const job = this.deps.reviewJobStore.get(jobId)
    if (!job) throw new Error('Evolution review job not found')
    if (job.status !== 'approved') throw new Error('Evolution review job must be approved before apply')
    if (!job.proposal) throw new Error('Evolution review job has no proposal')
    validateEvolutionActions(job.proposal.actions, job)

    const applied: AppliedEvolutionAction[] = []
    try {
      for (const action of job.proposal.actions) {
        const result = await this.applyAction(action, job)
        applied.push({ action, status: 'applied', ...result })
      }
      this.deps.reviewJobStore.setAppliedActions(jobId, applied)
      this.deps.reviewJobStore.updateStatus(jobId, 'applied')
      const next = this.deps.reviewJobStore.get(jobId)
      if (!next) throw new Error('Evolution review job not found after apply')
      return next
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.deps.reviewJobStore.setAppliedActions(jobId, [...applied, {
        action: job.proposal.actions[applied.length] ?? job.proposal.actions[0],
        status: 'failed',
        error: message,
      }])
      this.deps.reviewJobStore.updateStatus(jobId, 'failed', message)
      throw err
    }
  }

  private async applyAction(
    action: EvolutionAction,
    job: EvolutionReviewJob,
  ): Promise<{ changedFile?: string; rollbackRef?: string; result?: unknown }> {
    const actor = 'sensei'
    const sourceRef = `evolution-review:${job.id}`
    switch (action.type) {
      case 'agent_prompt_patch': {
        const result = await this.deps.agentEvolutionService.patchAgentFile({
          agentId: action.agentId,
          filePath: action.filePath,
          find: action.find,
          replace: action.replace,
          actor,
          sourceRef,
          evidence: asEvidence(job.evidence),
        })
        return { changedFile: result.filePath, rollbackRef: result.rollbackRef }
      }
      case 'skill_patch': {
        const result = await this.deps.skillEvolutionService.patchSkill({
          skillName: action.skillName,
          filePath: action.filePath,
          find: action.find,
          replace: action.replace,
          approved: true,
          actor,
        })
        return { changedFile: result.filePath, rollbackRef: result.rollbackRef }
      }
      case 'skill_create': {
        const result = await this.deps.skillEvolutionService.createSkill({
          name: action.skillName,
          description: action.description,
          body: action.body,
          createdBy: action.createdBy ?? actor,
          approved: true,
        })
        return { changedFile: result.path, rollbackRef: result.rollbackRef }
      }
      case 'skill_write_file': {
        const result = await this.deps.skillEvolutionService.writeSkillFile({
          skillName: action.skillName,
          filePath: action.filePath,
          content: action.content,
          approved: true,
          actor,
        })
        return { changedFile: result.filePath, rollbackRef: result.rollbackRef }
      }
      case 'skill_archive': {
        const result = await this.deps.skillEvolutionService.archiveSkill(action.skillName, { approved: true, actor })
        return { changedFile: result.archivePath, rollbackRef: result.rollbackRef }
      }
      case 'skill_restore': {
        const result = await this.deps.skillEvolutionService.restoreSkill(action.skillName, action.archivePath, { approved: true, actor })
        return { changedFile: result.path, rollbackRef: result.rollbackRef }
      }
      case 'skill_pin':
        await this.deps.skillEvolutionService.pinSkill(action.skillName, action.pinned, actor)
        return { result: { pinned: action.pinned } }
      case 'memory_upsert': {
        if (!this.deps.memoryStore) throw new Error('MemoryStore unavailable')
        const memory = await this.deps.memoryStore.create({
          agentId: action.agentId,
          category: normalizeMemoryCategory(action.category),
          content: action.content,
          source: action.source ?? sourceRef,
          importance: action.importance,
        })
        return { result: memory }
      }
    }
  }
}

const asEvidence = (value: unknown): Record<string, unknown> | undefined => {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

const normalizeMemoryCategory = (category?: string): AgentMemory['category'] | undefined => {
  if (!category) return undefined
  return (['general', 'preference', 'context', 'feedback', 'skill'].includes(category) ? category : 'general') as MemoryCategory
}
