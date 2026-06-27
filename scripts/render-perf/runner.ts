#!/usr/bin/env tsx
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { chromium } from 'playwright'
import {
  aggregateBaselineMetrics,
  compareScenarioToBudget,
  loadBaseline,
  loadBudgets,
  writeBaseline,
} from './budgets'
import { createFixtureHome, setupRenderPerfFixture } from './fixture'
import { collectBrowserMetrics, detectBlankPage, installPerformanceProbe, startChromeTrace } from './metrics'
import { writeMarkdownReport, writeSummary } from './report'
import { getScenariosById, selectScenarioIds } from './scenarios'
import { startRenderPerfServer } from './server'
import type {
  InteractionMetric,
  MetricMap,
  RenderPerfArgs,
  RenderPerfFailure,
  RunSummary,
  ScenarioArtifacts,
  ScenarioContext,
  ScenarioResult,
} from './types'

const parseArgs = (): RenderPerfArgs => {
  const args = process.argv.slice(2)
  const parsed: RenderPerfArgs = {
    scenarios: [],
    tags: [],
    changed: false,
    repeat: 1,
    mode: 'dev',
    trace: false,
    updateBaseline: false,
    dryRun: false,
    keepArtifacts: false,
    reuseServer: false,
  }
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--scenario' && args[i + 1]) parsed.scenarios.push(args[++i])
    else if (arg.startsWith('--scenario=')) parsed.scenarios.push(arg.slice('--scenario='.length))
    else if (arg === '--tag' && args[i + 1]) parsed.tags.push(args[++i])
    else if (arg.startsWith('--tag=')) parsed.tags.push(arg.slice('--tag='.length))
    else if (arg === '--changed') parsed.changed = true
    else if (arg === '--repeat' && args[i + 1]) parsed.repeat = Math.max(1, Number(args[++i]))
    else if (arg.startsWith('--repeat=')) parsed.repeat = Math.max(1, Number(arg.slice('--repeat='.length)))
    else if (arg === '--mode' && args[i + 1]) parsed.mode = parseMode(args[++i])
    else if (arg.startsWith('--mode=')) parsed.mode = parseMode(arg.slice('--mode='.length))
    else if (arg === '--trace') parsed.trace = true
    else if (arg === '--update-baseline') parsed.updateBaseline = true
    else if (arg === '--dry-run') parsed.dryRun = true
    else if (arg === '--keep-artifacts') parsed.keepArtifacts = true
    else if (arg === '--reuse-server') parsed.reuseServer = true
    else if (arg === '--help' || arg === '-h') printHelpAndExit()
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return parsed
}

const parseMode = (value: string): RenderPerfArgs['mode'] => {
  if (value === 'dev' || value === 'preview') return value
  throw new Error(`Invalid --mode ${value}`)
}

const printHelpAndExit = (): never => {
  console.log(`Render performance harness

Usage:
  npm run perf:render -- [--scenario id] [--tag tag] [--repeat n] [--trace]
  npm run perf:render:changed
  npm run perf:render:baseline

Options:
  --scenario <id>       Run one scenario; repeatable
  --tag <tag>           Run scenarios with tag; repeatable
  --changed             Select scenarios from git changed files
  --repeat <n>          Repeat each scenario
  --mode dev|preview    Execution mode (dev starts isolated server)
  --trace               Keep Chrome trace for all scenarios
  --update-baseline     Refresh render baseline after successful run
  --dry-run             Print selected scenarios and exit
  --keep-artifacts      Keep isolated TEEMAI_HOME after run
  --reuse-server        Reuse TEEMAI_UI/TEEMAI_API instead of starting app
`)
  process.exit(0)
}

