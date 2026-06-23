import type { MissionAgentEntry } from './MissionAgentSessionStore'
import { isCodexAppServerEnabled } from '../runtime/featureFlags'

/**
 * Codex `exec` is a one-turn process: after one prompt reaches turn end, the
 * process may still be alive for a short cleanup window, but stdin has already
 * been consumed. Treat that window as non-reusable and start the next turn via
 * `codex exec resume`.
 *
 * The `app-server` driver is a long-lived process that accepts multiple turns
 * over stdin, so this one-shot constraint does not apply there.
 */
export const isCodexOneShotPromptSpent = (entry: MissionAgentEntry | undefined): boolean => {
  if (!entry || entry.provider !== 'codex') return false
  if (isCodexAppServerEnabled()) return false
  const inspect = typeof entry.acpClient.getInspectState === 'function'
    ? entry.acpClient.getInspectState()
    : null
  if (!inspect || inspect.promptInFlight) return false
  return typeof inspect.lastPromptDurationMs === 'number'
}

export const codexResumeSessionId = (entry: MissionAgentEntry): string | undefined =>
  entry.cliSessionId || entry.acpClient.getCliSessionId() || undefined
