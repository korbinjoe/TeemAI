import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { parseSatisfactionFile, evaluateTriggers } from '../services/agent-evolution/EvolutionTrigger'
import type { SatisfactionRecord } from '../services/agent-evolution/EvolutionTrigger'

const recentDate = (daysAgo: number): string => {
  const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const buildSatisfactionFile = (records: Array<{ chatId: string; date: string; mss: number; turns: number; corrections: number; escalations: number; iterations: number; acceptances: number; commits: number; rating: string }>): string => {
  let content = '# Satisfaction Scores\n\n'
  for (const r of records) {
    content += `## ${r.chatId} — ${r.date}\n`
    content += `MSS: ${r.mss} | Turns: ${r.turns} | Corrections: ${r.corrections} | Escalations: ${r.escalations} | Iterations: ${r.iterations} | Acceptances: ${r.acceptances} | Commits: ${r.commits} | Rating: ${r.rating}\n\n`
  }
  return content
}

describe('EvolutionTrigger', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'evolution-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('parseSatisfactionFile', () => {
    it('parses well-formed satisfaction file', () => {
      const content = buildSatisfactionFile([
        { chatId: 'chat-001', date: '2026-06-10 14:30', mss: 25.0, turns: 8, corrections: 2, escalations: 0, iterations: 1, acceptances: 3, commits: 1, rating: 'MEDIUM' },
        { chatId: 'chat-002', date: '2026-06-11 09:15', mss: -10.5, turns: 12, corrections: 4, escalations: 1, iterations: 3, acceptances: 1, commits: 0, rating: 'LOW' },
      ])
      const filePath = join(tmpDir, 'satisfaction.md')
      writeFileSync(filePath, content)

      const records = parseSatisfactionFile(filePath)
      expect(records).toHaveLength(2)
      expect(records[0].chatId).toBe('chat-001')
      expect(records[0].mss).toBe(25.0)
      expect(records[0].corrections).toBe(2)
      expect(records[1].chatId).toBe('chat-002')
      expect(records[1].mss).toBe(-10.5)
      expect(records[1].rating).toBe('LOW')
    })

    it('returns empty array for missing file', () => {
      expect(parseSatisfactionFile(join(tmpDir, 'nonexistent.md'))).toEqual([])
    })

    it('skips malformed lines', () => {
      const content = '# Satisfaction Scores\n\n## chat-001 — 2026-06-10 14:30\nGARBAGE LINE\n\n## chat-002 — 2026-06-11 09:00\nMSS: 10.0 | Turns: 5 | Corrections: 0 | Escalations: 0 | Iterations: 0 | Acceptances: 2 | Commits: 1 | Rating: MEDIUM\n\n'
      const filePath = join(tmpDir, 'satisfaction.md')
      writeFileSync(filePath, content)

      const records = parseSatisfactionFile(filePath)
      expect(records).toHaveLength(1)
      expect(records[0].chatId).toBe('chat-002')
    })
  })

  describe('evaluateTriggers — repeated_corrections', () => {
    it('fires when ≥3 recent sessions have corrections > 0', () => {
      const records: SatisfactionRecord[] = [
        { chatId: 'c1', date: recentDate(1), mss: 20, turns: 5, corrections: 2, escalations: 0, iterations: 0, acceptances: 3, commits: 1, rating: 'MEDIUM' },
        { chatId: 'c2', date: recentDate(2), mss: 15, turns: 4, corrections: 1, escalations: 0, iterations: 0, acceptances: 2, commits: 0, rating: 'MEDIUM' },
        { chatId: 'c3', date: recentDate(3), mss: 10, turns: 6, corrections: 3, escalations: 0, iterations: 0, acceptances: 4, commits: 1, rating: 'MEDIUM' },
        { chatId: 'c4', date: recentDate(5), mss: 5, turns: 3, corrections: 1, escalations: 0, iterations: 0, acceptances: 1, commits: 0, rating: 'MEDIUM' },
      ]

      const triggers = evaluateTriggers([
        { agentId: 'test-agent', records, soulMtime: new Date() },
      ])

      const correctionTrigger = triggers.find(t => t.type === 'repeated_corrections')
      expect(correctionTrigger).toBeDefined()
      expect(correctionTrigger!.agentId).toBe('test-agent')
      expect(correctionTrigger!.severity).toBe('high')
      expect((correctionTrigger!.evidence as { sessionsWithCorrections: number }).sessionsWithCorrections).toBe(4)
    })

    it('does not fire when fewer than 3 sessions have corrections', () => {
      const records: SatisfactionRecord[] = [
        { chatId: 'c1', date: recentDate(1), mss: 20, turns: 5, corrections: 2, escalations: 0, iterations: 0, acceptances: 3, commits: 1, rating: 'MEDIUM' },
        { chatId: 'c2', date: recentDate(2), mss: 30, turns: 4, corrections: 0, escalations: 0, iterations: 0, acceptances: 2, commits: 1, rating: 'MEDIUM' },
        { chatId: 'c3', date: recentDate(3), mss: 25, turns: 6, corrections: 1, escalations: 0, iterations: 0, acceptances: 4, commits: 1, rating: 'MEDIUM' },
      ]

      const triggers = evaluateTriggers([
        { agentId: 'test-agent', records, soulMtime: new Date() },
      ])

      expect(triggers.find(t => t.type === 'repeated_corrections')).toBeUndefined()
    })
  })

  describe('evaluateTriggers — low_satisfaction', () => {
    it('fires when avg MSS < 0 across ≥5 sessions in 14 days', () => {
      const records: SatisfactionRecord[] = Array.from({ length: 6 }, (_, i) => ({
        chatId: `c${i}`,
        date: recentDate(i + 1),
        mss: -15.0,
        turns: 10,
        corrections: 3,
        escalations: 1,
        iterations: 2,
        acceptances: 0,
        commits: 0,
        rating: 'LOW',
      }))

      const triggers = evaluateTriggers([
        { agentId: 'struggling-agent', records, soulMtime: new Date() },
      ])

      const satTrigger = triggers.find(t => t.type === 'low_satisfaction')
      expect(satTrigger).toBeDefined()
      expect(satTrigger!.agentId).toBe('struggling-agent')
      expect(satTrigger!.severity).toBe('high')
      expect((satTrigger!.evidence as { avgMss: number }).avgMss).toBe(-15.0)
      expect((satTrigger!.evidence as { sessionCount: number }).sessionCount).toBe(6)
    })

    it('does not fire when avg MSS >= 0', () => {
      const records: SatisfactionRecord[] = Array.from({ length: 6 }, (_, i) => ({
        chatId: `c${i}`,
        date: recentDate(i + 1),
        mss: 5.0,
        turns: 10,
        corrections: 1,
        escalations: 0,
        iterations: 0,
        acceptances: 3,
        commits: 1,
        rating: 'MEDIUM',
      }))

      const triggers = evaluateTriggers([
        { agentId: 'ok-agent', records, soulMtime: new Date() },
      ])

      expect(triggers.find(t => t.type === 'low_satisfaction')).toBeUndefined()
    })

    it('does not fire with fewer than 5 sessions', () => {
      const records: SatisfactionRecord[] = Array.from({ length: 4 }, (_, i) => ({
        chatId: `c${i}`,
        date: recentDate(i + 1),
        mss: -20.0,
        turns: 10,
        corrections: 5,
        escalations: 2,
        iterations: 3,
        acceptances: 0,
        commits: 0,
        rating: 'LOW',
      }))

      const triggers = evaluateTriggers([
        { agentId: 'few-sessions', records, soulMtime: new Date() },
      ])

      expect(triggers.find(t => t.type === 'low_satisfaction')).toBeUndefined()
    })
  })

  describe('evaluateTriggers — stale_prompt', () => {
    it('fires when SOUL.md mtime > 30 days ago and ≥5 sessions in last 30 days', () => {
      const records: SatisfactionRecord[] = Array.from({ length: 8 }, (_, i) => ({
        chatId: `c${i}`,
        date: recentDate(i + 1),
        mss: 10.0,
        turns: 5,
        corrections: 0,
        escalations: 0,
        iterations: 0,
        acceptances: 2,
        commits: 1,
        rating: 'MEDIUM',
      }))

      const staleSoulMtime = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)

      const triggers = evaluateTriggers([
        { agentId: 'stale-agent', records, soulMtime: staleSoulMtime },
      ])

      const staleTrigger = triggers.find(t => t.type === 'stale_prompt')
      expect(staleTrigger).toBeDefined()
      expect(staleTrigger!.agentId).toBe('stale-agent')
      expect(staleTrigger!.severity).toBe('medium')
      expect((staleTrigger!.evidence as { sessionsSince: number }).sessionsSince).toBe(8)
    })

    it('does not fire when SOUL.md was recently modified', () => {
      const records: SatisfactionRecord[] = Array.from({ length: 8 }, (_, i) => ({
        chatId: `c${i}`,
        date: recentDate(i + 1),
        mss: 10.0,
        turns: 5,
        corrections: 0,
        escalations: 0,
        iterations: 0,
        acceptances: 2,
        commits: 1,
        rating: 'MEDIUM',
      }))

      const recentSoulMtime = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)

      const triggers = evaluateTriggers([
        { agentId: 'fresh-agent', records, soulMtime: recentSoulMtime },
      ])

      expect(triggers.find(t => t.type === 'stale_prompt')).toBeUndefined()
    })

    it('does not fire when soulMtime is null', () => {
      const records: SatisfactionRecord[] = Array.from({ length: 8 }, (_, i) => ({
        chatId: `c${i}`,
        date: recentDate(i + 1),
        mss: 10.0,
        turns: 5,
        corrections: 0,
        escalations: 0,
        iterations: 0,
        acceptances: 2,
        commits: 1,
        rating: 'MEDIUM',
      }))

      const triggers = evaluateTriggers([
        { agentId: 'no-soul', records, soulMtime: null },
      ])

      expect(triggers.find(t => t.type === 'stale_prompt')).toBeUndefined()
    })
  })

  describe('evaluateTriggers — multiple triggers', () => {
    it('can fire multiple triggers for the same agent', () => {
      const records: SatisfactionRecord[] = Array.from({ length: 6 }, (_, i) => ({
        chatId: `c${i}`,
        date: recentDate(i + 1),
        mss: -20.0,
        turns: 10,
        corrections: 3,
        escalations: 2,
        iterations: 4,
        acceptances: 0,
        commits: 0,
        rating: 'LOW',
      }))

      const staleSoulMtime = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)

      const triggers = evaluateTriggers([
        { agentId: 'troubled-agent', records, soulMtime: staleSoulMtime },
      ])

      expect(triggers.filter(t => t.agentId === 'troubled-agent').length).toBeGreaterThanOrEqual(3)
      expect(triggers.find(t => t.type === 'repeated_corrections')).toBeDefined()
      expect(triggers.find(t => t.type === 'low_satisfaction')).toBeDefined()
      expect(triggers.find(t => t.type === 'stale_prompt')).toBeDefined()
    })
  })
})