const main = async (): Promise<void> => {
  const args = parseArgs()
  const selectedIds = selectScenarioIds({ scenarios: args.scenarios, tags: args.tags, changed: args.changed })
  const selectedScenarios = getScenariosById(selectedIds)

  if (args.dryRun) {
    console.log(JSON.stringify({ selectedScenarios: selectedScenarios.map((s) => s.id) }, null, 2))
    return
  }

  const runId = new Date().toISOString().replace(/[:.]/g, '-')
  const runDir = resolve('.perf', 'render', runId)
  mkdirSync(runDir, { recursive: true })
  const homeDir = createFixtureHome(runDir)

  const server = await startRenderPerfServer({
    mode: args.mode,
    runDir,
    homeDir,
    reuseServer: args.reuseServer,
  })

  const budgets = loadBudgets()
  const baseline = loadBaseline()
  const results: ScenarioResult[] = []
  const startedAt = new Date().toISOString()

  try {
    const fixture = await setupRenderPerfFixture({
      apiBase: server.apiBase,
      uiBase: server.uiBase,
      repoRoot: process.cwd(),
      runDir,
    })

    const browser = await chromium.launch({ headless: true })
    try {
      for (const scenario of selectedScenarios) {
        const repeats = scenario.repeats ?? args.repeat
        for (let repeatIndex = 0; repeatIndex < repeats; repeatIndex++) {
          const result = await runScenario({
            scenario,
            repeatIndex,
            runDir,
            fixture,
            forceChromeTrace: args.trace || !!scenario.traceByDefault,
            budgets,
            baseline,
            browser,
          })
          results.push(result)
          console.log(`[perf:render] ${result.status.toUpperCase()} ${scenario.id} repeat=${repeatIndex + 1} artifacts=${result.artifacts.metrics}`)
        }
      }
    } finally {
      await browser.close()
    }

    const summary: RunSummary = {
      version: 1,
      runId,
      startedAt,
      mode: args.mode,
      selectedScenarios: selectedScenarios.map((s) => s.id),
      artifactRoot: runDir,
      fixture: {
        workspaceId: fixture.workspaceId,
        missionIds: fixture.missionIds,
        isolatedHome: homeDir,
      },
      results,
      failed: results.some((result) => result.status === 'failed'),
    }

    const summaryPath = join(runDir, 'summary.json')
    const reportPath = join(runDir, 'report.md')
    writeSummary(summary, summaryPath)
    writeMarkdownReport(summary, reportPath)

    if (summary.failed) {
      console.error(`[perf:render] FAILED — report: ${reportPath}`)
      process.exitCode = 1
      return
    }

    if (args.updateBaseline) {
      writeBaseline(aggregateBaselineMetrics(results))
      console.log('[perf:render] baseline updated')
    }

    console.log(`[perf:render] PASSED — report: ${reportPath}`)
  } finally {
    await server.stop()
    if (!args.keepArtifacts) {
      rmSync(homeDir, { recursive: true, force: true })
    }
  }
}

interface RunScenarioOptions {
  scenario: ReturnType<typeof getScenariosById>[number]
  repeatIndex: number
  runDir: string
  fixture: Awaited<ReturnType<typeof setupRenderPerfFixture>>
  forceChromeTrace: boolean
  budgets: ReturnType<typeof loadBudgets>
  baseline: ReturnType<typeof loadBaseline>
  browser: Awaited<ReturnType<typeof chromium.launch>>
}

