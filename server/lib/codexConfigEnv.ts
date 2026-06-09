/**
 * codexConfigEnv — resolve Codex model-provider credential env vars.
 *
 * Reads ~/.codex/config.toml for the active model_provider's env_key,
 * then resolves values from (in order):
 *   1. process.env
 *   2. ~/.teemai/teemai.json → "env"
 *   3. ~/.claude/settings.json → "env"
 *   4. login shell env (same recovery path as resolveCliCommand)
 */

import { readFileSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'
import TOML from '@iarna/toml'
import { TEEMAI_HOME } from '../config/paths'
import { getLoginShellEnvSubsetAsync } from './resolveCliCommand'
import { createLogger } from './logger'

const log = createLogger('codexConfigEnv')

const CODEX_CONFIG_PATH = join(homedir(), '.codex', 'config.toml')
const TEEMAI_CONFIG_PATH = join(TEEMAI_HOME, 'teemai.json')
const CLAUDE_SETTINGS_PATH = join(homedir(), '.claude', 'settings.json')

const ENV_KEY_RE = /^[A-Z_][A-Z0-9_]*$/

type CodexConfig = {
  model_provider?: string
  model_providers?: Record<string, { env_key?: string }>
  projects?: Record<string, { model_provider?: string }>
}

export interface EnvKeyResolveOptions {
  teemaiConfigPath?: string
  claudeSettingsPath?: string
}

const readJsonEnvBlock = (configPath: string): Record<string, string> => {
  try {
    const parsed = JSON.parse(readFileSync(configPath, 'utf-8')) as { env?: unknown }
    const envBlock = parsed.env
    if (!envBlock || typeof envBlock !== 'object' || Array.isArray(envBlock)) return {}
    const out: Record<string, string> = {}
    for (const [key, value] of Object.entries(envBlock as Record<string, unknown>)) {
      if (typeof value === 'string' && value.length > 0) {
        out[key] = value
      }
    }
    return out
  } catch {
    return {}
  }
}

export const readCodexConfig = (configPath: string = CODEX_CONFIG_PATH): CodexConfig | null => {
  try {
    const raw = readFileSync(configPath, 'utf-8')
    return TOML.parse(raw) as CodexConfig
  } catch {
    return null
  }
}

export const resolveCodexModelProvider = (config: CodexConfig, cwd?: string): string | null => {
  if (cwd && config.projects) {
    const absCwd = resolve(cwd)
    const project = config.projects[absCwd]
    if (project?.model_provider) return project.model_provider
  }
  return config.model_provider ?? null
}

export const extractCodexEnvKeys = (config: CodexConfig, cwd?: string): string[] => {
  const provider = resolveCodexModelProvider(config, cwd)
  if (!provider) return []

  const providerConfig = config.model_providers?.[provider]
  const envKey = providerConfig?.env_key
  if (!envKey || !ENV_KEY_RE.test(envKey)) return []

  return [envKey]
}

const resolveFromStaticSources = (
  keys: string[],
  options: EnvKeyResolveOptions = {},
): Record<string, string> => {
  const teemaiEnv = readJsonEnvBlock(options.teemaiConfigPath ?? TEEMAI_CONFIG_PATH)
  const claudeEnv = readJsonEnvBlock(options.claudeSettingsPath ?? CLAUDE_SETTINGS_PATH)
  const out: Record<string, string> = {}

  for (const key of keys) {
    const fromProcess = process.env[key]
    if (typeof fromProcess === 'string' && fromProcess.length > 0) {
      out[key] = fromProcess
      continue
    }
    const fromTeemai = teemaiEnv[key]
    if (fromTeemai) {
      out[key] = fromTeemai
      continue
    }
    const fromClaude = claudeEnv[key]
    if (fromClaude) {
      out[key] = fromClaude
    }
  }

  return out
}

export const resolveEnvKeyValues = async (
  keys: string[],
  options: EnvKeyResolveOptions = {},
): Promise<Record<string, string>> => {
  if (keys.length === 0) return {}

  const resolved = resolveFromStaticSources(keys, options)
  const missing = keys.filter((key) => !resolved[key])
  if (missing.length === 0) return resolved

  const fromShell = await getLoginShellEnvSubsetAsync(missing)
  for (const key of missing) {
    const val = fromShell[key]
    if (val) resolved[key] = val
  }

  return resolved
}

export const resolveCodexProviderEnv = async (
  cwd?: string,
  configPath: string = CODEX_CONFIG_PATH,
): Promise<Record<string, string>> => {
  const config = readCodexConfig(configPath)
  if (!config) return {}

  const keys = extractCodexEnvKeys(config, cwd)
  if (keys.length === 0) return {}

  const resolved = await resolveEnvKeyValues(keys)
  const missing = keys.filter((key) => !resolved[key])
  if (missing.length > 0) {
    log.warn('Codex provider env keys unresolved', { keys: missing, provider: resolveCodexModelProvider(config, cwd) })
  } else {
    log.info('Resolved Codex provider env keys', { keys: Object.keys(resolved) })
  }

  return resolved
}
