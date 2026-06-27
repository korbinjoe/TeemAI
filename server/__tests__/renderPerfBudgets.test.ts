import { describe, expect, it } from 'vitest'
import { compareScenarioToBudget } from '../../scripts/render-perf/budgets'
import type { BaselineFile, BudgetsFile } from '../../scripts/render-perf/types'

const budgets: BudgetsFile = {
  version: 1,
  scenarios: {
    'mission.switch.warm': {
      interactionP95Ms: { max: 500, maxRegressionPct: 10 },
      consoleErrors: { max: 0 },
    },
  },
}

const baseline: BaselineFile = {
  version: 1,
  updatedAt: '2026-06-26T00:00:00.000Z',
  scenarios: {
    'mission.switch.warm': {
      metrics: {
        interactionP95Ms: 300,
        consoleErrors: 0,
      },
    },
  },
}

describe('render perf budget comparison', () => {
  it('passes metrics within hard and baseline budgets', () => {
    const failures = compareScenarioToBudget(
      'mission.switch.warm',
      { interactionP95Ms: 320, consoleErrors: 0 },
      budgets,
      baseline,
    )
    expect(failures).toEqual([])
  })

  it('fails hard max and relative baseline regressions', () => {
    const failures = compareScenarioToBudget(
      'mission.switch.warm',
      { interactionP95Ms: 600, consoleErrors: 1 },
      budgets,
      baseline,
    )
    expect(failures.map((failure) => failure.metric)).toEqual([
      'interactionP95Ms',
      'interactionP95Ms',
      'consoleErrors',
    ])
  })

  it('fails when a budgeted metric is missing', () => {
    const failures = compareScenarioToBudget('mission.switch.warm', { consoleErrors: 0 }, budgets, baseline)
    expect(failures).toHaveLength(1)
    expect(failures[0].metric).toBe('interactionP95Ms')
  })
})
