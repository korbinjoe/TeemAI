#!/usr/bin/env tsx
/**
 * Mission switch stress benchmark under synthetic running-mission load.
 *
 * Prerequisites: `npm run dev` on ports 13000/13001, >=2 missions in first workspace.
 *
 * Usage:
 *   npm run perf:mission-switch:running
 *   npm run perf:mission-switch:running -- --rounds 4 --switch-settle-ms 650
 *   npm run perf:mission-switch:running -- --strict
 */

import { chromium } from 'playwright'
import {
  traceToRow,
  summarizeMissionSwitchRows,
  scoreMissionSwitch,
  formatScoreReport,
  type MissionSwitchRow,
  type MissionSwitchTraceLike,
} from '../shared/missionSwitchScore'

const API = process.env.TEEMAI_API ?? 'http://localhost:13001'
const UI = process.env.TEEMAI_UI ?? 'http://localhost:13000'

interface Args {
  rounds: number
  switchSettleMs: number
  postObserveMs: number
  missionCount: number
  agentCount: number
  eventIntervalMs: number
  structuredEvery: number
  strict: boolean
}

interface ChatSummary {
  id: string
  workspaceId: string
  archivedAt: string | null
}

interface AgentSummary {
  id?: string
  name?: string
}

interface RunningLoadMetrics {
  syntheticEventCounts: Record<string, number>
  syntheticTotalEvents: number
  wsSendCounts: Record<string, number>
  longTaskCount: number
  longTaskOver50: number
  longTaskMaxMs: number
  longTaskP95Ms: number
  frameGapCount: number
  frameGapP95Ms: number
  frameGapMaxMs: number
  domNodes: number | null
  jsHeapUsedMb: number | null
  jsHeapTotalMb: number | null
  socketCount: number
  openSocketCount: number
}

const parsePositiveInt = (value: string | undefined, label: string): number => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive number`)
  }
  return Math.round(parsed)
}

const parseArgs = (): Args => {
  const args = process.argv.slice(2)
  const parsed: Args = {
    rounds: 4,
    switchSettleMs: 650,
    postObserveMs: 800,
    missionCount: 4,
    agentCount: 3,
    eventIntervalMs: 50,
    structuredEvery: 8,
    strict: false,
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--rounds') parsed.rounds = parsePositiveInt(args[++i], arg)
    else if (arg === '--switch-settle-ms') parsed.switchSettleMs = parsePositiveInt(args[++i], arg)
    else if (arg === '--post-observe-ms') parsed.postObserveMs = parsePositiveInt(args[++i], arg)
    else if (arg === '--mission-count') parsed.missionCount = parsePositiveInt(args[++i], arg)
    else if (arg === '--agent-count') parsed.agentCount = parsePositiveInt(args[++i], arg)
    else if (arg === '--event-interval-ms') parsed.eventIntervalMs = parsePositiveInt(args[++i], arg)
    else if (arg === '--structured-every') parsed.structuredEvery = parsePositiveInt(args[++i], arg)
    else if (arg === '--strict') parsed.strict = true
    else if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: npm run perf:mission-switch:running -- [options]',
        '  --rounds <n>              sidebar switch loops; default 4',
        '  --switch-settle-ms <n>    wait after each switch; default 650',
        '  --post-observe-ms <n>     wait after final switch before stop; default 800',
        '  --mission-count <n>       max missions to warm and switch; default 4',
        '  --agent-count <n>         synthetic agents per mission; default 3',
        '  --event-interval-ms <n>   synthetic WS tick interval; default 50',
        '  --structured-every <n>    emit structured delta every N ticks; default 8',
        '  --strict                  exit nonzero on warnings',
      ].join('\n'))
      process.exit(0)
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return parsed
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const fetchJson = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} -> ${res.status}`)
  return res.json() as Promise<T>
}

const waitForEndpoint = async (url: string, label: string, retries = 30): Promise<void> => {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      // retry
    }
    await sleep(1000)
  }
  throw new Error(`${label} not reachable at ${url}; run npm run dev first`)
}

