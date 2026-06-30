import { readFileSync } from 'fs'
import { join } from 'path'
import type { AgentRegistry } from '../../config/AgentRegistry'
import type { MemoryStore } from '../../stores/MemoryStore'
import type { EpisodicMemoryService } from './EpisodicMemoryService'
import type { EvolutionReviewJob } from '../../stores/EvolutionReviewJobStore'

export interface EvolutionReviewContext {
  targetId: string
  targetName?: string
  triggerType: string
  evidence: unknown
  promptFiles: Record<string, string>
  memories: Array<{ category: string; content: string; importance: number; source?: string }>
  episodes: Array<{ title: string; summary: string; outcome: string; sourceRef?: string }>
}

export class EvolutionReviewContextBuilder {
  constructor(
    private deps: {
      agentRegistry: Pick<AgentRegistry, 'get'>
      memoryStore?: MemoryStore
      episodicMemoryService?: EpisodicMemoryService
    },
  ) {}

  build(job: EvolutionReviewJob): EvolutionReviewContext {
    const agent = job.targetType === 'agent' ? this.deps.agentRegistry.get(job.targetId) : undefined
    const promptFiles: Record<string, string> = {}
    if (agent?.workspaceDir) {
      for (const name of ['IDENTITY.md', 'AGENTS.md', 'SOUL.md']) {
        try {
          promptFiles[name] = readFileSync(join(agent.workspaceDir, name), 'utf-8').slice(0, 8000)
        } catch {
          // File is optional for user-created agents.
        }
      }
    }

    const memories = job.targetType === 'agent' && this.deps.memoryStore
      ? this.deps.memoryStore.listByAgent(job.targetId).slice(0, 10).map((memory) => ({
        category: memory.category,
        content: memory.content,
        importance: memory.importance,
        source: memory.source,
      }))
      : []

    const query = `${job.triggerType}\n${JSON.stringify(job.evidence)}`
    const episodes = job.targetType === 'agent' && this.deps.episodicMemoryService
      ? this.deps.episodicMemoryService.search(job.targetId, query, 3).map((episode) => ({
        title: episode.title,
        summary: episode.summary,
        outcome: episode.outcome,
        sourceRef: episode.sourceRef,
      }))
      : []

    return {
      targetId: job.targetId,
      targetName: agent?.name,
      triggerType: job.triggerType,
      evidence: job.evidence,
      promptFiles,
      memories,
      episodes,
    }
  }
}
