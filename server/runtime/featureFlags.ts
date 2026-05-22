/**
 * Runtime feature flags —
 * flag  SCREAMING_SNAKE_CASE 0 / false / off / no
 *       ON staging
 */

export const FLAG_WHITEBOARD_ON_DEMAND_CONTEXT = 'WHITEBOARD_ON_DEMAND_CONTEXT'

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
