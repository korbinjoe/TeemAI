/**
 * Mission switch performance metrics and scoring.
 * Shared between the web instrumentation (missionSwitchPerf) and the
 * automated benchmark script (scripts/benchmark-mission-switch.ts).
 */

export type MissionSwitchSource = 'sidebar' | 'keyboard' | 'other'

export interface MissionSwitchMarkLike {
  name: string
  deltaMs: number
  extra?: Record<string, unknown>
}

export interface MissionSwitchTraceLike {
  id: number
  chatId: string
  source: MissionSwitchSource
  replayMessageCount: number
  replayProcessMs: number
  replayBatchCount: number
  finalizeReason?: string
  marks: MissionSwitchMarkLike[]
}

export interface MissionSwitchRow {
  id: number
  chat: string
  chatId: string
  source: MissionSwitchSource
  cached: boolean | null
  /** LRU warm hit — client skipped or should skip JSONL replay */
  warm: boolean | null
  interactiveMs: number | null
  resumeMs: number | null
  /** WebIDEPanel mounted with repo roots for this mission */
  ideReadyMs: number | null
  totalMs: number | null
  replayMsgs: number
  replayMs: number
  reason?: string
}

export interface MissionSwitchSummary {
  samples: number
  avgInteractiveMs: number | null
  p95InteractiveMs: number | null
  avgResumeMs: number | null
  avgTotalMs: number | null
  p95TotalMs: number | null
  avgIdeReadyMs: number | null
  p95IdeReadyMs: number | null
  avgReplayMsgs: number
  avgReplayProcessMs: number
  cachedHitRate: number
  warmSwitchRate: number
  /** Avg replay msgs on switches where LRU cache was warm */
  warmCacheAvgReplayMsgs: number | null
}

export type MissionSwitchGrade = 'A' | 'B' | 'C' | 'D' | 'F'

export interface MissionSwitchMetricScore {
  id: string
  label: string
  value: number | null
  unit: string
  score: number
  weight: number
  note?: string
}

export interface MissionSwitchScoreReport {
  score: number
  grade: MissionSwitchGrade
  summary: MissionSwitchSummary
  metrics: MissionSwitchMetricScore[]
  warnings: string[]
}

export interface MissionSwitchBaseline {
  version: 1
  updatedAt: string
  score: number
  grade: MissionSwitchGrade
  summary: MissionSwitchSummary
}

/** Lower is better unless noted. */
export const MISSION_SWITCH_THRESHOLDS = {
  interactiveMs: { excellent: 50, good: 100, poor: 200 },
  p95TotalMs: { excellent: 300, good: 500, poor: 900 },
  p95IdeReadyMs: { excellent: 80, good: 200, poor: 500 },
  avgResumeMs: { excellent: 150, good: 350, poor: 600 },
  warmCacheReplayMsgs: { excellent: 0, good: 5, poor: 50 },
} as const

export const MISSION_SWITCH_SCORE_WEIGHTS = {
  interactive: 0.25,
  p95Total: 0.35,
  resume: 0.15,
  warmReplay: 0.25,
} as const

const avg = (arr: number[]): number =>
  arr.reduce((a, b) => a + b, 0) / arr.length

const percentile = (arr: number[], p: number): number | null => {
  if (arr.length === 0) return null
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? null
}

/** Map a lower-is-better metric into 0–100. */
export const scoreLowerIsBetter = (
  value: number | null,
  thresholds: { excellent: number; good: number; poor: number },
): number => {
  if (value == null || Number.isNaN(value)) return 0
  if (value <= thresholds.excellent) return 100
  if (value <= thresholds.good) {
    const span = thresholds.good - thresholds.excellent
    if (span <= 0) return 85
    return 100 - ((value - thresholds.excellent) / span) * 15
  }
  if (value <= thresholds.poor) {
    const span = thresholds.poor - thresholds.good
    if (span <= 0) return 60
    return 85 - ((value - thresholds.good) / span) * 45
  }
  const over = value - thresholds.poor
  return Math.max(0, 40 - over / 20)
}

export const gradeFromScore = (score: number): MissionSwitchGrade => {
  if (score >= 90) return 'A'
  if (score >= 75) return 'B'
  if (score >= 60) return 'C'
  if (score >= 45) return 'D'
  return 'F'
}

