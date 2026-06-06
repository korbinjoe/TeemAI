/**
 * loadServerEnv — apply env vars from config files to process.env before the
 * rest of the server boots.
 *
 * Sources (in order — first writer wins per key):
 *   1. Shell-exported variables already in process.env
 *   2. ~/.teemai/teemai.json  → "env" block
 *   3. ~/.claude/settings.json → "env" block (LLM credentials fallback)
 *
 * A key already present in process.env is never overwritten.
 *
 * Runs as an import-time side effect so it executes before any subsequent
 * module reads env. Re-exports applyServerEnv for tests.
 *
 * Failure modes (missing file, bad JSON, wrong type) are silent — config-driven
 * env is optional and must not block startup.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { TEEMAI_HOME } from './paths'

const USER_CONFIG_PATH = join(TEEMAI_HOME, 'teemai.json')
const CLAUDE_SETTINGS_PATH = join(homedir(), '.claude', 'settings.json')

const applyEnvFromFile = (configPath: string): string[] => {
  let raw: string
  try {
    raw = readFileSync(configPath, 'utf-8')
  } catch {
    return []
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }

  const envBlock = (parsed as { env?: unknown }).env
  if (!envBlock || typeof envBlock !== 'object' || Array.isArray(envBlock)) return []

  const applied: string[] = []
  for (const [key, value] of Object.entries(envBlock as Record<string, unknown>)) {
    if (typeof value !== 'string') continue
    if (key in process.env) continue
    process.env[key] = value
    applied.push(key)
  }
  return applied
}

export const applyServerEnv = (
  configPath: string = USER_CONFIG_PATH,
  claudeSettingsPath: string = CLAUDE_SETTINGS_PATH,
): string[] => {
  const applied = applyEnvFromFile(configPath)
  const claudeApplied = applyEnvFromFile(claudeSettingsPath)
  return [...applied, ...claudeApplied]
}

applyServerEnv()
