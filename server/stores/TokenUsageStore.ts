import { randomUUID } from 'crypto'
import { SqliteBaseStore } from './SqliteBaseStore'
import { createLogger } from '../lib/logger'

const log = createLogger('TokenUsageStore')

export interface TokenUsage {
  id: string
  chatId: string
  workspaceId: string
  agentId: string
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
  costUsd: number
  turnCount: number
  syncedAt: string | null
  updatedAt: string
}

export interface ModelSummary {
  model: string
  totalInput: number
  totalOutput: number
  totalCacheRead: number
  totalCacheCreation: number
  totalCost: number
  chatCount: number
}

export interface DailySummary {
  date: string
  model: string
  totalInput: number
  totalOutput: number
  totalCacheRead: number
  totalCacheCreation: number
  totalCost: number
}

const MAX_ITEMS = 10000

export class TokenUsageStore extends SqliteBaseStore<TokenUsage> {
  constructor(_filePath?: string) {
    super(_filePath, { tableName: 'token_usage', maxItems: MAX_ITEMS })
  }

  /**
   * UPSERT (chatId, agentId, model)
   */
  upsert(params: {
    chatId: string
    workspaceId: string
    agentId: string
    model: string
    inputTokens: number
    outputTokens: number
    cacheReadInputTokens: number
    cacheCreationInputTokens: number
    costUsd: number
  }): void {
    this.db.prepare(`
      INSERT INTO token_usage (id, mission_id, workspace_id, agent_id, model, input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens, cost_usd, turn_count, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      ON CONFLICT(mission_id, agent_id, model) DO UPDATE SET
        input_tokens = excluded.input_tokens,
        output_tokens = excluded.output_tokens,
        cache_read_input_tokens = excluded.cache_read_input_tokens,
        cache_creation_input_tokens = excluded.cache_creation_input_tokens,
        cost_usd = excluded.cost_usd,
        turn_count = token_usage.turn_count + 1,
        updated_at = excluded.updated_at
    `).run(
      randomUUID(),
      params.chatId,
      params.workspaceId,
      params.agentId,
      params.model,
      params.inputTokens,
      params.outputTokens,
      params.cacheReadInputTokens,
      params.cacheCreationInputTokens,
      params.costUsd,
      new Date().toISOString(),
    )
  }

  listByChat(chatId: string): TokenUsage[] {
    const rows = this.db.prepare(
      'SELECT * FROM token_usage WHERE mission_id = ?'
    ).all(chatId)
    return rows.map((row) => this.rowToEntity(row as Record<string, unknown>))
  }

  summaryByWorkspace(workspaceId: string, since?: string): ModelSummary[] {
    const query = since
      ? 'SELECT model, SUM(input_tokens) as total_input, SUM(output_tokens) as total_output, SUM(cache_read_input_tokens) as total_cache_read, SUM(cache_creation_input_tokens) as total_cache_creation, SUM(cost_usd) as total_cost, COUNT(DISTINCT mission_id) as chat_count FROM token_usage WHERE workspace_id = ? AND updated_at >= ? GROUP BY model'
      : 'SELECT model, SUM(input_tokens) as total_input, SUM(output_tokens) as total_output, SUM(cache_read_input_tokens) as total_cache_read, SUM(cache_creation_input_tokens) as total_cache_creation, SUM(cost_usd) as total_cost, COUNT(DISTINCT mission_id) as chat_count FROM token_usage WHERE workspace_id = ? GROUP BY model'
    const params = since ? [workspaceId, since] : [workspaceId]
    const rows = this.db.prepare(query).all(...params) as Array<Record<string, unknown>>
    return rows.map((r) => ({
      model: r.model as string,
      totalInput: r.total_input as number,
      totalOutput: r.total_output as number,
      totalCacheRead: (r.total_cache_read as number) || 0,
      totalCacheCreation: (r.total_cache_creation as number) || 0,
      totalCost: r.total_cost as number,
      chatCount: r.chat_count as number,
    }))
  }