export const traceToRow = (t: MissionSwitchTraceLike): MissionSwitchRow => {
  const interactive = t.marks.find((m) => m.name === 'interactive')
  const resume = t.marks.find((m) => m.name === 'ws-resume-sent')
  const ideReady = t.marks.find((m) => m.name === 'ide-ready')
  const done = t.marks.find((m) => m.name === 'done')
  const paneActive = t.marks.find((m) => m.name === 'chat-pane-active')
  const cachedExtra = paneActive?.extra?.cached
  const warmExtra = paneActive?.extra?.warm
  const usedWarmSkip = t.marks.some((m) => m.name === 'ws-resume-warm')
  return {
    id: t.id,
    chat: t.chatId.slice(0, 8),
    chatId: t.chatId,
    source: t.source,
    cached: typeof cachedExtra === 'boolean' ? cachedExtra : null,
    warm: typeof warmExtra === 'boolean' ? warmExtra : (usedWarmSkip ? true : null),
    interactiveMs: interactive?.deltaMs ?? null,
    resumeMs: resume?.deltaMs ?? null,
    ideReadyMs: ideReady?.deltaMs ?? null,
    totalMs: done?.deltaMs ?? null,
    replayMsgs: t.replayMessageCount,
    replayMs: Math.round(t.replayProcessMs * 10) / 10,
    reason: t.finalizeReason,
  }
}

export const summarizeMissionSwitchRows = (rows: MissionSwitchRow[]): MissionSwitchSummary => {
  const interactive = rows.map((x) => x.interactiveMs).filter((v): v is number => v != null)
  const total = rows.map((x) => x.totalMs).filter((v): v is number => v != null)
  const ideReady = rows.map((x) => x.ideReadyMs).filter((v): v is number => v != null)
  const resume = rows.map((x) => x.resumeMs).filter((v): v is number => v != null)
  const warmCached = rows.filter((r) => r.warm === true)
  const warmReplay = warmCached.map((r) => r.replayMsgs)

  return {
    samples: rows.length,
    avgInteractiveMs: interactive.length ? Math.round(avg(interactive)) : null,
    p95InteractiveMs: interactive.length ? Math.round(percentile(interactive, 0.95) ?? 0) : null,
    avgResumeMs: resume.length ? Math.round(avg(resume)) : null,
    avgTotalMs: total.length ? Math.round(avg(total)) : null,
    p95TotalMs: total.length ? Math.round(percentile(total, 0.95) ?? 0) : null,
    avgIdeReadyMs: ideReady.length ? Math.round(avg(ideReady)) : null,
    p95IdeReadyMs: ideReady.length ? Math.round(percentile(ideReady, 0.95) ?? 0) : null,
    avgReplayMsgs: rows.length ? Math.round(avg(rows.map((r) => r.replayMsgs))) : 0,
    avgReplayProcessMs: rows.length
      ? Math.round(avg(rows.map((r) => r.replayMs)) * 10) / 10
      : 0,
    cachedHitRate: rows.length
      ? Math.round(rows.filter((r) => r.cached === true).length / rows.length * 100)
      : 0,
    warmSwitchRate: rows.length
      ? Math.round(rows.filter((r) => r.warm === true).length / rows.length * 100)
      : 0,
    warmCacheAvgReplayMsgs: warmReplay.length ? Math.round(avg(warmReplay)) : null,
  }
}

export const scoreMissionSwitch = (
  summary: MissionSwitchSummary,
  rows: MissionSwitchRow[] = [],
): MissionSwitchScoreReport => {
  const warnings: string[] = []
  const metrics: MissionSwitchMetricScore[] = [
    {
      id: 'interactive',
      label: 'avg interactive (ms)',
      value: summary.avgInteractiveMs,
      unit: 'ms',
      weight: MISSION_SWITCH_SCORE_WEIGHTS.interactive,
      score: scoreLowerIsBetter(summary.avgInteractiveMs, MISSION_SWITCH_THRESHOLDS.interactiveMs),
    },
    {
      id: 'p95Total',
      label: 'p95 total (ms)',
      value: summary.p95TotalMs,
      unit: 'ms',
      weight: MISSION_SWITCH_SCORE_WEIGHTS.p95Total,
      score: scoreLowerIsBetter(summary.p95TotalMs, MISSION_SWITCH_THRESHOLDS.p95TotalMs),
    },
    {
      id: 'resume',
      label: 'avg resume sent (ms)',
      value: summary.avgResumeMs,
      unit: 'ms',
      weight: MISSION_SWITCH_SCORE_WEIGHTS.resume,
      score: scoreLowerIsBetter(summary.avgResumeMs, MISSION_SWITCH_THRESHOLDS.avgResumeMs),
      note: 'Includes mission:resume-agents debounce',
    },
    {
      id: 'warmReplay',
      label: 'warm-cache avg replay msgs',
      value: summary.warmCacheAvgReplayMsgs,
      unit: 'msgs',
      weight: MISSION_SWITCH_SCORE_WEIGHTS.warmReplay,
      score: scoreLowerIsBetter(
        summary.warmCacheAvgReplayMsgs,
        MISSION_SWITCH_THRESHOLDS.warmCacheReplayMsgs,
      ),
      note: 'Should be 0 once skip-replay optimization lands',
    },
  ]

  if (summary.samples < 4) {
    warnings.push(`Low sample count (${summary.samples}) — run more rounds for stable scoring`)
  }
  if (summary.warmSwitchRate < 50 && rows.length > 0) {
    warnings.push(`Low warm switch rate (${summary.warmSwitchRate}%) — benchmark may not reflect LRU warm path`)
  }
  if (summary.cachedHitRate < 50 && rows.length > 0 && summary.warmSwitchRate < 50) {
    warnings.push(`Low LRU cache hit rate (${summary.cachedHitRate}%) — benchmark may not reflect warm switches`)
  }
  const warmRows = rows.filter((r) => r.warm === true)
  if (warmRows.length > 0 && warmRows.some((r) => r.replayMsgs > 5)) {
    warnings.push(`${warmRows.filter((r) => r.replayMsgs > 5).length} warm switch(es) still replayed >5 messages — skip-replay may not be active`)
  }
  const heavyReplay = rows.filter((r) => r.replayMsgs >= 100)
  if (heavyReplay.length > 0) {
    warnings.push(`${heavyReplay.length} switch(es) replayed ≥100 messages — check long-conversation missions`)
  }
  const missingIdeReady = rows.filter((r) => r.ideReadyMs == null)
  if (missingIdeReady.length > 0 && rows.length > 0) {
    warnings.push(`${missingIdeReady.length} switch(es) missing ide-ready — IDE panel may be collapsed or still loading`)
  }

  const weightSum = metrics.reduce((a, m) => a + m.weight, 0)
  const score = Math.round(
    metrics.reduce((a, m) => a + m.score * m.weight, 0) / weightSum,
  )

  return {
    score,
    grade: gradeFromScore(score),
    summary,
    metrics,
    warnings,
  }
}

