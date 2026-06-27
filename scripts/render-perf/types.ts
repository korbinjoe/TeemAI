import type { Page } from 'playwright'

export type RenderPerfMode = 'dev' | 'preview'
export type ScenarioStatus = 'passed' | 'failed'

export interface RenderPerfArgs {
  scenarios: string[]
  tags: string[]
  changed: boolean
  repeat: number
  mode: RenderPerfMode
  trace: boolean
  updateBaseline: boolean
  dryRun: boolean
  keepArtifacts: boolean
  reuseServer: boolean
}

export interface RenderPerfFixture {
  apiBase: string
  uiBase: string
  repoRoot: string
  runDir: string
  homeDir: string
  workspaceId: string
  missionIds: string[]
}

export interface InteractionMetric {
  name: string
  durationMs: number
}

export interface ScenarioContext {
  page: Page
  fixture: RenderPerfFixture
  scenarioDir: string
  interactions: InteractionMetric[]
  measureInteraction: (name: string, action: () => Promise<void>, ready?: () => Promise<void>) => Promise<void>
  waitForRenderIdle: (ms?: number) => Promise<void>
}

export interface RenderPerfScenario {
  id: string
  label: string
  tags: string[]
  changedFileGlobs: string[]
  budgets: string[]
  repeats?: number
  traceByDefault?: boolean
  run: (ctx: ScenarioContext) => Promise<void>
}

export type MetricMap = Record<string, number | null>

export interface BudgetRule {
  min?: number
  max?: number
  maxRegressionPct?: number
}

export type ScenarioBudget = Record<string, BudgetRule>

export interface BudgetsFile {
  version: 1
  scenarios: Record<string, ScenarioBudget>
}

export interface BaselineScenario {
  metrics: MetricMap
}

export interface BaselineFile {
  version: 1
  updatedAt: string
  scenarios: Record<string, BaselineScenario>
}

export interface RenderPerfFailure {
  scenarioId: string
  metric: string
  message: string
  observed?: number | null
  budget?: BudgetRule
  baseline?: number | null
}

export interface ScenarioArtifacts {
  metrics: string
  screenshot: string
  playwrightTrace: string
  chromeTrace?: string
  console: string
  requests: string
}

export interface ScenarioResult {
  id: string
  label: string
  status: ScenarioStatus
  repeatIndex: number
  metrics: MetricMap
  failures: RenderPerfFailure[]
  artifacts: ScenarioArtifacts
  durationMs: number
}

export interface RunSummary {
  version: 1
  runId: string
  startedAt: string
  mode: RenderPerfMode
  selectedScenarios: string[]
  artifactRoot: string
  fixture: {
    workspaceId: string
    missionIds: string[]
    isolatedHome: string
  }
  results: ScenarioResult[]
  failed: boolean
}
