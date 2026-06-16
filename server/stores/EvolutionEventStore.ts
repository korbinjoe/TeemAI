import { randomUUID } from 'crypto'
import { getDatabase } from './Database'

export type EvolutionEventType = 'skill_acquired' | 'memory_updated' | 'strategy_evolved' | 'milestone'

export interface EvolutionEvent {
  id: string
  agentId: string
  type: EvolutionEventType
  title: string
  description: string
  changedFile?: string
  rollbackRef?: string
  sourceRef?: string
  evidence?: Record<string, unknown>
  createdAt: string
}

export class EvolutionEventStore {
  private db = getDatabase()

  record(params: Omit<EvolutionEvent, 'id' | 'createdAt'> & { id?: string; createdAt?: string }): EvolutionEvent {
    const entry: EvolutionEvent = {
      id: params.id ?? randomUUID(),
      agentId: params.agentId,
      type: params.type,
      title: params.title,
      description: params.description,
      changedFile: params.changedFile,
      rollbackRef: params.rollbackRef,
      sourceRef: params.sourceRef,
      evidence: params.evidence,
      createdAt: params.createdAt ?? new Date().toISOString(),
    }

    this.db.prepare(`
      INSERT INTO agent_evolution_events (
        id, agent_id, type, title, description, changed_file, rollback_ref,
        source_ref, evidence_json, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.id,
      entry.agentId,
      entry.type,
      entry.title,
      entry.description,
      entry.changedFile ?? null,
      entry.rollbackRef ?? null,
      entry.sourceRef ?? null,
      entry.evidence ? JSON.stringify(entry.evidence) : null,
      entry.createdAt,
    )

    return entry
  }

  listByAgent(agentId: string, limit = 100): EvolutionEvent[] {
    const rows = this.db.prepare(`
      SELECT * FROM agent_evolution_events
      WHERE agent_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(agentId, limit)
    return rows.map((row) => this.rowToEvent(row as Record<string, unknown>))
  }

  private rowToEvent(row: Record<string, unknown>): EvolutionEvent {
    return {
      id: row.id as string,
      agentId: row.agent_id as string,
      type: row.type as EvolutionEventType,
      title: row.title as string,
      description: row.description as string,
      changedFile: row.changed_file as string | undefined,
      rollbackRef: row.rollback_ref as string | undefined,
      sourceRef: row.source_ref as string | undefined,
      evidence: row.evidence_json ? JSON.parse(row.evidence_json as string) as Record<string, unknown> : undefined,
      createdAt: row.created_at as string,
    }
  }
}
