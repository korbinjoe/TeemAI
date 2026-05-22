import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { WhiteboardManager } from '../whiteboard/WhiteboardManager'
import { ContextBriefing, BRIEFING_BUDGET_CHARS } from '../whiteboard/ContextBriefing'

function uniqChatId(label: string): string {
  return `__test_${label}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
}

describe('ContextBriefing', () => {
  let wb: WhiteboardManager
  let cb: ContextBriefing
  let chatId: string

  beforeEach(() => {
    wb = new WhiteboardManager()
    cb = new ContextBriefing(wb)
    chatId = uniqChatId('cb')
  })

  afterEach(async () => {
    await wb.cleanupChat(chatId)
  })

  describe('empty war room', () => {
    it('no entries → returns guide text, breaks "empty → no write → always empty" deadlock', () => {
      const out = cb.buildForAgent({ chatId, agentId: 'forge' })
      expect(out).toContain('# Chat Shared Context Briefing')
      expect(out).toContain('No entries in the current war room')
      expect(out).toContain('wb-write.sh')
    })

    it('Onboarding copy length is controlled（<1000 chars，leaving enough space for the main task）', () => {
      const out = cb.buildForAgent({ chatId, agentId: 'forge' })
      expect(out.length).toBeLessThan(1000)
    })

    it('maybeWrapTask empty war room → prepends guide text + original task', () => {
      const out = cb.maybeWrapTask('do X', { chatId, agentId: 'forge' })
      expect(out).toContain('# Chat Shared Context Briefing')
      expect(out).toContain('No entries in the current war room')
      expect(out).toContain('---')
      expect(out.endsWith('do X')).toBe(true)
    })
  })

  describe('wrapping task', () => {
    beforeEach(() => {
      wb.appendEntry(chatId, { type: 'goal', by: 'lead', summary: 'war room' })
    })

    it('has content → prepends briefing', () => {
      const out = cb.maybeWrapTask('do X', { chatId, agentId: 'forge' })
      expect(out).toContain('# Chat Shared Context Briefing')
      expect(out).toContain('war room')
      expect(out).toContain('---')
      expect(out.endsWith('do X')).toBe(true)
    })

    it('internal error → falls back to original task', () => {
      const cb2 = new ContextBriefing(wb)
      const spy = vi.spyOn(cb2, 'buildForAgent').mockImplementation(() => {
        throw new Error('boom')
      })
      expect(cb2.maybeWrapTask('do X', { chatId, agentId: 'forge' })).toBe('do X')
      spy.mockRestore()
    })
  })

  describe('content assembly', () => {
    beforeEach(() => {
      wb.appendEntry(chatId, { type: 'goal', by: 'lead', summary: 'G1' })
      wb.appendEntry(chatId, { type: 'open_question', by: 'forge', summary: 'Q1' })
      wb.appendEntry(chatId, { type: 'open_question', by: 'shield', summary: 'Q2' })
      wb.appendEntry(chatId, { type: 'decision', by: 'forge', summary: 'D1' })
      wb.appendEntry(chatId, { type: 'progress', by: 'forge', summary: 'P1' })
      wb.appendEntry(chatId, {
        type: 'artifact',
        by: 'forge',
        summary: 'A1',
        refs: { files: ['a.ts', 'b.ts'], artifacts: ['https://x'] },
      })
    })

    it('goal appears at top of briefing', () => {
      const out = cb.buildForAgent({ chatId, agentId: 'forge' })
      const idxGoal = out.indexOf('G1')
      const idxQ = out.indexOf('Q1')
      expect(idxGoal).toBeGreaterThan(0)
      expect(idxGoal).toBeLessThan(idxQ)
    })

    it('open_question comes before decision/progress', () => {
      const out = cb.buildForAgent({ chatId, agentId: 'forge' })
      expect(out.indexOf('Q1')).toBeLessThan(out.indexOf('D1'))
      expect(out.indexOf('Q1')).toBeLessThan(out.indexOf('P1'))
    })

    it('artifact refs.files rendered after summary', () => {
      const out = cb.buildForAgent({ chatId, agentId: 'forge' })
      expect(out).toMatch(/A1.*files:\s*a\.ts/)
    })

    it('archived entries excluded from briefing', () => {
      const cid = uniqChatId('arch')
      wb.appendEntry(cid, { type: 'goal', by: 'lead', summary: 'X' })
      const p = wb.appendEntry(cid, { type: 'progress', by: 'forge', summary: 'TO_BE_ARCHIVED' })
      wb.archive(cid, p.id, 'lead')
      const out = cb.buildForAgent({ chatId: cid, agentId: 'forge' })
      expect(out).not.toContain('TO_BE_ARCHIVED')
      void wb.cleanupChat(cid)
    })
  })

  describe('relevance', () => {
    it('tags matching agent tags → sorted first', () => {
      const cid = uniqChatId('rank')
      wb.appendEntry(cid, { type: 'goal', by: 'lead', summary: 'G' })
      wb.appendEntry(cid, { type: 'progress', by: 'a', summary: 'IRRELEVANT', tags: ['db'] })
      wb.appendEntry(cid, { type: 'progress', by: 'b', summary: 'TARGET', tags: ['ui'] })
      const out = cb.buildForAgent({ chatId: cid, agentId: 'canvas', agentTags: ['ui'] })
      expect(out.indexOf('TARGET')).toBeLessThan(out.indexOf('IRRELEVANT'))
      void wb.cleanupChat(cid)
    })
  })

  describe('budget control', () => {
    it('overly long content truncated with overflow tip appended', () => {
      const cid = uniqChatId('budget')
      wb.appendEntry(cid, { type: 'goal', by: 'lead', summary: 'G' })
      const types = ['open_question', 'handoff', 'constraint', 'decision', 'progress', 'artifact'] as const
      for (const t of types) {
        for (let i = 0; i < 12; i++) {
          wb.appendEntry(cid, {
            type: t,
            by: `agent-${t}-${i}`,
            summary: 'x'.repeat(70) + i.toString().padStart(2, '0'),
          })
        }
      }
      const out = cb.buildForAgent({ chatId: cid, agentId: 'forge' })
      expect(out.length).toBeLessThanOrEqual(BRIEFING_BUDGET_CHARS)
      expect(out).toContain('war room sidebar')
      void wb.cleanupChat(cid)
    })

    it('short content not truncated', () => {
      const cid = uniqChatId('short')
      wb.appendEntry(cid, { type: 'goal', by: 'lead', summary: 'G' })
      wb.appendEntry(cid, { type: 'progress', by: 'forge', summary: 'P' })
      const out = cb.buildForAgent({ chatId: cid, agentId: 'forge' })
      expect(out).not.toContain('war room sidebar')
      void wb.cleanupChat(cid)
    })
  })

  describe('buildDiff (PostToolUse incremental fragment)', () => {
    it('0 entries → empty string', () => {
      expect(cb.buildDiff([], 0)).toBe('')
    })

    it('single entry → contains <system-reminder> block with since seq', () => {
      const e = wb.appendEntry(chatId, { type: 'decision', by: 'forge', summary: 'use JSONL' })
      const out = cb.buildDiff([e], 0)
      expect(out).toContain('<system-reminder>')
      expect(out).toContain('[War room delta since seq=0] New 1 entries:')
      expect(out).toContain('[decision by forge] use JSONL')
      expect(out.trimEnd().endsWith('</system-reminder>')).toBe(true)
    })

    it('exactly 5 entries → no folding', () => {
      const entries = [1, 2, 3, 4, 5].map((i) =>
        wb.appendEntry(chatId, { type: 'progress', by: 'forge', summary: `P${i}` }),
      )
      const out = cb.buildDiff(entries, 0)
      expect(out).toContain('New 5 entries:')
      expect(out).not.toMatch(/more, run wb-snapshot/)
    })

    it('exceeds 5 entries → folded to +N more', () => {
      const entries = Array.from({ length: 8 }, (_, i) =>
        wb.appendEntry(chatId, { type: 'progress', by: 'forge', summary: `P${i}` }),
      )
      const out = cb.buildDiff(entries, 0)
      expect(out).toContain('New 8 entries:')
      expect(out).toContain('+3 more, run wb-snapshot.sh for full')
      expect(out).toContain('P0')
      expect(out).toContain('P4')
      expect(out).not.toContain('[progress by forge] P5')
    })

    it('sinceSeq appears in first line header', () => {
      const e = wb.appendEntry(chatId, { type: 'handoff', by: 'lead', summary: '→ shield' })
      const out = cb.buildDiff([e], 42)
      expect(out).toContain('[War room delta since seq=42]')
    })

    it('maxLines overrides default folding threshold', () => {
      const entries = Array.from({ length: 4 }, (_, i) =>
        wb.appendEntry(chatId, { type: 'progress', by: 'forge', summary: `P${i}` }),
      )
      const out = cb.buildDiff(entries, 0, { maxLines: 2 })
      expect(out).toContain('+2 more')
      expect(out).toContain('P0')
      expect(out).toContain('P1')
      expect(out).not.toContain('[progress by forge] P2')
    })
  })
})