  dailySummary(days = 7): DailySummary[] {
    const since = new Date(Date.now() - days * 86400000).toISOString()
    const rows = this.db.prepare(`
      SELECT DATE(updated_at) as date, model,
        SUM(input_tokens) as total_input,
        SUM(output_tokens) as total_output,
        SUM(cache_read_input_tokens) as total_cache_read,
        SUM(cache_creation_input_tokens) as total_cache_creation,
        SUM(cost_usd) as total_cost
      FROM token_usage WHERE updated_at >= ?
      GROUP BY DATE(updated_at), model
      ORDER BY date DESC
    `).all(since) as Array<Record<string, unknown>>
    return rows.map((r) => ({
      date: r.date as string,
      model: r.model as string,
      totalInput: r.total_input as number,
      totalOutput: r.total_output as number,
      totalCacheRead: (r.total_cache_read as number) || 0,
      totalCacheCreation: (r.total_cache_creation as number) || 0,
      totalCost: r.total_cost as number,
    }))
  }

  summaryByChats(chatIds: string[]): Map<string, { totalInput: number; totalOutput: number; totalCacheRead: number; totalCacheCreation: number; totalCost: number; models: string[] }> {
    const result = new Map<string, { totalInput: number; totalOutput: number; totalCacheRead: number; totalCacheCreation: number; totalCost: number; models: string[] }>()
    if (chatIds.length === 0) return result

    const placeholders = chatIds.map(() => '?').join(',')
    const rows = this.db.prepare(`
      SELECT mission_id,
        SUM(input_tokens) as total_input,
        SUM(output_tokens) as total_output,
        SUM(cache_read_input_tokens) as total_cache_read,
        SUM(cache_creation_input_tokens) as total_cache_creation,
        SUM(cost_usd) as total_cost,
        GROUP_CONCAT(DISTINCT model) as models
      FROM token_usage
      WHERE mission_id IN (${placeholders})
      GROUP BY mission_id
    `).all(...chatIds) as Array<Record<string, unknown>>

    for (const r of rows) {
      result.set(r.mission_id as string, {
        totalInput: r.total_input as number,
        totalOutput: r.total_output as number,
        totalCacheRead: (r.total_cache_read as number) || 0,
        totalCacheCreation: (r.total_cache_creation as number) || 0,
        totalCost: r.total_cost as number,
        models: ((r.models as string) || '').split(',').filter(Boolean),
      })
    }
    return result
  }

  listUnsyncedByChat(chatId: string): TokenUsage[] {
    const rows = this.db.prepare(
      'SELECT * FROM token_usage WHERE mission_id = ? AND (synced_at IS NULL OR updated_at > synced_at)'
    ).all(chatId)
    const records = rows.map((row) => this.rowToEntity(row as Record<string, unknown>))
    log.debug('listUnsyncedByChat', { chatId, count: records.length })
    return records
  }

  listUnsyncedChatIds(): string[] {
    const rows = this.db.prepare(
      'SELECT DISTINCT mission_id FROM token_usage WHERE synced_at IS NULL OR updated_at > synced_at'
    ).all() as Array<{ mission_id: string }>
    const ids = rows.map((r) => r.mission_id)
    log.debug('listUnsyncedChatIds', { count: ids.length, chatIds: ids.slice(0, 10) })
    return ids
  }

  markSynced(chatId: string): void {
    const result = this.db.prepare(
      'UPDATE token_usage SET synced_at = ? WHERE mission_id = ?'
    ).run(new Date().toISOString(), chatId)
    log.debug('markSynced', { chatId, rowsAffected: result.changes })
  }

  protected rowToEntity(row: Record<string, unknown>): TokenUsage {
    return {
      id: row.id as string,
      chatId: row.mission_id as string,
      workspaceId: row.workspace_id as string,
      agentId: row.agent_id as string,
      model: row.model as string,
      inputTokens: row.input_tokens as number,
      outputTokens: row.output_tokens as number,
      cacheReadInputTokens: (row.cache_read_input_tokens as number) || 0,
      cacheCreationInputTokens: (row.cache_creation_input_tokens as number) || 0,
      costUsd: row.cost_usd as number,
      turnCount: row.turn_count as number,
      syncedAt: (row.synced_at as string) || null,
      updatedAt: row.updated_at as string,
    }
  }

  protected entityToRow(entity: TokenUsage): Record<string, unknown> {
    return {
      id: entity.id,
      mission_id: entity.chatId,
      workspace_id: entity.workspaceId,
      agent_id: entity.agentId,
      model: entity.model,
      input_tokens: entity.inputTokens,
      output_tokens: entity.outputTokens,
      cache_read_input_tokens: entity.cacheReadInputTokens,
      cache_creation_input_tokens: entity.cacheCreationInputTokens,
      cost_usd: entity.costUsd,
      turn_count: entity.turnCount,
      synced_at: entity.syncedAt,
      updated_at: entity.updatedAt,
    }
  }
}