export interface BaselineComparison {
  passed: boolean
  scoreDelta: number
  p95TotalDelta: number | null
  p95IdeReadyDelta: number | null
  messages: string[]
}

export const compareToBaseline = (
  report: MissionSwitchScoreReport,
  baseline: MissionSwitchBaseline,
  opts?: { maxScoreDrop?: number; maxP95TotalRegressionMs?: number },
): BaselineComparison => {
  const maxScoreDrop = opts?.maxScoreDrop ?? 5
  const maxP95Regression = opts?.maxP95TotalRegressionMs ?? 80
  const scoreDelta = report.score - baseline.score
  const p95TotalDelta =
    report.summary.p95TotalMs != null && baseline.summary.p95TotalMs != null
      ? report.summary.p95TotalMs - baseline.summary.p95TotalMs
      : null
  const p95IdeReadyDelta =
    report.summary.p95IdeReadyMs != null && baseline.summary.p95IdeReadyMs != null
      ? report.summary.p95IdeReadyMs - baseline.summary.p95IdeReadyMs
      : null

  const messages: string[] = []
  let passed = true

  if (scoreDelta < -maxScoreDrop) {
    passed = false
    messages.push(`Score regressed by ${Math.abs(scoreDelta)} pts (${baseline.score} → ${report.score})`)
  } else {
    messages.push(`Score ${scoreDelta >= 0 ? '+' : ''}${scoreDelta} vs baseline (${baseline.score} → ${report.score})`)
  }

  if (p95TotalDelta != null && p95TotalDelta > maxP95Regression) {
    passed = false
    messages.push(`p95 total regressed +${p95TotalDelta}ms (limit +${maxP95Regression}ms)`)
  } else if (p95TotalDelta != null) {
    messages.push(`p95 total ${p95TotalDelta >= 0 ? '+' : ''}${p95TotalDelta}ms vs baseline`)
  }

  if (p95IdeReadyDelta != null) {
    messages.push(`p95 ide-ready ${p95IdeReadyDelta >= 0 ? '+' : ''}${p95IdeReadyDelta}ms vs baseline (informational)`)
  }

  return { passed, scoreDelta, p95TotalDelta, p95IdeReadyDelta, messages }
}

export const formatScoreReport = (report: MissionSwitchScoreReport): string => {
  const ideReadyScore = scoreLowerIsBetter(
    report.summary.p95IdeReadyMs,
    MISSION_SWITCH_THRESHOLDS.p95IdeReadyMs,
  )
  const lines = [
    `[mission-switch] score ${report.score}/100 grade ${report.grade}`,
    ...report.metrics.map(
      (m) => `  ${m.label}: ${m.value ?? 'n/a'}${m.unit === 'ms' ? 'ms' : ''} → ${Math.round(m.score)}/100 (w=${m.weight})`,
    ),
    `  p95 ide-ready (ms): ${report.summary.p95IdeReadyMs ?? 'n/a'}ms → ${Math.round(ideReadyScore)}/100 (informational)`,
  ]
  if (report.warnings.length > 0) {
    lines.push('  warnings:', ...report.warnings.map((w) => `    - ${w}`))
  }
  return lines.join('\n')
}
