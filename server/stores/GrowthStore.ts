/**
 * GrowthStore — Agent /
 *
 *  Agent metric value  level
 * level  value
 */

import { randomUUID } from 'crypto'
import { SqliteBaseStore } from './SqliteBaseStore'
import type { AgentGrowth, GrowthMetric } from '../config/types'

const LEVEL_THRESHOLDS = [0, 10, 30, 60, 100, 150, 210, 280, 360, 450, 550]

const valueToLevel = (value: number): number => {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (value >= LEVEL_THRESHOLDS[i]) return i + 1
  }
  return 1
}

export class GrowthStore extends SqliteBaseStore<AgentGrowth> {
  constructor(_filePath?: string) {
    super(_filePath, { tableName: 'agent_growth' })
  }

  listByAgent(agentId: string): AgentGrowth[] {
    const rows = this.db.prepare(
      'SELECT * FROM agent_growth WHERE agent_id = ? ORDER BY metric'
    ).all(agentId)
    return rows.map((row) => this.rowToEntity(row as Record<string, unknown>))
  }

  getMetric(agentId: string, metric: GrowthMetric): AgentGrowth | undefined {
    const row = this.db.prepare(
      'SELECT * FROM agent_growth WHERE agent_id = ? AND metric = ?'
    ).get(agentId, metric)
    return row ? this.rowToEntity(row as Record<string, unknown>) : undefined
  }

  async increment(agentId: string, metric: GrowthMetric, amount = 1): Promise<AgentGrowth> {
    const existing = this.getMetric(agentId, metric)
    const now = new Date().toISOString()

    if (existing) {
      const newValue = existing.value + amount
      const newLevel = valueToLevel(newValue)
      this.db.prepare(
        'UPDATE agent_growth SET value = ?, level = ?, updated_at = ? WHERE agent_id = ? AND metric = ?'
      ).run(newValue, newLevel, now, agentId, metric)
      return { ...existing, value: newValue, level: newLevel, updatedAt: now }
    }

    const growth: AgentGrowth = {
      id: randomUUID(),
      agentId,
      metric,
      value: amount,
      level: valueToLevel(amount),
      updatedAt: now,
    }
    this.insertEntity(growth)
    return growth
  }

  getTotalXP(agentId: string): number {
    const result = this.db.prepare(
      'SELECT COALESCE(SUM(value), 0) as total FROM agent_growth WHERE agent_id = ?'
    ).get(agentId) as { total: number }
    return result.total
  }

  getOverallLevel(agentId: string): number {
    return valueToLevel(this.getTotalXP(agentId))
  }

  protected rowToEntity(row: Record<string, unknown>): AgentGrowth {
    return {
      id: row.id as string,
      agentId: row.agent_id as string,
      metric: row.metric as GrowthMetric,
      value: row.value as number,
      level: row.level as number,
      updatedAt: row.updated_at as string,
    }
  }

  protected entityToRow(entity: AgentGrowth): Record<string, unknown> {
    return {
      id: entity.id,
      agent_id: entity.agentId,
      metric: entity.metric,
      value: entity.value,
      level: entity.level,
      updated_at: entity.updatedAt,
    }
  }
}
