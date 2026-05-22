import { createLogger } from '../lib/logger'
import { CliAutoInstaller, type CliAutoInstallResult } from '../services/CliAutoInstaller'
import { PreflightChecker, type PreflightResult } from '../services/PreflightChecker'

const log = createLogger('AsyncBoot')

export interface AsyncBootResult {
  envCheckResult: CliAutoInstallResult | null
  preflightResult: PreflightResult | null
}

export const runAsyncBoot = (broadcast: (msg: Record<string, unknown>) => void): AsyncBootResult => {
  const result: AsyncBootResult = { envCheckResult: null, preflightResult: null }

  new CliAutoInstaller().run().then((envResult) => {
    result.envCheckResult = envResult
    if (!envResult.npmAvailable || envResult.cliInstallFailures.length > 0) {
      broadcast({ type: 'system:env-check', payload: envResult })
      if (envResult.cliInstallFailures.length > 0) {
        log.warn('CLI auto-install partial failure', {
          failures: envResult.cliInstallFailures.map(f => f.command).join(','),
          count: envResult.cliInstallFailures.length,
        })
      }
    }
    return new PreflightChecker(envResult.cliInstallFailures).run()
  }).then((pfResult) => {
    result.preflightResult = pfResult
    broadcast({ type: 'system:preflight', payload: pfResult })
  }).catch((err) => {
    log.warn('CLI auto-install or preflight failed', { error: err instanceof Error ? err.message : String(err) })
  })

  return result
}
