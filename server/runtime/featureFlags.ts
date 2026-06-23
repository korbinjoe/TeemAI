/**
 * Runtime feature flags —
 * flag  SCREAMING_SNAKE_CASE 0 / false / off / no
 *       ON staging
 */

export const FLAG_WHITEBOARD_ON_DEMAND_CONTEXT = 'WHITEBOARD_ON_DEMAND_CONTEXT'

export const FLAG_CODEX_APP_SERVER = 'CODEX_APP_SERVER'

const FALSE_VALUES = new Set(['0', 'false', 'off', 'no'])

const readFlag = (name: string, defaultEnabled: boolean): boolean => {
  const raw = process.env[name]
  if (raw === undefined) return defaultEnabled
  return !FALSE_VALUES.has(raw.trim().toLowerCase())
}

/**
 * SessionStart  + PostToolUse diff + agent
 *  ON WHITEBOARD_ON_DEMAND_CONTEXT=0  maybeWrapTask
 */
export const isWhiteboardOnDemandEnabled = (): boolean =>
  readFlag(FLAG_WHITEBOARD_ON_DEMAND_CONTEXT, true)

/**
 * Drive codex via the long-lived `app-server --stdio` (token-level streaming)
 * instead of one-shot `exec --json` (no text streaming). ON by default;
 * set CODEX_APP_SERVER=0 to fall back to exec.
 */
export const isCodexAppServerEnabled = (): boolean =>
  readFlag(FLAG_CODEX_APP_SERVER, true)
