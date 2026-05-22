import { randomUUID } from 'crypto'
import { SqliteBaseStore } from './SqliteBaseStore'

export interface TrackedEvent {
  id: string
  category: string
  event: string
  properties?: Record<string, unknown>
  createdAt: string
}

const MAX_EVENTS = 10000

export class EventStore extends SqliteBaseStore<TrackedEvent> {
  constructor() {
    super(undefined, { tableName: 'events', maxItems: MAX_EVENTS })
  }

  track(category: string, event: string, properties?: Record<string, unknown>): void {
    const entry: TrackedEvent = {
      id: randomUUID(),
      category,
      event,
      properties,
      createdAt: new Date().toISOString(),
    }
    this.insertEntity(entry)
  }

  query(params: {
    category?: string
    event?: string
    from?: string
    to?: string
    limit?: number
  }): TrackedEvent[] {
    const conditions: string[] = []
    const values: unknown[] = []

    if (params.category) {
      conditions.push('category = ?')
      values.push(params.category)
    }
    if (params.event) {
      conditions.push('event = ?')
      values.push(params.event)
    }
    if (params.from) {
      conditions.push('created_at >= ?')
      values.push(params.from)
    }
    if (params.to) {
      conditions.push('created_at <= ?')
      values.push(params.to)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const limit = params.limit ?? 100
    const rows = this.db.prepare(
      `SELECT * FROM events ${where} ORDER BY created_at DESC LIMIT ?`
    ).all(...values, limit)
    return rows.map((row) => this.rowToEntity(row as Record<string, unknown>))
  }

  async cleanup(retentionDays = 30): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString()
    const result = this.db.prepare(
      'DELETE FROM events WHERE created_at < ?'
    ).run(cutoff)
    return result.changes
  }

  protected rowToEntity(row: Record<string, unknown>): TrackedEvent {
    return {
      id: row.id as string,
      category: row.category as string,
      event: row.event as string,
      properties: row.properties ? JSON.parse(row.properties as string) : undefined,
      createdAt: row.created_at as string,
    }
  }

  protected entityToRow(entity: TrackedEvent): Record<string, unknown> {
    return {
      id: entity.id,
      category: entity.category,
      event: entity.event,
      properties: entity.properties ? JSON.stringify(entity.properties) : null,
      created_at: entity.createdAt,
    }
  }

  protected evictOrderColumn(): string {
    return 'created_at'
  }
}
