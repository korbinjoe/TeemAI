/**
 * MailboxManager - Agent
 *
 *  Agent  JSONL
 *  JSONL  from
 *
 *   ~/.openteam/mailbox/{chatId}/{from}→{to}.jsonl
 *
 *   -  SessionFileWatcher
 *   - cursor
 */

import { existsSync, mkdirSync, appendFileSync, readFileSync, readdirSync, statSync, openSync, readSync, closeSync } from 'fs'
import { join } from 'path'
import { rm } from 'fs/promises'
import { MAILBOX_ROOT } from '../config/paths'
import type { AgentMessage } from '../../shared/agent-message-types'
import { serializeLogfmt, deserializeMailboxLine, parseMailboxFileName } from '../../shared/agent-message-types'
import { createLogger } from '../lib/logger'

const log = createLogger('MailboxManager')

export interface ReadResult {
  messages: AgentMessage[]
  newOffset: number
}

export interface InboxResult {
  messages: AgentMessage[]
  cursors: Record<string, number>
}

export type MailboxMessageListener = (chatId: string, from: string, to: string, message: AgentMessage) => void

export class MailboxManager {
  private messageListeners = new Set<MailboxMessageListener>()

  onMessage(listener: MailboxMessageListener): () => void {
    this.messageListeners.add(listener)
    return () => { this.messageListeners.delete(listener) }
  }

  private chatDir(chatId: string): string {
    return join(MAILBOX_ROOT, chatId)
  }

