import { randomUUID } from 'crypto'
import { SqliteBaseStore } from './SqliteBaseStore'
import type { Notification, NotificationCategory } from '../config/types'

export class NotificationStore extends SqliteBaseStore<Notification> {
  constructor(_filePath?: string) {
    super(_filePath, { tableName: 'notifications', maxItems: 500 })
  }

  get(id: string): Notification | undefined {
    return this.getById(id)
  }

  async create(params: {
    category: NotificationCategory
    title: string
    body: string
    link?: string
    meta?: Notification['meta']
  }): Promise<Notification> {
    const notification: Notification = {
      id: randomUUID(),
      category: params.category,
      title: params.title,
      body: params.body,
      read: false,
      createdAt: new Date().toISOString(),
      link: params.link,
      meta: params.meta,
    }
    this.insertEntity(notification as unknown as Notification)
    return notification
  }

  async markRead(id: string): Promise<void> {
    this.db.prepare(
      'UPDATE notifications SET read = 1 WHERE id = ? AND read = 0'
    ).run(id)
  }

  async markAllRead(): Promise<void> {
    this.db.prepare('UPDATE notifications SET read = 1 WHERE read = 0').run()
  }

  listUnread(): Notification[] {
    const rows = this.db.prepare(
      'SELECT * FROM notifications WHERE read = 0 ORDER BY created_at DESC'
    ).all()
    return rows.map((row) => this.rowToEntity(row as Record<string, unknown>))
  }

  unreadCount(): number {
    const result = this.db.prepare(
      'SELECT COUNT(*) as cnt FROM notifications WHERE read = 0'
    ).get() as { cnt: number }
    return result.cnt
  }

  async clearRead(): Promise<void> {
    this.db.prepare('DELETE FROM notifications WHERE read = 1').run()
  }

  async remove(id: string): Promise<boolean> {
    return this.deleteById(id)
  }

  list(): Notification[] {
    const rows = this.db.prepare(
      'SELECT * FROM notifications ORDER BY created_at DESC'
    ).all()
    return rows.map((row) => this.rowToEntity(row as Record<string, unknown>))
  }

  protected rowToEntity(row: Record<string, unknown>): Notification {
    return {
      id: row.id as string,
      category: row.category as NotificationCategory,
      title: row.title as string,
      body: row.body as string,
      read: row.read === 1,
      createdAt: row.created_at as string,
      link: row.link as string | undefined,
      meta: row.meta ? JSON.parse(row.meta as string) : undefined,
    }
  }

  protected entityToRow(entity: Notification): Record<string, unknown> {
    return {
      id: entity.id,
      category: entity.category,
      title: entity.title,
      body: entity.body,
      read: entity.read ? 1 : 0,
      created_at: entity.createdAt,
      link: entity.link ?? null,
      meta: entity.meta ? JSON.stringify(entity.meta) : null,
    }
  }

  protected evictOrderColumn(): string {
    return 'created_at'
  }
}