const main = async (): Promise<void> => {
  const args = parseArgs()
  await waitForEndpoint(`${API}/api/agents`, 'API server')
  await waitForEndpoint(UI, 'UI server')

  const workspaces = await fetchJson<Array<{ id: string }>>(`${API}/api/workspaces`)
  const chats = await fetchJson<ChatSummary[]>(`${API}/api/all-chats`)
  const agents = await fetchJson<AgentSummary[]>(`${API}/api/agents`).catch(() => [])

  if (!workspaces.length) {
    console.error('[perf] no workspaces - create one in TeemAI first')
    process.exit(1)
  }

  const workspaceId = workspaces[0].id
  const workspaceChats = chats.filter((c) => c.workspaceId === workspaceId)
  const activeChats = workspaceChats.filter((c) => !c.archivedAt)
  const missionPool = activeChats.length >= 2 ? activeChats : workspaceChats
  const missionIds = missionPool.slice(0, args.missionCount).map((c) => c.id)
  const usesArchived = missionIds.some(
    (id) => workspaceChats.find((c) => c.id === id)?.archivedAt != null,
  )
  const agentIds = agents
    .map((agent, index) => agent.id || agent.name || `agent-${index + 1}`)
    .filter((id): id is string => Boolean(id))
    .slice(0, args.agentCount)
  while (agentIds.length < args.agentCount) {
    agentIds.push(`synthetic-agent-${agentIds.length + 1}`)
  }

  if (missionIds.length < 2) {
    console.error('[perf] need >=2 missions in the first workspace')
    process.exit(1)
  }

  console.log('[perf] running mission-switch benchmark (synthetic WS load)')
  console.log('[perf] workspace', workspaceId)
  console.log('[perf] missions', missionIds.map((id) => id.slice(0, 8)).join(', '))
  console.log('[perf] agents', agentIds.join(', '))
  console.log('[perf] config', {
    rounds: args.rounds,
    switchSettleMs: args.switchSettleMs,
    postObserveMs: args.postObserveMs,
    eventIntervalMs: args.eventIntervalMs,
    structuredEvery: args.structuredEvery,
    strict: args.strict,
  })

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.on('pageerror', (error) => {
    console.warn('[perf:pageerror]', error.message)
  })
  page.on('console', (message) => {
    if (message.type() === 'error') {
      console.warn('[perf:console]', message.text())
    }
  })

  await page.addInitScript('window.__name = (target) => target')
  await page.addInitScript(() => {
    try {
    const nativeWebSocket = window.WebSocket
    const sockets: WebSocket[] = []
    let frameGapLast = 0
    let syntheticTimer: ReturnType<typeof setInterval> | null = null
    let syntheticSeq = 0

    const browserPercentile = (values: number[], p: number): number => {
      if (values.length === 0) return 0
      const sorted = [...values].sort((a, b) => a - b)
      return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0
    }
    const roundBrowserMs = (value: number): number => Math.round(value * 10) / 10
    const browserBytesToMb = (value: number | null | undefined): number | null =>
      typeof value === 'number' ? Math.round((value / 1024 / 1024) * 10) / 10 : null

    const state = {
      syntheticEventCounts: {} as Record<string, number>,
      wsSendCounts: {} as Record<string, number>,
      longTasks: [] as number[],
      frameGaps: [] as number[],
    }

    const inc = (bucket: Record<string, number>, key: string) => {
      bucket[key] = (bucket[key] ?? 0) + 1
    }

    class WrappedWebSocket extends nativeWebSocket {
      constructor(...ctorArgs: ConstructorParameters<typeof WebSocket>) {
        super(...ctorArgs)
        sockets.push(this)
      }

      send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
        if (typeof data === 'string') {
          try {
            const parsed = JSON.parse(data) as { type?: string }
            if (parsed?.type) inc(state.wsSendCounts, parsed.type)
          } catch {
            // ignore non-JSON payloads
          }
        }
        super.send(data)
      }
    }

    Object.defineProperty(WrappedWebSocket, 'CONNECTING', { value: nativeWebSocket.CONNECTING })
    Object.defineProperty(WrappedWebSocket, 'OPEN', { value: nativeWebSocket.OPEN })
    Object.defineProperty(WrappedWebSocket, 'CLOSING', { value: nativeWebSocket.CLOSING })
    Object.defineProperty(WrappedWebSocket, 'CLOSED', { value: nativeWebSocket.CLOSED })
    window.WebSocket = WrappedWebSocket

    const emitSyntheticWs = (type: string, payload: unknown) => {
      const frame = JSON.stringify({ type, payload })
      for (const socket of sockets) {
        if (socket.readyState !== nativeWebSocket.OPEN) continue
        const evt = new MessageEvent('message', { data: frame })
        if (typeof socket.onmessage === 'function') {
          socket.onmessage.call(socket, evt)
        }
      }
      inc(state.syntheticEventCounts, type)
    }

    const reset = () => {
      state.syntheticEventCounts = {}
      state.wsSendCounts = {}
      state.longTasks = []
      state.frameGaps = []
      syntheticSeq = 0
    }

    const startSyntheticLoad = (opts: {
      missionIds: string[]
      agentIds: string[]
      intervalMs: number
      structuredEvery: number
    }) => {
      if (syntheticTimer) clearInterval(syntheticTimer)
      const missionIds = opts.missionIds
      const agentIds = opts.agentIds
      const structuredEvery = Math.max(1, opts.structuredEvery)
      syntheticTimer = setInterval(() => {
        syntheticSeq += 1
        const now = Date.now()
        for (const chatId of missionIds) {
          const agentActivities = agentIds.map((agentId, index) => ({
            agentId,
            agentName: agentId,
            phase: 'running',
            currentTool: index % 2 === 0 ? 'shell' : 'edit',
            toolCount: syntheticSeq + index + 2,
            toolCompleted: syntheticSeq + index,
            cost: roundBrowserMs((syntheticSeq + index) / 1000),
          }))

          emitSyntheticWs('mission.activity', {
            chatId,
            phase: 'running',
            currentTool: 'synthetic-load',
            toolCount: syntheticSeq + agentIds.length,
            toolCompleted: syntheticSeq,
            cost: roundBrowserMs(syntheticSeq / 1000),
            logLine: `synthetic running update ${syntheticSeq}`,
            latestMessage: {
              role: 'agent',
              text: `synthetic update ${syntheticSeq}`,
              at: now,
            },
            agentActivities,
          })

          for (const [agentIndex, agentId] of agentIds.entries()) {
            const sessionId = `synthetic-${chatId}-${agentId}`
            emitSyntheticWs('agent:activity', {
              agentId,
              chatId,
              startedAt: now - 30_000,
              activity: {
                phase: 'running',
                background: false,
                currentTool: agentIndex % 2 === 0 ? 'shell' : 'edit',
                toolCount: syntheticSeq + agentIndex + 2,
                toolCompleted: syntheticSeq + agentIndex,
                hasText: true,
                updatedAt: now,
              },
            })
            emitSyntheticWs('agent:partial-text', {
              agentId,
              chatId,
              sessionId,
              blockIndex: syntheticSeq,
              text: ` synthetic-${agentIndex}-${syntheticSeq}`,
            })
            if (syntheticSeq % structuredEvery === 0) {
              emitSyntheticWs('agent:structured-message', {
                agentId,
                chatId,
                sessionId,
                type: 'delta',
                messages: [{
                  id: `synthetic-${chatId}-${agentId}-${syntheticSeq}`,
                  role: 'agent',
                  agentId,
                  content: `Synthetic committed update ${syntheticSeq}`,
                  timestamp: now,
                  type: 'text',
                }],
              })
            }
          }
        }
      }, opts.intervalMs)
    }

    const stopSyntheticLoad = () => {
      if (syntheticTimer) clearInterval(syntheticTimer)
      syntheticTimer = null
    }

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          state.longTasks.push(entry.duration)
        }
      })
      observer.observe({ type: 'longtask', buffered: true })
    } catch {
      // Long task observer is unavailable in some browser contexts.
    }

    const tickFrame = (ts: number) => {
      if (frameGapLast > 0) state.frameGaps.push(ts - frameGapLast)
      frameGapLast = ts
      window.requestAnimationFrame(tickFrame)
    }
    window.requestAnimationFrame(tickFrame)

    const getMetrics = () => {
      const memory = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory
      const longTasks = state.longTasks
      const frameGaps = state.frameGaps
      return {
        syntheticEventCounts: { ...state.syntheticEventCounts },
        syntheticTotalEvents: Object.values(state.syntheticEventCounts).reduce((a, b) => a + b, 0),
        wsSendCounts: { ...state.wsSendCounts },
        longTaskCount: longTasks.length,
        longTaskOver50: longTasks.filter((duration) => duration > 50).length,
        longTaskMaxMs: roundBrowserMs(Math.max(0, ...longTasks)),
        longTaskP95Ms: roundBrowserMs(browserPercentile(longTasks, 0.95)),
        frameGapCount: frameGaps.length,
        frameGapP95Ms: roundBrowserMs(browserPercentile(frameGaps, 0.95)),
        frameGapMaxMs: roundBrowserMs(Math.max(0, ...frameGaps)),
        domNodes: document.querySelectorAll('*').length,
        jsHeapUsedMb: browserBytesToMb(memory?.usedJSHeapSize),
        jsHeapTotalMb: browserBytesToMb(memory?.totalJSHeapSize),
        socketCount: sockets.length,
        openSocketCount: sockets.filter((socket) => socket.readyState === nativeWebSocket.OPEN).length,
      }
    }

    Object.assign(window, {
      __emitSyntheticWs: emitSyntheticWs,
      __resetRunningMissionSwitchPerf: reset,
      __startSyntheticMissionLoad: startSyntheticLoad,
      __stopSyntheticMissionLoad: stopSyntheticLoad,
      __getRunningMissionSwitchMetrics: getMetrics,
    })
    } catch (error) {
      Object.assign(window, {
        __runningMissionSwitchHarnessError: error instanceof Error ? error.message : String(error),
      })
    }
  })

  const client = await page.context().newCDPSession(page)
  const rows: MissionSwitchRow[] = []

  const collectRows = async (): Promise<void> => {
    const traces = await page.evaluate(
      () => window.__missionSwitchPerf?.getHistory() ?? [],
    ) as MissionSwitchTraceLike[]
    const ordered = [...traces].reverse()
    const seen = new Set(rows.map((row) => row.id))
    for (const trace of ordered) {
      if (!seen.has(trace.id)) rows.push(traceToRow(trace))
    }
  }

  const ensureArchivedExpanded = async (): Promise<void> => {
    const archivedBtn = page.locator('button[aria-expanded]').filter({ hasText: 'Archived' }).first()
    if (!(await archivedBtn.isVisible().catch(() => false))) return
    if (await archivedBtn.getAttribute('aria-expanded') !== 'true') {
      await archivedBtn.click()
      await page.waitForTimeout(200)
    }
  }

  const clickMission = async (chatId: string): Promise<void> => {
    let row = page.locator(`[data-mission-id="${chatId}"]`).first()
    if (!(await row.isVisible().catch(() => false))) {
      await ensureArchivedExpanded()
      row = page.locator(`[data-mission-id="${chatId}"]`).first()
    }
    await row.scrollIntoViewIfNeeded()
    await row.waitFor({ state: 'visible', timeout: 15_000 })
    await row.click()
    await page.waitForURL(`**/mission/${chatId}**`, { timeout: 15_000 })
  }

  const gotoMission = async (chatId: string): Promise<void> => {
    await page.goto(`${UI}/workspace/${workspaceId}/mission/${chatId}`, { waitUntil: 'domcontentloaded' })
  }

  let metrics: RunningLoadMetrics | null = null
  try {
    await gotoMission(missionIds[0])
    await page.waitForTimeout(args.switchSettleMs)
    if (usesArchived) await ensureArchivedExpanded()

    console.log('[perf] warm-up pass (mount mission cache)')
    for (const chatId of missionIds) {
      await clickMission(chatId)
      await page.waitForTimeout(args.switchSettleMs)
    }

    const harnessStatus = await page.evaluate(() => ({
      hasReset: typeof window.__resetRunningMissionSwitchPerf === 'function',
      hasStart: typeof window.__startSyntheticMissionLoad === 'function',
      hasStop: typeof window.__stopSyntheticMissionLoad === 'function',
      hasMetrics: typeof window.__getRunningMissionSwitchMetrics === 'function',
      error: window.__runningMissionSwitchHarnessError ?? null,
    }))
    if (!harnessStatus.hasReset || !harnessStatus.hasStart || !harnessStatus.hasStop || !harnessStatus.hasMetrics) {
      throw new Error(`running-load harness unavailable: ${JSON.stringify(harnessStatus)}`)
    }

    await page.evaluate(() => {
      window.__missionSwitchPerf?.clear()
      window.__resetRunningMissionSwitchPerf?.()
    })

    console.log('[perf] synthetic load started')
    await page.evaluate((opts) => {
      window.__startSyntheticMissionLoad?.(opts)
    }, {
      missionIds,
      agentIds,
      intervalMs: args.eventIntervalMs,
      structuredEvery: args.structuredEvery,
    })

    for (let round = 0; round < args.rounds; round++) {
      for (const chatId of missionIds) {
        await clickMission(chatId)
        await page.waitForTimeout(args.switchSettleMs)
      }
    }

    await page.waitForTimeout(args.postObserveMs)
    await collectRows()
    metrics = await page.evaluate(() => window.__getRunningMissionSwitchMetrics?.() ?? null) as RunningLoadMetrics | null
    await page.evaluate(() => window.__stopSyntheticMissionLoad?.())

    const domCounters = await client.send('Memory.getDOMCounters').catch(() => null)
    if (metrics && domCounters && typeof domCounters.nodes === 'number') {
      metrics.domNodes = domCounters.nodes
    }
  } finally {
    await page.evaluate(() => window.__stopSyntheticMissionLoad?.()).catch(() => {})
    await browser.close()
  }

  if (!metrics) {
    console.error('[perf] no running-load metrics collected')
    process.exit(1)
  }

  if (rows.length === 0) {
    console.error('[perf] no mission-switch traces - ensure Vite dev mode is running')
    process.exit(1)
  }

  const summary = summarizeMissionSwitchRows(rows)
  const score = scoreMissionSwitch(summary, rows)
  const expectedSwitches = args.rounds * missionIds.length
  const warnings: string[] = []

  if (rows.length < expectedSwitches) {
    warnings.push(`only ${rows.length}/${expectedSwitches} switch traces were finalized`)
  }
  if ((summary.p95TotalMs ?? 0) > 300) {
    warnings.push(`p95 total ${summary.p95TotalMs}ms exceeds running-load target 300ms`)
  }
  const replayed = rows.filter((row) => row.replayMsgs > 0).length
  if (replayed > 0) {
    warnings.push(`${replayed} switch(es) replayed messages during warm running-load switching`)
  }
  if (metrics.longTaskOver50 > 0) {
    warnings.push(`${metrics.longTaskOver50} long task(s) exceeded 50ms; max ${metrics.longTaskMaxMs}ms`)
  }
  if (metrics.frameGapMaxMs > 50) {
    warnings.push(`max frame gap ${metrics.frameGapMaxMs}ms exceeds 50ms responsiveness target`)
  }
  if (metrics.syntheticTotalEvents < 1000) {
    warnings.push(`synthetic load emitted only ${metrics.syntheticTotalEvents} events; increase rounds or lower interval`)
  }

  console.log('\n[perf] early-finalized mission-switch score')
  console.log(formatScoreReport(score))
  console.log('\n[perf] switch summary')
  console.log(JSON.stringify(summary, null, 2))
  console.log('\n[perf] running-load responsiveness')
  console.log(JSON.stringify(metrics, null, 2))
  console.log('\n[perf] per-switch rows')
  console.table(rows.map(({ chatId: _cid, ...row }) => row))

  if (warnings.length > 0) {
    console.warn('\n[perf] running-load warnings')
    for (const warning of warnings) console.warn(`  - ${warning}`)
    if (args.strict) {
      console.error('\n[perf] FAILED running-load thresholds')
      process.exit(1)
    }
  } else {
    console.log('\n[perf] PASSED running-load thresholds')
  }
}

main().catch((err: unknown) => {
  console.error('[perf] failed:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
