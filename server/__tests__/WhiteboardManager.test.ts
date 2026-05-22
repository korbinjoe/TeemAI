import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { WhiteboardManager, WhiteboardValidationError } from '../whiteboard/WhiteboardManager'
import { WHITEBOARD_ERROR, WHITEBOARD_SUMMARY_MAX } from '../../shared/whiteboard-types'

function uniqChatId(label: string): string {
  return `__test_${label}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
}

describe('WhiteboardManager', () => {
  let mgr: WhiteboardManager
  let chatId: string

  beforeEach(() => {
    mgr = new WhiteboardManager()
    chatId = uniqChatId('wb')
  })

  afterEach(async () => {
    await mgr.cleanupChat(chatId)
  })

  describe('appendEntry Validate', () => {
    it('overly long summary throws SUMMARY_TOO_LONG', () => {
      expect(() =>
        mgr.appendEntry(chatId, {
          type: 'progress',
          by: 'forge',
          summary: 'x'.repeat(WHITEBOARD_SUMMARY_MAX + 1),
        }),
      ).toThrow(WhiteboardValidationError)
    })

    it('empty summary throws SUMMARY_EMPTY', () => {
      expect(() =>
        mgr.appendEntry(chatId, { type: 'progress', by: 'forge', summary: '   ' }),
      ).toThrowError(/summary/i)
    })

    it('missing by throws MISSING_BY', () => {
      expect(() =>
        mgr.appendEntry(chatId, { type: 'progress', by: '', summary: 'ok' }),
      ).toThrowError(/by/i)
    })

    it('writing second goal in same chat throws GOAL_ALREADY_EXISTS', () => {
      mgr.appendEntry(chatId, { type: 'goal', by: 'lead', summary: 'war room' })
      expect(() =>
        mgr.appendEntry(chatId, { type: 'goal', by: 'lead', summary: 'do something else' }),
      ).toThrowError(/goal/i)
    })

    it('valid write returns complete entry with id / timestamp / status=active', () => {
      const e = mgr.appendEntry(chatId, { type: 'progress', by: 'forge', summary: 'PR1 Done' })
      expect(e.id).toMatch(/.{6,}/)
      expect(e.status).toBe('active')
      expect(e.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(e.chatId).toBe(chatId)
    })
  })

  describe('JSONL persistence and reload', () => {
    it('after write, entries.jsonl content can be reloaded by new instance', () => {
      mgr.appendEntry(chatId, { type: 'goal', by: 'lead', summary: 'war room' })
      mgr.appendEntry(chatId, { type: 'progress', by: 'forge', summary: 'PR1 Done', tags: ['pr1'] })

      const fresh = new WhiteboardManager()
      const all = fresh.query(chatId)
      expect(all.length).toBe(2)
      expect(all.map((e) => e.type)).toEqual(['goal', 'progress'])
    })

    it('multiple writes ordered by timestamp ascending', () => {
      mgr.appendEntry(chatId, { type: 'progress', by: 'forge', summary: 'a' })
      mgr.appendEntry(chatId, { type: 'progress', by: 'forge', summary: 'b' })
      mgr.appendEntry(chatId, { type: 'progress', by: 'forge', summary: 'c' })
      const list = mgr.query(chatId)
      expect(list.map((e) => e.summary)).toEqual(['a', 'b', 'c'])
    })
  })

  describe('query Filter', () => {
    beforeEach(() => {
      mgr.appendEntry(chatId, { type: 'goal', by: 'lead', summary: 'G' })
      mgr.appendEntry(chatId, { type: 'decision', by: 'forge', summary: 'D1', tags: ['ui'] })
      mgr.appendEntry(chatId, { type: 'progress', by: 'shield', summary: 'P1', tags: ['review'] })
      mgr.appendEntry(chatId, { type: 'progress', by: 'forge', summary: 'P2', tags: ['ui', 'fe'] })
    })

    it('filter by type', () => {
      const list = mgr.query(chatId, { types: ['progress'] })
      expect(list.length).toBe(2)
    })

    it('filter by byAgent', () => {
      const list = mgr.query(chatId, { byAgent: 'forge' })
      expect(list.map((e) => e.summary)).toEqual(['D1', 'P2'])
    })

    it('filter by tags (any match)', () => {
      const list = mgr.query(chatId, { tags: ['ui'] })
      expect(list.length).toBe(2)
    })

    it('limit returns most recent N entries', () => {
      const list = mgr.query(chatId, { limit: 2 })
      expect(list.length).toBe(2)
      expect(list[1].summary).toBe('P2')
    })
  })

  describe('archive / supersede / snapshot', () => {
    it('entry no longer in snapshot after archive', () => {
      const goal = mgr.appendEntry(chatId, { type: 'goal', by: 'lead', summary: 'G' })
      const p = mgr.appendEntry(chatId, { type: 'progress', by: 'forge', summary: 'P' })
      mgr.archive(chatId, p.id, 'lead')
      const snap = mgr.getSnapshot(chatId)
      expect(snap.goal?.id).toBe(goal.id)
      expect(snap.active.find((e) => e.id === p.id)).toBeUndefined()
    })

    it('supersede replaces old entry, original status becomes superseded', () => {
      const old = mgr.appendEntry(chatId, { type: 'decision', by: 'forge', summary: 'Use plan A' })
      const fresh = mgr.supersede(chatId, old.id, { type: 'decision', by: 'forge', summary: 'Switch to plan B' })
      expect(fresh.refs?.entries).toContain(old.id)

      const snap = mgr.getSnapshot(chatId)
      const oldStill = snap.active.find((e) => e.id === old.id)
      expect(oldStill).toBeUndefined()
      expect(snap.active.find((e) => e.id === fresh.id)).toBeDefined()
    })

    it('new instance reload still correctly marks archived after archive', () => {
      const p = mgr.appendEntry(chatId, { type: 'progress', by: 'forge', summary: 'P' })
      mgr.archive(chatId, p.id, 'lead')

      const fresh = new WhiteboardManager()
      const snap = fresh.getSnapshot(chatId)
      expect(snap.active.find((e) => e.id === p.id)).toBeUndefined()
      expect(snap.archivedCount).toBeGreaterThanOrEqual(2)
    })

    it('new instance reload still correctly marks superseded after supersede', () => {
      const old = mgr.appendEntry(chatId, { type: 'decision', by: 'forge', summary: 'Use plan A' })
      const replacement = mgr.supersede(chatId, old.id, { type: 'decision', by: 'forge', summary: 'Switch to plan B' })

      const fresh = new WhiteboardManager()
      const snap = fresh.getSnapshot(chatId)
      expect(snap.active.find((e) => e.id === old.id)).toBeUndefined()
      expect(snap.active.find((e) => e.id === replacement.id)).toBeDefined()

      const allEntries = fresh.query(chatId)
      const oldEntry = allEntries.find((e) => e.id === old.id)
      expect(oldEntry?.status).toBe('superseded')
      expect(oldEntry?.supersededBy).toBe(replacement.id)
    })

    it('getDiff returns correct status after reload', () => {
      const p = mgr.appendEntry(chatId, { type: 'progress', by: 'forge', summary: 'P' })
      mgr.archive(chatId, p.id, 'lead')

      const fresh = new WhiteboardManager()
      const diff = fresh.getDiff(chatId, 0)
      const original = diff.find((e) => e.id === p.id)
      expect(original?.status).toBe('archived')
    })

    it('flushSnapshot SyncGenerate snapshot.json', () => {
      mgr.appendEntry(chatId, { type: 'goal', by: 'lead', summary: 'G' })
      const snap = mgr.flushSnapshot(chatId)
      expect(snap.goal?.summary).toBe('G')

      const reread = mgr.readSnapshotFile(chatId)
      expect(reread?.goal?.summary).toBe('G')
    })
  })

  describe('cleanupChat', () => {
    it('query returns empty after cleanup', async () => {
      mgr.appendEntry(chatId, { type: 'progress', by: 'forge', summary: 'x' })
      await mgr.cleanupChat(chatId)
      const fresh = new WhiteboardManager()
      expect(fresh.query(chatId)).toEqual([])
    })
  })

  describe('concurrent appending', () => {
    it('100 rapid sequential writes with no data loss', () => {
      for (let i = 0; i < 100; i++) {
        mgr.appendEntry(chatId, { type: 'progress', by: 'forge', summary: `s-${i}` })
      }
      const fresh = new WhiteboardManager()
      expect(fresh.query(chatId).length).toBe(100)
    })
  })

  describe('seq allocation + getDiff', () => {
    it('first entry seq=1, strictly monotonically increasing thereafter', () => {
      const a = mgr.appendEntry(chatId, { type: 'goal', by: 'lead', summary: 'G' })
      const b = mgr.appendEntry(chatId, { type: 'progress', by: 'forge', summary: 'P1' })
      const c = mgr.appendEntry(chatId, { type: 'progress', by: 'forge', summary: 'P2' })
      expect([a.seq, b.seq, c.seq]).toEqual([1, 2, 3])
    })

    it('getLatestSeq returns 0 for empty chat', () => {
      expect(mgr.getLatestSeq(chatId)).toBe(0)
    })

    it('getDiff(sinceSeq) returns entries > since in ascending order', () => {
      mgr.appendEntry(chatId, { type: 'goal', by: 'lead', summary: 'G' }) // seq=1
      mgr.appendEntry(chatId, { type: 'decision', by: 'forge', summary: 'D' }) // seq=2
      mgr.appendEntry(chatId, { type: 'progress', by: 'forge', summary: 'P' }) // seq=3

      const diff = mgr.getDiff(chatId, 1)
      expect(diff.map((e) => e.seq)).toEqual([2, 3])
      expect(diff.map((e) => e.summary)).toEqual(['D', 'P'])
    })

    it('getDiff(0) BackAllEntry', () => {
      mgr.appendEntry(chatId, { type: 'progress', by: 'forge', summary: 'a' })
      mgr.appendEntry(chatId, { type: 'progress', by: 'forge', summary: 'b' })
      expect(mgr.getDiff(chatId, 0).length).toBe(2)
    })

    it('getDiff(latest) returns empty', () => {
      mgr.appendEntry(chatId, { type: 'progress', by: 'forge', summary: 'a' })
      expect(mgr.getDiff(chatId, 1)).toEqual([])
    })

    it('getDiff negative treated as 0, returns all', () => {
      mgr.appendEntry(chatId, { type: 'progress', by: 'forge', summary: 'a' })
      expect(mgr.getDiff(chatId, -5).length).toBe(1)
    })

    it('after new instance reloads JSONL, seq does not regress, resumes incrementing', () => {
      mgr.appendEntry(chatId, { type: 'progress', by: 'forge', summary: 'a' }) // seq=1
      mgr.appendEntry(chatId, { type: 'progress', by: 'forge', summary: 'b' }) // seq=2

      const fresh = new WhiteboardManager()
      expect(fresh.getLatestSeq(chatId)).toBe(2)
      const c = fresh.appendEntry(chatId, { type: 'progress', by: 'forge', summary: 'c' })
      expect(c.seq).toBe(3)
    })

    it('100 sequential writes: seq strictly consecutive 1..100, no duplicates', () => {
      const seen = new Set<number>()
      for (let i = 0; i < 100; i++) {
        const e = mgr.appendEntry(chatId, { type: 'progress', by: 'forge', summary: `s-${i}` })
        expect(e.seq).toBe(i + 1)
        seen.add(e.seq)
      }
      expect(seen.size).toBe(100)
    })
  })
})
