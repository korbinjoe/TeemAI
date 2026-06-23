import type { MissionAgentEntry } from './MissionAgentSessionStore'

/**
 * Codex `exec` is a one-turn process: after one prompt reaches turn end, the
 * process may still be alive for a short cleanup window, but stdin has already
 * been consumed. Treat that window as non-reusable and start the next turn via
 * `codex exec resume`.
 */
export const isCodexOneShotPromptSpent = (entry: MissionAgentEntry | undefined): boolean => {
  if (!entry || entry.provider !== 'codex') return false
  const inspect = typeof entry.acpClient.getInspectState === 'function'
    ? entry.acpClient.getInspectState()
    : null
  if (!inspect || inspect.promptInFlight) return false
  return typeof inspect.lastPromptDurationMs === 'number'
}

export const codexResumeSessionId = (entry: MissionAgentEntry): string | undefined =>
  entry.cliSessionId || entry.acpClient.getCliSessionId() || undefined
