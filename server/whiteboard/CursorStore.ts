/**
 * CursorStore -  cursor
 *
 *  agentInstanceId  lastReadSeq PostToolUse hook  diff
 *  chatId KV agentInstanceId → { lastReadSeq, updatedAt }
 *
 *   -  writeFileSync +  rename .tmp.{rand} →
 *   -  Map
 *
 * Fallback：
 *   -  JSON  → getCursor  null snapshot
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from 'fs'
import { join } from 'path'
import { randomBytes } from 'crypto'
import { WHITEBOARD_CURSOR_DIR } from '../config/paths'
import { createLogger } from '../lib/logger'

const log = createLogger('CursorStore')

export interface CursorRecord {
  lastReadSeq: number
  updatedAt: string
}

/**  chat  cursor KVagentInstanceId →  */
interface ChatCursorFile {
  [agentInstanceId: string]: CursorRecord
}

export class CursorStore {
  private cache = new Map<string, ChatCursorFile>()

  private ensureDir(): void {
    if (!existsSync(WHITEBOARD_CURSOR_DIR)) {
      mkdirSync(WHITEBOARD_CURSOR_DIR, { recursive: true })
    }
  }

  private filePath(chatId: string): string {
    return join(WHITEBOARD_CURSOR_DIR, `${chatId}.json`)
  }

  private loadFile(chatId: string): ChatCursorFile {
    const cached = this.cache.get(chatId)
    if (cached) return cached

    const path = this.filePath(chatId)
    if (!existsSync(path)) {
      const empty: ChatCursorFile = {}
      this.cache.set(chatId, empty)
      return empty
    }
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf-8')) as ChatCursorFile
      this.cache.set(chatId, parsed)
      return parsed
    } catch (err) {
      log.warn('Cursor file corrupted, treating as empty', {
        chatId,
        error: err instanceof Error ? err.message : String(err),
      })
      const empty: ChatCursorFile = {}
      this.cache.set(chatId, empty)
      return empty
    }
  }

  /**
   *  cursorinstanceId  null fallback
   */
  get(chatId: string, instanceId: string): CursorRecord | null {
    const file = this.loadFile(chatId)
    return file[instanceId] ?? null
  }

  /**
   *  cursor + rename
   *  seq
   */
  set(chatId: string, instanceId: string, seq: number): CursorRecord {
    if (!Number.isFinite(seq) || seq < 0) {
      throw new Error(`CursorStore.set invalid seq: ${seq}`)
    }
    this.ensureDir()

    const file = this.loadFile(chatId)
    const existing = file[instanceId]
    if (existing && existing.lastReadSeq >= seq) {
      return existing
    }
    const record: CursorRecord = {
      lastReadSeq: seq,
      updatedAt: new Date().toISOString(),
    }
    file[instanceId] = record
    this.cache.set(chatId, file)

    const finalPath = this.filePath(chatId)
    const tmpPath = `${finalPath}.tmp.${randomBytes(6).toString('hex')}`
    try {
      writeFileSync(tmpPath, JSON.stringify(file, null, 2), 'utf-8')
      renameSync(tmpPath, finalPath)
    } catch (err) {
      try {
        if (existsSync(tmpPath)) unlinkSync(tmpPath)
      } catch {
        /* ignore */
      }
      throw err
    }
    return record
  }

  /**
   *  cursoragent
   *  chat  cursor  WhiteboardManager.cleanupChat
   */
  delete(chatId: string, instanceId: string): void {
    const file = this.loadFile(chatId)
    if (!(instanceId in file)) return
    delete file[instanceId]
    this.cache.set(chatId, file)

    const finalPath = this.filePath(chatId)
    if (Object.keys(file).length === 0) {
      try {
        if (existsSync(finalPath)) unlinkSync(finalPath)
      } catch (err) {
        log.warn('Failed to unlink empty cursor file', {
          chatId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
      return
    }
    this.ensureDir()
    const tmpPath = `${finalPath}.tmp.${randomBytes(6).toString('hex')}`
    try {
      writeFileSync(tmpPath, JSON.stringify(file, null, 2), 'utf-8')
      renameSync(tmpPath, finalPath)
    } catch (err) {
      try {
        if (existsSync(tmpPath)) unlinkSync(tmpPath)
      } catch {
        /* ignore */
      }
      throw err
    }
  }

  /**  chat  cursor cleanupChat  */
  cleanupChat(chatId: string): void {
    this.cache.delete(chatId)
    const path = this.filePath(chatId)
    if (existsSync(path)) {
      try {
        unlinkSync(path)
      } catch (err) {
        log.warn('Failed to cleanup cursor file', {
          chatId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }
}