const runScenario = async (options: RunScenarioOptions): Promise<ScenarioResult> => {
  const scenarioDir = join(options.runDir, 'scenarios', `${options.scenario.id}-${options.repeatIndex + 1}`)
  mkdirSync(scenarioDir, { recursive: true })
  const context = await options.browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  await installPerformanceProbe(page)

  const consoleEvents: Array<{ type: string; text: string }> = []
  const pageErrors: string[] = []
  const failedRequests: Array<{ url: string; failure?: string }> = []
  page.on('console', (msg) => {
    if (['error', 'warning'].includes(msg.type())) consoleEvents.push({ type: msg.type(), text: msg.text() })
  })
  page.on('pageerror', (error) => pageErrors.push(error.stack || error.message))
  page.on('requestfailed', (request) => {
    const url = request.url()
    if (url.includes('/sockjs-node') || url.includes('/__vite_ping')) return
    const failure = request.failure()?.errorText
    if (failure?.includes('net::ERR_ABORTED')) return
    failedRequests.push({ url, failure })
  })

  const interactions: InteractionMetric[] = []
  const tracePath = join(scenarioDir, 'playwright-trace.zip')
  const chromeTracePath = join(scenarioDir, 'chrome-trace.json')
  const chromeTrace = await startChromeTrace(page)
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true })

  const started = Date.now()
  let thrown: unknown = null
  try {
    const ctx: ScenarioContext = {
      page,
      fixture: options.fixture,
      scenarioDir,
      interactions,
      measureInteraction: async (name, action, ready) => {
        const t0 = Date.now()
        await action()
        await ready?.()
        interactions.push({ name, durationMs: Date.now() - t0 })
      },
      waitForRenderIdle: async (ms = 250) => {
        await page.waitForTimeout(ms)
      },
    }
    await options.scenario.run(ctx)
  } catch (error) {
    thrown = error
  }

  await context.tracing.stop({ path: tracePath }).catch(() => {})

  const screenshotPath = join(scenarioDir, 'screenshot.png')
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {})

  const extraMetrics = interactionMetrics(interactions)
  extraMetrics.consoleErrors = consoleEvents.filter((event) => event.type === 'error').length
  extraMetrics.consoleWarnings = consoleEvents.filter((event) => event.type === 'warning').length
  extraMetrics.pageErrors = pageErrors.length
  extraMetrics.failedRequests = failedRequests.length

  const metrics = await collectBrowserMetrics(page, extraMetrics).catch(() => extraMetrics)
  const failures: RenderPerfFailure[] = []
  if (thrown) {
    failures.push({
      scenarioId: options.scenario.id,
      metric: 'scenario',
      message: thrown instanceof Error ? thrown.message : String(thrown),
    })
  }
  if (await detectBlankPage(page).catch(() => false)) {
    failures.push({ scenarioId: options.scenario.id, metric: 'blankPage', message: 'page appeared blank' })
  }
  failures.push(...compareScenarioToBudget(options.scenario.id, metrics, options.budgets, options.baseline))

  const keepChromeTrace = options.forceChromeTrace || failures.length > 0
  if (chromeTrace) {
    await chromeTrace.stop(keepChromeTrace ? chromeTracePath : undefined).catch((error) => {
      writeFileSync(join(scenarioDir, 'chrome-trace-error.txt'), String(error instanceof Error ? error.message : error))
    })
  }

  const artifacts: ScenarioArtifacts = {
    metrics: join(scenarioDir, 'metrics.json'),
    screenshot: screenshotPath,
    playwrightTrace: tracePath,
    chromeTrace: keepChromeTrace ? chromeTracePath : undefined,
    console: join(scenarioDir, 'console.json'),
    requests: join(scenarioDir, 'requests.json'),
  }

  writeFileSync(artifacts.metrics, `${JSON.stringify({ metrics, interactions, failures }, null, 2)}\n`)
  writeFileSync(artifacts.console, `${JSON.stringify({ console: consoleEvents, pageErrors }, null, 2)}\n`)
  writeFileSync(artifacts.requests, `${JSON.stringify({ failedRequests }, null, 2)}\n`)

  await context.close().catch(() => {})

  return {
    id: options.scenario.id,
    label: options.scenario.label,
    repeatIndex: options.repeatIndex,
    status: failures.length > 0 ? 'failed' : 'passed',
    metrics,
    failures,
    artifacts,
    durationMs: Date.now() - started,
  }
}

const interactionMetrics = (interactions: InteractionMetric[]): MetricMap => {
  const metrics: MetricMap = { interactionCount: interactions.length }
  if (interactions.length === 0) return metrics
  const durations = interactions.map((interaction) => interaction.durationMs).sort((a, b) => a - b)
  metrics.interactionAvgMs = round(durations.reduce((sum, v) => sum + v, 0) / durations.length)
  metrics.interactionP95Ms = round(durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))] ?? 0)
  metrics.interactionMaxMs = round(Math.max(...durations))
  for (const interaction of interactions) {
    metrics[`interaction.${safeMetricName(interaction.name)}.ms`] = round(interaction.durationMs)
  }
  return metrics
}

const safeMetricName = (name: string): string => name.replace(/[^a-zA-Z0-9_.-]/g, '-')
const round = (value: number): number => Math.round(value * 10) / 10

main().catch((error: unknown) => {
  console.error('[perf:render] failed:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
