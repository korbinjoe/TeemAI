/**
 * Mission switch performance instrumentation (permanent).
 *
 * Collects timing marks on every mission navigation. Console output is
 * limited to dev / VITE_MISSION_SWITCH_PERF builds; scoring logic lives in
 * shared/missionSwitchScore.ts and is reused by the benchmark script.
 *
 * Browser console:
 *   __missionSwitchPerf.help()
 *   __missionSwitchPerf.score()
 *   __missionSwitchPerf.dump()
 */

import {
  type MissionSwitchSource,
  type MissionSwitchTraceLike,
  traceToRow,
  summarizeMissionSwitchRows,
  scoreMissionSwitch,
  formatScoreReport,
  type MissionSwitchScoreReport,
} from '../../shared/missionSwitchScore'

export type { MissionSwitchSource }

export interface MissionSwitchMark {
  name: string
  t: number
  deltaMs: number
  extra?: Record<string, unknown>
}

export interface MissionSwitchTrace extends MissionSwitchTraceLike {
  t0: number
  marks: MissionSwitchMark[]
  finalized: boolean
}

const MAX_HISTORY = 50
const FINALIZE_AFTER_INTERACTIVE_MS = 600
const FINALIZE_TIMEOUT_MS = 5000

let traceSeq = 0
let active: MissionSwitchTrace | null = null
const history: MissionSwitchTrace[] = []
let finalizeTimer: ReturnType<typeof setTimeout> | null = null

/** Instrumentation active in dev or when explicitly enabled for profiling builds. */
export const isMissionSwitchPerfEnabled = (): boolean => {
  if (typeof import.meta === 'undefined') return false
  return import.meta.env.DEV || import.meta.env.VITE_MISSION_SWITCH_PERF === 'true'
}

const shouldLog = (): boolean => isMissionSwitchPerfEnabled()

const clearFinalizeTimer = () => {
  if (finalizeTimer !== null) {
    clearTimeout(finalizeTimer)
    finalizeTimer = null
  }
}

const tryFinalizeIdePath = (chatId: string) => {
  if (!active || active.chatId !== chatId || active.finalized) return
  const hasInteractive = active.marks.some((m) => m.name === 'interactive')
  const hasIdeReady = active.marks.some((m) => m.name === 'ide-ready')
  if (hasInteractive && hasIdeReady) {
    scheduleFinalize(chatId, 'ide-ready', 50)
  }
}

const scheduleFinalize = (chatId: string, reason: string, delayMs: number) => {
  if (!active || active.chatId !== chatId || active.finalized) return
  clearFinalizeTimer()
  finalizeTimer = setTimeout(() => {
    finalizeTrace(chatId, reason)
  }, delayMs)
}

const pushMark = (name: string, extra?: Record<string, unknown>) => {
  if (!active) return
  const t = performance.now()
  active.marks.push({ name, t, deltaMs: t - active.t0, extra })
  try {
    performance.mark(`mswitch:${active.id}:${name}`)
  } catch { /* Performance API quota */ }
}

const logTrace = (trace: MissionSwitchTrace) => {
  if (!shouldLog()) return
  const header = `[mission-switch] #${trace.id} chat=${trace.chatId.slice(0, 8)} source=${trace.source} reason=${trace.finalizeReason ?? '?'}`
  const lines = trace.marks.map(
    (m) => `  +${m.deltaMs.toFixed(1)}ms ${m.name}${m.extra ? ` ${JSON.stringify(m.extra)}` : ''}`,
  )
  const footer = `  replay: ${trace.replayBatchCount} batch(es), ${trace.replayMessageCount} msgs, ${trace.replayProcessMs.toFixed(1)}ms process`
  // eslint-disable-next-line no-console
  console.log([header, ...lines, footer].join('\n'))
}

const finalizeTrace = (chatId: string, reason: string) => {
  if (!active || active.chatId !== chatId || active.finalized) return
  clearFinalizeTimer()
  active.finalized = true
  active.finalizeReason = reason
  pushMark('done', { reason })
  const snapshot: MissionSwitchTrace = { ...active, marks: [...active.marks] }
  history.unshift(snapshot)
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY
  logTrace(snapshot)
  active = null
}

