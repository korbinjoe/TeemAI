import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, readdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { CursorStore } from '../whiteboard/CursorStore'
import { WHITEBOARD_CURSOR_DIR } from '../config/paths'

function uniqChatId(label: string): string {
  return `__test_cursor_${label}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
}

function cleanupChatFiles(chatId: string) {
  if (!existsSync(WHITEBOARD_CURSOR_DIR)) return
  for (const name of readdirSync(WHITEBOARD_CURSOR_DIR)) {
    if (name.startsWith(chatId)) {
      try {
        unlinkSync(join(WHITEBOARD_CURSOR_DIR, name))
      } catch {
        /* ignore */
      }
    }
  }
}

describe('CursorStore', () => {
  let store: CursorStore
  let chatId: string

  beforeEach(() => {
    store = new CursorStore()
    chatId = uniqChatId('basic')
  })

  afterEach(() => {
    cleanupChatFiles(chatId)
  })

  describe('get / set basics', () => {
    it('first get returns null (triggers fallback)', () => {
      expect(store.get(chatId, 'agent-1')).toBeNull()
    })

    it('get returns same seq after set', () => {
      store.set(chatId, 'agent-1', 7)
      const rec = store.get(chatId, 'agent-1')
      expect(rec?.lastReadSeq).toBe(7)
      expect(rec?.updatedAt).toMatch(/\dT\d/)
    })

    it('multiple agentInstanceIds do not affect each other', () => {
      store.set(chatId, 'agent-a', 3)
      store.set(chatId, 'agent-b', 10)
      expect(store.get(chatId, 'agent-a')?.lastReadSeq).toBe(3)
      expect(store.get(chatId, 'agent-b')?.lastReadSeq).toBe(10)
    })

    it('set with smaller seq does not regress (idempotent)', () => {
      store.set(chatId, 'agent-1', 10)
      store.set(chatId, 'agent-1', 5)
      expect(store.get(chatId, 'agent-1')?.lastReadSeq).toBe(10)
    })

    it('set with invalid seq throws error', () => {
      expect(() => store.set(chatId, 'agent-1', -1)).toThrowError(/invalid seq/)
      expect(() => store.set(chatId, 'agent-1', Number.NaN)).toThrowError(/invalid seq/)
    })
  })

  describe('atomic persistence', () => {
    it('set does not leave .tmp residue in target directory', () => {
      store.set(chatId, 'agent-1', 1)
      store.set(chatId, 'agent-1', 2)
      store.set(chatId, 'agent-2', 3)
      const files = readdirSync(WHITEBOARD_CURSOR_DIR).filter((n) => n.startsWith(chatId))
      expect(files.every((n) => !n.includes('.tmp.'))).toBe(true)
    })

    it('cross-instance reload: restores same cursor from file', () => {
      store.set(chatId, 'agent-1', 42)
      const store2 = new CursorStore()
      expect(store2.get(chatId, 'agent-1')?.lastReadSeq).toBe(42)
    })
  })

  describe('fallback behavior', () => {
    it('unknown chat get returns null (not exception)', () => {
      expect(store.get(uniqChatId('ghost'), 'agent-1')).toBeNull()
    })

    it('get returns null again after delete (triggers fallback)', () => {
      store.set(chatId, 'agent-1', 9)
      store.delete(chatId, 'agent-1')
      expect(store.get(chatId, 'agent-1')).toBeNull()
    })

    it('cleanupChat removes file, new instance reads back null', () => {
      store.set(chatId, 'agent-1', 9)
      store.cleanupChat(chatId)
      const store2 = new CursorStore()
      expect(store2.get(chatId, 'agent-1')).toBeNull()
    })
  })

  describe('high-frequency concurrent set (sequential writes in same process)', () => {
    it('100 incremental sets result in stable final value', () => {
      for (let i = 1; i <= 100; i++) {
        store.set(chatId, 'agent-1', i)
      }
      expect(store.get(chatId, 'agent-1')?.lastReadSeq).toBe(100)

      const s2 = new CursorStore()
      expect(s2.get(chatId, 'agent-1')?.lastReadSeq).toBe(100)
    })
  })
})
