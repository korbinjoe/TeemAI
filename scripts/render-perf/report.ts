import { writeFileSync } from 'fs'
import type { RunSummary, ScenarioResult } from './types'

export const writeSummary = (summary: RunSummary, path: string): void => {
  writeFileSync(path, `${JSON.stringify(summary, null, 2)}\n`)
}

export const writeMarkdownReport = (summary: RunSummary, path: string): void => {
  const failed = summary.results.filter((result) => result.status === 'failed')
  const lines: string[] = []
  lines.push(`# Render Performance Report`)
  lines.push('')
  lines.push(summary.failed ? `Status: FAILED` : `Status: PASSED`)
  lines.push(`Run: ${summary.runId}`)
  lines.push(`Mode: ${summary.mode}`)
  lines.push(`Artifacts: ${summary.artifactRoot}`)
  lines.push('')

  if (failed.length > 0) {
    lines.push(`## Top Failures`)
    for (const result of failed.slice(0, 8)) {
      lines.push(`- ${result.id}: ${result.failures[0]?.message ?? 'failed'}`)
      lines.push(`  Evidence: ${result.artifacts.metrics}`)
    }
    lines.push('')
  }

  lines.push(`## Scenario Results`)
  lines.push('')
  lines.push(`| Scenario | Status | Key Metrics |`)
  lines.push(`|---|---:|---|`)
  for (const result of summary.results) {
    lines.push(`| ${result.id} | ${result.status} | ${formatKeyMetrics(result)} |`)
  }
  lines.push('')

  if (failed.length > 0) {
    const first = failed[0]
    lines.push(`## Next Diagnostic Command`)
    lines.push('')
    lines.push('```bash')
    lines.push(`npm run perf:render -- --scenario ${first.id} --trace --keep-artifacts`)
    lines.push('```')
    lines.push('')
  }

  writeFileSync(path, `${lines.join('\n')}\n`)
}

const formatKeyMetrics = (result: ScenarioResult): string => {
  const keys = [
    'interactionP95Ms',
    'navDomContentLoadedMs',
    'firstContentfulPaintMs',
    'longTaskCount',
    'longTaskTotalMs',
    'documentElementCount',
    'domNodes',
    'jsHeapUsedMb',
    'consoleErrors',
    'pageErrors',
    'failedRequests',
  ]
  return keys
    .filter((key) => result.metrics[key] != null)
    .map((key) => `${key}=${result.metrics[key]}`)
    .join('<br>')
}