  ensureMailboxDir(chatId: string): string {
    const dir = this.chatDir(chatId)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
      log.info('Created mailbox dir', { chatId })
    }
    return dir
  }

  writeMessage(chatId: string, from: string, to: string, message: AgentMessage): void {
    const dir = this.ensureMailboxDir(chatId)
    const fileName = `${from}→${to}.jsonl`
    const filePath = join(dir, fileName)
    const line = serializeLogfmt(message) + '\n'
    appendFileSync(filePath, line, { flag: 'a' })
    log.debug('Message written', { chatId, from, to, type: message.type, id: message.id })
    for (const listener of this.messageListeners) {
      try { listener(chatId, from, to, message) } catch {}
    }
  }

  /**
   * @param sinceBytes 0
   */
  readMessages(chatId: string, from: string, to: string, sinceBytes = 0): ReadResult {
    const dir = this.chatDir(chatId)
    const fileName = `${from}→${to}.jsonl`
    const filePath = join(dir, fileName)

    if (!existsSync(filePath)) {
      return { messages: [], newOffset: 0 }
    }

    const fileSize = statSync(filePath).size
    if (fileSize <= sinceBytes) {
      return { messages: [], newOffset: sinceBytes }
    }

    const buffer = Buffer.alloc(fileSize - sinceBytes)
    const fd = openSync(filePath, 'r')
    try {
      readSync(fd, buffer, 0, buffer.length, sinceBytes)
    } finally {
      closeSync(fd)
    }

    const content = buffer.toString('utf-8')
    const lines = content.split('\n').filter(Boolean)
    const messages: AgentMessage[] = []
    const parsed = parseMailboxFileName(fileName)
    const msgFrom = parsed?.from || from
    const msgTo = parsed?.to || to

    for (const line of lines) {
      const msg = deserializeMailboxLine(line, msgFrom, msgTo, chatId)
      if (msg) {
        messages.push(msg)
      } else {
        log.warn('Failed to parse mailbox line', { filePath, line: line.slice(0, 100) })
      }
    }

    return { messages, newOffset: fileSize }
  }

  /**
   *  agent
   * @param instanceId  instanceId
   * @param cursors
   * @param sinceId  ID
   */
  readInbox(
    chatId: string,
    instanceId: string,
    cursors: Record<string, number> = {},
    sinceId?: string,
  ): InboxResult {
    const dir = this.chatDir(chatId)
    if (!existsSync(dir)) {
      return { messages: [], cursors: {} }
    }

    const suffix = `→${instanceId}.jsonl`
    const allMessages: AgentMessage[] = []
    const newCursors: Record<string, number> = { ...cursors }

    try {
      const files = readdirSync(dir).filter(f => f.endsWith(suffix))
      for (const file of files) {
        const prevOffset = cursors[file] || 0
        const filePath = join(dir, file)
        const fileSize = statSync(filePath).size

        if (fileSize <= prevOffset) {
          newCursors[file] = prevOffset
          continue
        }

        const buffer = Buffer.alloc(fileSize - prevOffset)
        const fd = openSync(filePath, 'r')
        try {
          readSync(fd, buffer, 0, buffer.length, prevOffset)
        } finally {
          closeSync(fd)
        }

        const lines = buffer.toString('utf-8').split('\n').filter(Boolean)
        const parsed = parseMailboxFileName(file)
        for (const line of lines) {
          const msg = deserializeMailboxLine(line, parsed?.from || '', instanceId, chatId)
          if (msg) allMessages.push(msg)
        }
        newCursors[file] = fileSize
      }
    } catch (err) {
      log.warn('Failed to read inbox', { chatId, instanceId, error: err instanceof Error ? err.message : String(err) })
    }

    allMessages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

    // sinceId Filter
    if (sinceId) {
      const idx = allMessages.findIndex(m => m.id === sinceId)
      if (idx >= 0) {
        return { messages: allMessages.slice(idx + 1), cursors: newCursors }
      }
    }

    return { messages: allMessages, cursors: newCursors }
  }

  /**
   *  agent
   * @param instanceId  instanceId
   * @param cursors
   */
  readOutbox(
    chatId: string,
    instanceId: string,
    cursors: Record<string, number> = {},
  ): InboxResult {
    const dir = this.chatDir(chatId)
    if (!existsSync(dir)) {
      return { messages: [], cursors: {} }
    }

    const prefix = `${instanceId}→`
    const allMessages: AgentMessage[] = []
    const newCursors: Record<string, number> = { ...cursors }

    try {
      const files = readdirSync(dir).filter(f => f.startsWith(prefix) && f.endsWith('.jsonl'))
      for (const file of files) {
        const prevOffset = cursors[file] || 0
        const filePath = join(dir, file)
        const fileSize = statSync(filePath).size

        if (fileSize <= prevOffset) {
          newCursors[file] = prevOffset
          continue
        }

        const buffer = Buffer.alloc(fileSize - prevOffset)
        const fd = openSync(filePath, 'r')
        try {
          readSync(fd, buffer, 0, buffer.length, prevOffset)
        } finally {
          closeSync(fd)
        }

        const lines = buffer.toString('utf-8').split('\n').filter(Boolean)
        const parsed = parseMailboxFileName(file)
        for (const line of lines) {
          const msg = deserializeMailboxLine(line, instanceId, parsed?.to || '', chatId)
          if (msg) allMessages.push(msg)
        }
        newCursors[file] = fileSize
      }
    } catch (err) {
      log.warn('Failed to read outbox', { chatId, instanceId, error: err instanceof Error ? err.message : String(err) })
    }

    allMessages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    return { messages: allMessages, cursors: newCursors }
  }

  async cleanupChat(chatId: string): Promise<void> {
    const dir = this.chatDir(chatId)
    if (!existsSync(dir)) return
    try {
      await rm(dir, { recursive: true, force: true })
      log.info('Cleaned up mailbox', { chatId })
    } catch (err) {
      log.warn('Failed to cleanup mailbox', { chatId, error: err instanceof Error ? err.message : String(err) })
    }
  }

  listMailboxFiles(chatId: string): string[] {
    const dir = this.chatDir(chatId)
    if (!existsSync(dir)) return []
    try {
      return readdirSync(dir).filter(f => f.endsWith('.jsonl'))
    } catch {
      return []
    }
  }
}