export const missionSwitchPerf = {
  enabled: isMissionSwitchPerfEnabled,

  start(chatId: string, source: MissionSwitchSource = 'other') {
    if (!isMissionSwitchPerfEnabled()) return
    clearFinalizeTimer()
    if (active && !active.finalized) {
      finalizeTrace(active.chatId, 'superseded')
    }
    active = {
      id: ++traceSeq,
      chatId,
      source,
      t0: performance.now(),
      marks: [],
      replayMessageCount: 0,
      replayProcessMs: 0,
      replayBatchCount: 0,
      finalized: false,
    }
    pushMark('start', { source })
    scheduleFinalize(chatId, 'timeout', FINALIZE_TIMEOUT_MS)
  },

  mark(name: string, chatId?: string, extra?: Record<string, unknown>) {
    if (!isMissionSwitchPerfEnabled() || !active) return
    if (chatId && active.chatId !== chatId) return
    pushMark(name, extra)
  },

  markInteractive(chatId: string) {
    if (!isMissionSwitchPerfEnabled() || !active || active.chatId !== chatId) return
    pushMark('interactive')
    if (active.marks.some((m) => m.name === 'ide-ready')) {
      tryFinalizeIdePath(chatId)
    } else {
      scheduleFinalize(chatId, 'interactive-no-replay', FINALIZE_AFTER_INTERACTIVE_MS)
    }
  },

  markWsContextSent(chatId: string) {
    this.mark('ws-context-sent', chatId)
  },

  markWsResumeSent(chatId: string, extra?: Record<string, unknown>) {
    this.mark('ws-resume-sent', chatId, extra)
    scheduleFinalize(chatId, 'timeout-after-resume', FINALIZE_TIMEOUT_MS)
  },

  markReplay(chatId: string, messageCount: number, processMs: number) {
    if (!isMissionSwitchPerfEnabled() || !active || active.chatId !== chatId) return
    active.replayBatchCount += 1
    active.replayMessageCount += messageCount
    active.replayProcessMs += processMs
    pushMark('replay-batch', { messageCount, processMs: Math.round(processMs * 10) / 10 })
    scheduleFinalize(chatId, 'replay-settled', 80)
  },

  markCwdReady(chatId: string) {
    this.mark('cwd-ready', chatId)
  },

  markIdeReady(chatId: string, extra?: Record<string, unknown>) {
    if (!isMissionSwitchPerfEnabled() || !active || active.chatId !== chatId) return
    if (active.marks.some((m) => m.name === 'ide-ready')) return
    pushMark('ide-ready', extra)
    tryFinalizeIdePath(chatId)
  },

  getActive(): MissionSwitchTrace | null {
    return active
  },

  getHistory(): MissionSwitchTrace[] {
    return [...history]
  },

  clear() {
    clearFinalizeTimer()
    active = null
    history.length = 0
    if (shouldLog()) {
      // eslint-disable-next-line no-console
      console.log('[mission-switch] history cleared')
    }
  },

  score(): MissionSwitchScoreReport | null {
    const rows = history.map(traceToRow)
    if (rows.length === 0) return null
    const summary = summarizeMissionSwitchRows(rows)
    return scoreMissionSwitch(summary, rows)
  },

  dump(opts?: { json?: boolean; score?: boolean }) {
    const rows = history.map(traceToRow)
    const withScore = opts?.score !== false
    const report = withScore && rows.length > 0 ? scoreMissionSwitch(summarizeMissionSwitchRows(rows), rows) : null

    if (opts?.json) {
      const payload = { rows, report }
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(payload, null, 2))
      return payload
    }

    if (rows.length === 0) {
      // eslint-disable-next-line no-console
      console.log('[mission-switch] no traces yet — switch missions, then dump() or score()')
      return { rows, report: null }
    }

    // eslint-disable-next-line no-console
    console.table(rows.map(({ chatId: _cid, ...r }) => r))
    if (report) {
      // eslint-disable-next-line no-console
      console.log(formatScoreReport(report))
    }
    return { rows, report }
  },

  help() {
    // eslint-disable-next-line no-console
    console.log([
      '[mission-switch] perf instrumentation',
      '  Switch missions via sidebar or ⌘1–4, then:',
      '  __missionSwitchPerf.score()',
      '  __missionSwitchPerf.dump()',
      '  __missionSwitchPerf.dump({ json: true })',
      '  Automated: npm run perf:mission-switch',
      '  Marks: start → interactive → ide-ready → done (total includes finalize delay)',
    ].join('\n'))
  },
}

declare global {
  interface Window {
    __missionSwitchPerf?: typeof missionSwitchPerf
  }
}

if (isMissionSwitchPerfEnabled() && typeof window !== 'undefined') {
  window.__missionSwitchPerf = missionSwitchPerf
  if (import.meta.env.DEV) {
    try {
      if (!sessionStorage.getItem('teemai:mswitch-perf-help')) {
        sessionStorage.setItem('teemai:mswitch-perf-help', '1')
        missionSwitchPerf.help()
      }
    } catch {
      missionSwitchPerf.help()
    }
  }
}
