/**
 * MissionAgentTokenTracker - Token
 *
 *  ExpertLifecycle  (chatId, agentId, model)
 *  5  token
 */

import type { ActivityState } from '../terminal/ActivityDeriver'
import type { TokenUsageStore } from '../stores/TokenUsageStore'
import type { ChatStore } from '../stores/ChatStore'
import { createLogger } from '../lib/logger'

const log = createLogger('MissionAgentTokenTracker')

export class MissionAgentTokenTracker {
  private throttleKeys = new Set<string>()
  private throttleTimers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(
    private chatId: string,
    private agentId: string,
    private tokenUsageStore: TokenUsageStore,
    private chatStore: ChatStore,
  ) {}

  /**  model  token  completed/waiting_input */
  flush(activity: ActivityState): void {
    if (!activity.modelUsage || activity.modelUsage.length === 0) return
    const wsId = this.chatStore.get(this.chatId)?.workspaceId || ''
    for (const usage of activity.modelUsage) {
      const tKey = `${this.chatId}:${this.agentId}:${usage.model}`
      const timer = this.throttleTimers.get(tKey)
      if (timer) { clearTimeout(timer); this.throttleTimers.delete(tKey) }
      this.throttleKeys.delete(tKey)
      log.debug('TokenUsage flush', { agentId: this.agentId, model: usage.model, in: usage.inputTokens, out: usage.outputTokens, cost: usage.costUsd })
      this.tokenUsageStore.upsert({
        chatId: this.chatId,
        workspaceId: wsId,
        agentId: this.agentId,
        model: usage.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadInputTokens: usage.cacheReadInputTokens,
        cacheCreationInputTokens: usage.cacheCreationInputTokens,
        costUsd: usage.costUsd,
      })
    }
  }

  throttledUpsert(activity: ActivityState): void {
    if (!activity.modelUsage || activity.modelUsage.length === 0) return
    for (const usage of activity.modelUsage) {
      const tKey = `${this.chatId}:${this.agentId}:${usage.model}`
      if (this.throttleKeys.has(tKey)) continue
      this.throttleKeys.add(tKey)
      this.throttleTimers.set(tKey, setTimeout(() => {
        this.throttleKeys.delete(tKey)
        this.throttleTimers.delete(tKey)
        this.tokenUsageStore.upsert({
          chatId: this.chatId,
          workspaceId: this.chatStore.get(this.chatId)?.workspaceId || '',
          agentId: this.agentId,
          model: usage.model,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cacheReadInputTokens: usage.cacheReadInputTokens,
          cacheCreationInputTokens: usage.cacheCreationInputTokens,
          costUsd: usage.costUsd,
        })
      }, 5000))
    }
  }

  destroy(): void {
    for (const timer of this.throttleTimers.values()) clearTimeout(timer)
    this.throttleTimers.clear()
    this.throttleKeys.clear()
  }
}
