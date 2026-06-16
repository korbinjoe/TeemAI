import { describe, it, expect } from 'vitest'
import {
  scoreLowerIsBetter,
  gradeFromScore,
  summarizeMissionSwitchRows,
  scoreMissionSwitch,
  compareToBaseline,
  type MissionSwitchRow,
  type MissionSwitchBaseline,
} from '../missionSwitchScore'

describe('missionSwitchScore', () => {
  it('scores lower-is-better metrics on thresholds', () => {
    expect(scoreLowerIsBetter(30, { excellent: 50, good: 100, poor: 200 })).toBe(100)
    expect(scoreLowerIsBetter(75, { excellent: 50, good: 100, poor: 200 })).toBeGreaterThan(85)
    expect(scoreLowerIsBetter(500, { excellent: 50, good: 100, poor: 200 })).toBeLessThan(40)
  })

  it('assigns letter grades', () => {
    expect(gradeFromScore(92)).toBe('A')
    expect(gradeFromScore(80)).toBe('B')
    expect(gradeFromScore(65)).toBe('C')
    expect(gradeFromScore(50)).toBe('D')
    expect(gradeFromScore(30)).toBe('F')
  })

  it('computes weighted score from summary', () => {
    const rows: MissionSwitchRow[] = [
      {
        id: 1, chat: 'abc', chatId: 'abc123', source: 'sidebar', cached: true, warm: true,
        interactiveMs: 40, resumeMs: 200, ideReadyMs: 55, totalMs: 350, replayMsgs: 0, replayMs: 0,
      },
      {
        id: 2, chat: 'def', chatId: 'def456', source: 'sidebar', cached: true, warm: true,
        interactiveMs: 45, resumeMs: 220, ideReadyMs: 60, totalMs: 380, replayMsgs: 2, replayMs: 0.1,
      },
    ]
    const summary = summarizeMissionSwitchRows(rows)
    const report = scoreMissionSwitch(summary, rows)
    expect(report.score).toBeGreaterThan(60)
    expect(report.grade).toMatch(/^[A-F]$/)
    expect(report.metrics).toHaveLength(4)
  })

  it('summarizes ide-ready separately from total', () => {
    const rows: MissionSwitchRow[] = [
      {
        id: 1, chat: 'abc', chatId: 'abc123', source: 'sidebar', cached: true, warm: true,
        interactiveMs: 50, resumeMs: 20, ideReadyMs: 80, totalMs: 650, replayMsgs: 0, replayMs: 0,
      },
      {
        id: 2, chat: 'def', chatId: 'def456', source: 'sidebar', cached: true, warm: true,
        interactiveMs: 45, resumeMs: 18, ideReadyMs: 90, totalMs: 640, replayMsgs: 0, replayMs: 0,
      },
    ]
    const summary = summarizeMissionSwitchRows(rows)
    expect(summary.p95IdeReadyMs).toBe(90)
    expect(summary.p95TotalMs).toBe(650)
    expect(summary.p95IdeReadyMs).toBeLessThan(summary.p95TotalMs!)
  })

  it('detects baseline regression', () => {
    const baseline: MissionSwitchBaseline = {
      version: 1,
      updatedAt: '2026-01-01',
      score: 80,
      grade: 'B',
      summary: {
        samples: 8,
        avgInteractiveMs: 40,
        p95InteractiveMs: 50,
        avgResumeMs: 300,
        avgTotalMs: 450,
        p95TotalMs: 500,
        avgIdeReadyMs: 70,
        p95IdeReadyMs: 85,
        avgReplayMsgs: 10,
        avgReplayProcessMs: 0.1,
        cachedHitRate: 100,
        warmSwitchRate: 100,
        warmCacheAvgReplayMsgs: 10,
      },
    }
    const report = scoreMissionSwitch(baseline.summary)
    report.score = 70
    report.summary.p95TotalMs = 600
    const cmp = compareToBaseline(report, baseline)
    expect(cmp.passed).toBe(false)
  })
})
