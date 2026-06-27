import { existsSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import type {
  BaselineFile,
  BudgetRule,
  BudgetsFile,
  MetricMap,
  RenderPerfFailure,
  ScenarioResult,
} from './types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')
export const BUDGETS_PATH = join(ROOT, 'scripts/perf-baselines/render/budgets.json')
export const BASELINE_PATH = join(ROOT, 'scripts/perf-baselines/render/baseline.json')

export const loadBudgets = (path = BUDGETS_PATH): BudgetsFile => {
  return JSON.parse(readFileSync(path, 'utf8')) as BudgetsFile
}

export const loadBaseline = (path = BASELINE_PATH): BaselineFile | null => {
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf8')) as BaselineFile
}

const metricMissingFailure = (scenarioId: string, metric: string, budget: BudgetRule): RenderPerfFailure => ({
  scenarioId,
  metric,
  budget,
  message: `missing required metric ${metric}`,
})

export const compareScenarioToBudget = (
  scenarioId: string,
  metrics: MetricMap,
  budgets: BudgetsFile,
  baseline: BaselineFile | null,
): RenderPerfFailure[] => {
  const rules = budgets.scenarios[scenarioId] ?? {}
  const baseMetrics = baseline?.scenarios[scenarioId]?.metrics
  const failures: RenderPerfFailure[] = []

  for (const [metric, rule] of Object.entries(rules)) {
    const observed = metrics[metric]
    if (observed == null || Number.isNaN(observed)) {
      failures.push(metricMissingFailure(scenarioId, metric, rule))
      continue
    }

    if (rule.max != null && observed > rule.max) {
      failures.push({
        scenarioId,
        metric,
        observed,
        budget: rule,
        message: `${metric} ${observed.toFixed(1)} exceeded max ${rule.max}`,
      })
    }

    if (rule.min != null && observed < rule.min) {
      failures.push({
        scenarioId,
        metric,
        observed,
        budget: rule,
        message: `${metric} ${observed.toFixed(1)} below min ${rule.min}`,
      })
    }

    const baselineValue = baseMetrics?.[metric]
    if (
      rule.maxRegressionPct != null &&
      baselineValue != null &&
      baselineValue > 0 &&
      observed > baselineValue * (1 + rule.maxRegressionPct / 100)
    ) {
      failures.push({
        scenarioId,
        metric,
        observed,
        budget: rule,
        baseline: baselineValue,
        message: `${metric} regressed ${pct(observed, baselineValue)} vs baseline ${baselineValue.toFixed(1)}`,
      })
    }
  }

  return failures
}

const pct = (observed: number, baseline: number): string => {
  const delta = ((observed - baseline) / baseline) * 100
  return `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`
}

const median = (values: number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? null
}

export const aggregateBaselineMetrics = (results: ScenarioResult[]): BaselineFile => {
  const grouped = new Map<string, ScenarioResult[]>()
  for (const result of results) {
    if (!grouped.has(result.id)) grouped.set(result.id, [])
    grouped.get(result.id)!.push(result)
  }

  const scenarios: BaselineFile['scenarios'] = {}
  for (const [scenarioId, scenarioResults] of grouped) {
    const metricKeys = new Set<string>()
    scenarioResults.forEach((r) => Object.keys(r.metrics).forEach((k) => metricKeys.add(k)))
    const metrics: MetricMap = {}
    for (const key of metricKeys) {
      const values = scenarioResults
        .map((r) => r.metrics[key])
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
      metrics[key] = median(values)
    }
    scenarios[scenarioId] = { metrics }
  }

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    scenarios,
  }
}

export const writeBaseline = (baseline: BaselineFile, path = BASELINE_PATH): void => {
  writeFileSync(path, `${JSON.stringify(baseline, null, 2)}\n`)
}
