import type { WhiteboardEntry } from '../../../shared/whiteboard-types'
import type { Episode, EpisodeOutcome, EpisodeSearchResult, EpisodeStore } from '../../stores/EpisodeStore'

const DURABLE_WHITEBOARD_TYPES = new Set(['decision', 'constraint', 'artifact', 'progress'])

export class EpisodicMemoryService {
  constructor(private episodeStore: EpisodeStore) {}

  indexCompletedMission(params: {
    agentId: string
    missionId: string
    title: string
    summary: string
    outcome: EpisodeOutcome
    files?: string[]
    tags?: string[]
    startedAt?: string
    completedAt?: string
    sourceRef?: string
  }): Episode {
    return this.episodeStore.upsert({
      agentId: params.agentId,
      missionId: params.missionId,
      title: params.title,
      summary: params.summary,
      outcome: params.outcome,
      tags: params.tags ?? [],
      files: params.files ?? [],
      sourceRef: params.sourceRef,
      startedAt: params.startedAt ?? params.completedAt ?? new Date().toISOString(),
      completedAt: params.completedAt ?? new Date().toISOString(),
    })
  }

  indexWorkflowTaskResult(params: {
    agentId: string
    missionId: string
    taskId: string
    summary: string
    outcome: EpisodeOutcome
    files?: string[]
  }): Episode {
    return this.indexCompletedMission({
      agentId: params.agentId,
      missionId: params.missionId,
      title: `Workflow task ${params.taskId}`,
      summary: params.summary,
      outcome: params.outcome,
      files: params.files,
      tags: ['workflow', params.taskId],
      sourceRef: `task:${params.taskId}`,
    })
  }

  indexWhiteboardEntry(entry: WhiteboardEntry): Episode | null {
    if (!DURABLE_WHITEBOARD_TYPES.has(entry.type)) return null
    return this.indexCompletedMission({
      agentId: entry.by,
      missionId: entry.chatId,
      title: `Whiteboard ${entry.type}`,
      summary: entry.summary,
      outcome: entry.type === 'progress' ? 'success' : 'unknown',
      files: entry.refs?.files ?? [],
      tags: [entry.type, ...(entry.tags ?? [])],
      startedAt: entry.timestamp,
      completedAt: entry.timestamp,
      sourceRef: `wb:${entry.chatId}:${entry.id}`,
    })
  }

  search(agentId: string, query: string, limit = 3): EpisodeSearchResult[] {
    return this.episodeStore.search(agentId, query, limit)
  }
}
