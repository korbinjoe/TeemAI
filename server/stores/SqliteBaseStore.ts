/**
 * SqliteBaseStore - SQLite  BaseStore
 *
 *  JSON  BaseStore Store API
 *  rowToEntity / entityToRow
 */

import type BetterSqlite3 from 'better-sqlite3'
import { getDatabase } from './Database'

export interface SqliteStoreOptions {
  tableName: string
  maxItems?: number
}

export abstract class SqliteBaseStore<T extends Record<string, unknown>> {
  protected db: BetterSqlite3.Database
  protected tableName: string
  protected maxItems: number

  constructor(_filePath?: string, options?: SqliteStoreOptions) {
    if (!options) {
      throw new Error('SqliteBaseStore requires options with tableName')
    }
    this.db = getDatabase()
    this.tableName = options.tableName
    this.maxItems = options.maxItems ?? 0
  }

  async load(): Promise<void> {
    // no-op
  }

  list(): T[] {
    const rows = this.db.prepare(`SELECT * FROM ${this.tableName}`).all()
    return rows.map((row) => this.rowToEntity(row as Record<string, unknown>))
  }

  protected abstract rowToEntity(row: Record<string, unknown>): T

  protected abstract entityToRow(entity: T): Record<string, unknown>

  protected evictIfNeeded(): void {
    if (this.maxItems <= 0) return
    const { cnt } = this.db.prepare(
      `SELECT COUNT(*) as cnt FROM ${this.tableName}`
    ).get() as { cnt: number }

    if (cnt > this.maxItems) {
      const overflow = cnt - this.maxItems
      this.db.prepare(`
        DELETE FROM ${this.tableName}
        WHERE rowid IN (
          SELECT rowid FROM ${this.tableName}
          ORDER BY ${this.evictOrderColumn()} ASC
          LIMIT ?
        )
      `).run(overflow)
    }
  }

  protected evictOrderColumn(): string {
    return 'rowid'
  }

  isDirty(): boolean { return false }
  async retryPersist(): Promise<void> { /* no-op */ }

  protected insertEntity(entity: T): void {
    const row = this.entityToRow(entity)
    const columns = Object.keys(row)
    const placeholders = columns.map(() => '?').join(', ')
    this.db.prepare(
      `INSERT INTO ${this.tableName} (${columns.join(', ')}) VALUES (${placeholders})`
    ).run(...columns.map((c) => row[c] ?? null))
    this.evictIfNeeded()
  }

  protected updateById(id: string, entity: T): void {
    const row = this.entityToRow(entity)
    const columns = Object.keys(row).filter((k) => k !== 'id')
    if (columns.length === 0) return
    const setClauses = columns.map((k) => `${k} = ?`).join(', ')
    const values = columns.map((c) => row[c] ?? null)
    this.db.prepare(
      `UPDATE ${this.tableName} SET ${setClauses} WHERE id = ?`
    ).run(...values, id)
  }

  protected deleteById(id: string): boolean {
    const result = this.db.prepare(
      `DELETE FROM ${this.tableName} WHERE id = ?`
    ).run(id)
    return result.changes > 0
  }

  protected getById(id: string): T | undefined {
    const row = this.db.prepare(
      `SELECT * FROM ${this.tableName} WHERE id = ?`
    ).get(id)
    return row ? this.rowToEntity(row as Record<string, unknown>) : undefined
  }
}
