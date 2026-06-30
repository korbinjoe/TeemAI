import type { WhiteboardEntry } from '../../../shared/whiteboard-types'
import type { Episode, EpisodeOutcome, EpisodeSearchResult, EpisodeStore } from '../../stores/EpisodeStore'
import type { ParsedMessage } from '../../terminal/ConversationParser'
import { parseConversationFile } from '../../terminal/ConversationParser'

const DURABLE_WHITEBOARD_TYPES = new Set(['decision', 'constraint', 'artifact', 'progress'])
const CORRECTION_RE = /不对|错了|重新|没有实现|还是没|没得到解决|你这也没|wrong|not right|try again/i
const ACCEPTANCE_RE = /可以|好了|done|works|accepted|looks good|LGTM/i
const FILE_RE = /(?:[\w.-]+\/)+[\w.-]+\.[a-zA-Z0-9]+/g

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
    lesson?: string
    hasLesson?: boolean
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
      lesson: params.lesson,
      hasLesson: params.hasLesson ?? !!params.lesson,
      sourceRef: params.sourceRef,
      startedAt: params.startedAt ?? params.completedAt ?? new Date().toISOString(),
      completedAt: params.completedAt ?? new Date().toISOString(),
    })
  }

  indexCompletedMissionFromTranscript(params: {
    agentId: string
    missionId: string
    title?: string
    outcome: EpisodeOutcome
    jsonlPath?: string | null
    fallbackSummary?: string
  }): Episode {
    const extracted = params.jsonlPath
      ? extractEpisodeFromTranscript(parseConversationFile(params.jsonlPath), params.outcome)
      : null
    const summary = extracted?.summary || params.fallbackSummary || buildFallbackSummary(params.agentId, params.outcome)
    return this.indexCompletedMission({
      agentId: params.agentId,
      missionId: params.missionId,
      title: params.title || extracted?.title || `${params.outcome === 'success' ? 'Completed' : 'Ended'} mission ${params.missionId}`,
      summary,
      lesson: extracted?.lesson,
      hasLesson: extracted?.hasLesson ?? !!extracted?.lesson,
      outcome: params.outcome,
      files: extracted?.files,
      tags: ['mission', ...(extracted?.tags ?? [])],
      sourceRef: params.jsonlPath ? `jsonl:${params.jsonlPath}` : `mission:${params.missionId}`,
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
      lesson: params.summary,
      hasLesson: true,
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
      lesson: entry.summary,
      hasLesson: ['decision', 'constraint'].includes(entry.type),
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

export const extractEpisodeFromTranscript = (
  messages: ParsedMessage[],
  outcome: EpisodeOutcome,
): { title: string; summary: string; lesson?: string; hasLesson: boolean; files: string[]; tags: string[] } | null => {
  const textMessages = messages.filter((message) => message.type === 'text' && message.content.trim())
  if (textMessages.length === 0) return null

  const userTexts = textMessages.filter((message) => message.role === 'user').map((message) => message.content.trim())
  const agentTexts = textMessages.filter((message) => message.role === 'agent').map((message) => message.content.trim())
  const goal = userTexts[0]?.slice(0, 180) || 'Mission'
  const corrections = userTexts.filter((text) => CORRECTION_RE.test(text)).slice(-3)
  const accepted = [...userTexts].reverse().find((text) => ACCEPTANCE_RE.test(text))
  const finalAgent = agentTexts.at(-1)?.slice(0, 260)
  const combined = textMessages.map((message) => message.content).join('\n')
  const files = [...new Set(combined.match(FILE_RE) ?? [])].slice(0, 8)

  const lessonParts: string[] = []
  if (corrections.length > 0) lessonParts.push(`Correction pattern: ${corrections.join(' | ')}`)
  if (accepted) lessonParts.push(`Accepted signal: ${accepted.slice(0, 160)}`)
  if (finalAgent) lessonParts.push(`Final approach: ${finalAgent}`)

  const hasLesson = lessonParts.length > 0
  const lesson = hasLesson ? lessonParts.join(' ') : undefined
  const outcomeText = outcome === 'success' ? 'succeeded' : outcome === 'failed' ? 'failed' : outcome
  const summary = hasLesson
    ? `Goal: ${goal}. Lesson: ${lesson}`
    : `Goal: ${goal}. Outcome: ${outcomeText}.`
  const tags = [
    corrections.length > 0 ? 'correction' : null,
    accepted ? 'accepted' : null,
    files.length > 0 ? 'files' : null,
  ].filter((tag): tag is string => !!tag)

  return {
    title: goal,
    summary,
    lesson,
    hasLesson,
    files,
    tags,
  }
}

const buildFallbackSummary = (agentId: string, outcome: EpisodeOutcome): string => {
  return `Mission for ${agentId} ended with outcome ${outcome}. Review transcript or whiteboard for details before repeating this approach.`
}
