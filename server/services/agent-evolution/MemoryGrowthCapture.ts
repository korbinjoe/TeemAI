import type { MemoryStore } from '../../stores/MemoryStore'
import type { WhiteboardManager } from '../../whiteboard/WhiteboardManager'
import type { AgentRegistry } from '../../config/AgentRegistry'
import type { WhiteboardEntry } from '../../../shared/whiteboard-types'
import type { MemoryCategory } from '../../config/types'
import { canonicalAgentId } from '../../../shared/utils'
import type { EpisodicMemoryService } from './EpisodicMemoryService'
import type { ChatStore } from '../../stores/ChatStore'
import { resolveExpertSessionJsonl } from '../sessionFilePurger'
import { createLogger } from '../../lib/logger'

const log = createLogger('MemoryGrowthCapture')

const CAPTURE_TYPES = new Set(['decision', 'constraint', 'open_question'])

const TYPE_CATEGORY_MAP: Record<string, { category: MemoryCategory; importance: number }> = {
  decision: { category: 'context', importance: 2 },
  constraint: { category: 'context', importance: 3 },
  open_question: { category: 'feedback', importance: 2 },
}

export class MemoryGrowthCapture {
  private sourceSeen = new Map<string, true>()

  constructor(
    private memoryStore: MemoryStore,
    private whiteboardManager: WhiteboardManager,
    private agentRegistry: AgentRegistry,
    private episodicMemoryService?: EpisodicMemoryService,
    private chatStore?: ChatStore,
  ) {
    this.loadSourceIndex()
  }

  private loadSourceIndex(): void {
    try {
      const sources = this.memoryStore.listAllSources()
      for (const key of sources) {
        this.sourceSeen.set(key, true)
      }
      log.info('Loaded source dedup index', { count: this.sourceSeen.size })
    } catch (err) {
      log.warn('Failed to load source index', { error: err instanceof Error ? err.message : String(err) })
    }
  }

  onTaskCompleted(agentId: string, _chatId: string): void {
    const canonical = canonicalAgentId(agentId, this.agentRegistry)
    if (!canonical) return
    const jsonlPath = this.resolveJsonlPath(_chatId, canonical)
    this.episodicMemoryService?.indexCompletedMissionFromTranscript({
      agentId: canonical,
      missionId: _chatId,
      title: `Completed mission ${_chatId}`,
      outcome: 'success',
      jsonlPath,
      fallbackSummary: `Mission for ${canonical} completed. Review transcript or whiteboard for reusable details.`,
    })
    log.debug('Task completed (growth tracking deprecated)', { agentId: canonical })
  }

  onTaskFailed(agentId: string, chatId: string): void {
    const canonical = canonicalAgentId(agentId, this.agentRegistry)
    if (!canonical) return
    const jsonlPath = this.resolveJsonlPath(chatId, canonical)
    this.episodicMemoryService?.indexCompletedMissionFromTranscript({
      agentId: canonical,
      missionId: chatId,
      title: `Failed mission ${chatId}`,
      outcome: 'failed',
      jsonlPath,
      fallbackSummary: `Mission for ${canonical} failed. Do not repeat this approach without reviewing evidence.`,
    })
  }

  onWhiteboardEntry(chatId: string, entry: WhiteboardEntry): void {
    const canonicalBy = canonicalAgentId(entry.by, this.agentRegistry)
    if (canonicalBy) {
      this.episodicMemoryService?.indexWhiteboardEntry({ ...entry, by: canonicalBy })
    }

    if (!CAPTURE_TYPES.has(entry.type)) return

    if (entry.type === 'open_question' && entry.status !== 'archived') return

    const agentId = canonicalBy ?? this.resolveAgentId(entry.by)
    if (!agentId) return

    const source = `wb:${chatId}:${entry.id}`
    if (this.sourceSeen.has(source)) return

    const mapping = TYPE_CATEGORY_MAP[entry.type]
    if (!mapping) return

    try {
      this.memoryStore.create({
        agentId,
        content: entry.summary,
        category: mapping.category,
        source,
        chatId,
        importance: mapping.importance,
      })
      this.sourceSeen.set(source, true)
      log.info('Captured whiteboard entry as memory', { agentId, type: entry.type, entryId: entry.id })
    } catch (err) {
      log.error('Failed to capture whiteboard entry', { agentId, entryId: entry.id, error: err instanceof Error ? err.message : String(err) })
    }
  }

  private resolveAgentId(by: string): string | null {
    const agentId = canonicalAgentId(by, this.agentRegistry)
    if (agentId) return agentId
    log.debug('Skipping unrecognized agent', { by })
    return null
  }

  private resolveJsonlPath(chatId: string, agentId: string): string | null {
    const session = this.chatStore?.get(chatId)?.expertSessions?.[agentId]
    if (!session) return null
    return resolveExpertSessionJsonl(session).path
  }
}
