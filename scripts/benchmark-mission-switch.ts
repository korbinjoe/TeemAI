#!/usr/bin/env tsx
/**
 * Mission switch performance benchmark + scoring.
 *
 * Prerequisites: `npm run dev` on ports 13000/13001, ≥2 missions in first workspace.
 *
 * Usage:
 *   npm run perf:mission-switch
 *   npm run perf:mission-switch -- --rounds 3 --settle-ms 1200
 *   npm run perf:mission-switch:baseline   # refresh scripts/perf-baselines/mission-switch.json
 */

import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  traceToRow,
  summarizeMissionSwitchRows,
  scoreMissionSwitch,
  formatScoreReport,
  compareToBaseline,
  type MissionSwitchBaseline,
  type MissionSwitchTraceLike,
} from '../shared/missionSwitchScore'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASELINE_PATH = join(__dirname, 'perf-baselines/mission-switch.json')

const API = process.env.TEEMAI_API ?? 'http://localhost:13001'
const UI = process.env.TEEMAI_UI ?? 'http://localhost:13000'

interface Args {
  rounds: number
  settleMs: number
  updateBaseline: boolean
  skipBaselineCheck: boolean
  includeCold: boolean
}

const parseArgs = (): Args => {
  const args = process.argv.slice(2)
  let rounds = 2
  let settleMs = 1200
  let updateBaseline = false
  let skipBaselineCheck = false
  let includeCold = false
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--rounds' && args[i + 1]) rounds = Number(args[++i])
    if (args[i] === '--settle-ms' && args[i + 1]) settleMs = Number(args[++i])
    if (args[i] === '--update-baseline') updateBaseline = true
    if (args[i] === '--skip-baseline-check') skipBaselineCheck = true
    if (args[i] === '--include-cold') includeCold = true
  }
  return { rounds, settleMs, updateBaseline, skipBaselineCheck, includeCold }
}

const fetchJson = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} → ${res.status}`)
  return res.json() as Promise<T>
}

const waitForServer = async (retries = 30): Promise<void> => {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${API}/api/agents`)
      if (res.ok) return
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`Server not reachable at ${API} — run npm run dev first`)
}

const loadBaseline = (): MissionSwitchBaseline | null => {
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as MissionSwitchBaseline
  } catch {
    return null
  }
}

const saveBaseline = (report: ReturnType<typeof scoreMissionSwitch>): void => {
  const baseline: MissionSwitchBaseline = {
    version: 1,
    updatedAt: new Date().toISOString(),
    score: report.score,
    grade: report.grade,
    summary: report.summary,
  }
  writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`)
  console.log(`[perf] baseline written → ${BASELINE_PATH}`)
}

const main = async (): Promise<void> => {
  const { rounds, settleMs, updateBaseline, skipBaselineCheck, includeCold } = parseArgs()
  await waitForServer()

  const workspaces = await fetchJson<Array<{ id: string }>>(`${API}/api/workspaces`)
  const chats = await fetchJson<Array<{ id: string; workspaceId: string; archivedAt: string | null }>>(`${API}/api/all-chats`)

  if (!workspaces.length) {
    console.error('[perf] no workspaces — create one in TeemAI first')
    process.exit(1)
  }
  const workspaceId = workspaces[0].id
  const workspaceChats = chats.filter((c) => c.workspaceId === workspaceId)
  const activeChats = workspaceChats.filter((c) => !c.archivedAt)
  const missionPool = activeChats.length >= 2 ? activeChats : workspaceChats
  const missionIds = missionPool.slice(0, 4).map((c) => c.id)
  const usesArchived = missionIds.some(
    (id) => workspaceChats.find((c) => c.id === id)?.archivedAt != null,
  )

  if (missionIds.length < 2) {
    console.error('[perf] need ≥2 missions in the first workspace')
    process.exit(1)
  }

  console.log('[perf] mission-switch benchmark (SPA warm path)')
  console.log('[perf] workspace', workspaceId)
  console.log('[perf] missions', missionIds.map((id) => id.slice(0, 8)).join(', '))
  console.log('[perf] rounds', rounds, 'settleMs', settleMs, 'includeCold', includeCold, 'usesArchived', usesArchived)

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const allRows: ReturnType<typeof traceToRow>[] = []

  const collectLatestTrace = async (): Promise<void> => {
    const traces = await page.evaluate(
      () => window.__missionSwitchPerf?.getHistory() ?? [],
    ) as MissionSwitchTraceLike[]
    if (traces.length === 0) return
    allRows.push(traceToRow(traces[0]))
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

  // Load workspace once — subsequent switches use sidebar clicks (LRU warm path)
  await gotoMission(missionIds[0])
  await page.waitForTimeout(settleMs)
  if (usesArchived) await ensureArchivedExpanded()

  if (includeCold) {
    console.log('[perf] cold round (full page reload per mission)')
    for (const chatId of missionIds) {
      await gotoMission(chatId)
      await page.waitForTimeout(settleMs)
      await collectLatestTrace()
    }
    // Re-seed LRU after cold reloads
    await gotoMission(missionIds[0])
    await page.waitForTimeout(settleMs)
  }

  console.log('[perf] warm-up pass (sidebar clicks, no collect)')
  for (const chatId of missionIds) {
    await clickMission(chatId)
    await page.waitForTimeout(settleMs)
  }

  console.log('[perf] warm rounds (sidebar SPA switches)')
  for (let r = 0; r < rounds; r++) {
    for (const chatId of missionIds) {
      await clickMission(chatId)
      await page.waitForTimeout(settleMs)
      await collectLatestTrace()
    }
  }

  await browser.close()

  if (!allRows.length) {
    console.error('[perf] no traces — ensure dev server (Vite DEV mode) is running')
    process.exit(1)
  }

  const summary = summarizeMissionSwitchRows(allRows)
  const report = scoreMissionSwitch(summary, allRows)

  console.log('\n[perf] summary')
  console.log(JSON.stringify(summary, null, 2))
  console.log('\n[perf] score')
  console.log(formatScoreReport(report))
  console.log('\n[perf] per-switch rows')
  console.table(allRows.map(({ chatId: _cid, ...r }) => r))

  if (updateBaseline) {
    saveBaseline(report)
    return
  }

  const baseline = loadBaseline()
  if (!baseline) {
    console.warn('[perf] no baseline at scripts/perf-baselines/mission-switch.json — run perf:mission-switch:baseline after review')
    process.exit(0)
  }

  if (skipBaselineCheck) {
    console.log('[perf] baseline check skipped')
    return
  }

  const comparison = compareToBaseline(report, baseline)
  console.log('\n[perf] baseline comparison')
  for (const msg of comparison.messages) console.log(`  ${msg}`)

  if (!comparison.passed) {
    console.error('\n[perf] FAILED — score regression vs baseline')
    console.error('[perf] if intentional: npm run perf:mission-switch:baseline')
    process.exit(1)
  }

  console.log('\n[perf] PASSED vs baseline')
}

main().catch((err: unknown) => {
  console.error('[perf] failed:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
