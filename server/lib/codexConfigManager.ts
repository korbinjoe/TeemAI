/**
 * CodexConfigManager - Codex config.toml
 *
 * Codex config.toml  backup/restore
 * - backupCodexConfig() model_provider teemai-proxy provider
 * - restoreCodexConfig() teemai-proxy
 *
 * -  Codex session  session  restore
 * -  Promise
 */

import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { homedir } from 'os'
import TOML from '@iarna/toml'
import { createLogger } from './logger'

const log = createLogger('CodexConfigManager')

const CODEX_CONFIG_FILE = join(homedir(), '.codex', 'config.toml')
const TEEMAI_PROVIDER_NAME = 'teemai-proxy'
const TEEMAI_PROXY_BASE_URL = ''
const BACKUP_KEY = '_teemai_backup_model_provider'

const TEEMAI_PROVIDER_CONFIG = {
  name: 'TeemAI Proxy',
  base_url: TEEMAI_PROXY_BASE_URL,
  env_key: 'TEEMAI_PROXY_API_KEY',
  responses: 'chat',
  stream_max_retries: 8,
  stream_idle_timeout_ms: 30000,
}

type TomlConfig = Record<string, any>

let activeSessionCount = 0

let configMutex: Promise<void> = Promise.resolve()

const withMutex = async <T>(fn: () => Promise<T>): Promise<T> => {
  let release: () => void
  const prev = configMutex
  configMutex = new Promise((resolve) => { release = resolve })
  await prev
  try {
    return await fn()
  } finally {
    release!()
  }
}

const readConfig = async (): Promise<TomlConfig | null> => {
  if (!existsSync(CODEX_CONFIG_FILE)) return null
  try {
    const raw = await readFile(CODEX_CONFIG_FILE, 'utf-8')
    return TOML.parse(raw) as TomlConfig
  } catch (err) {
    log.error('Failed to read config.toml', { error: err instanceof Error ? err.message : String(err) })
    return null
  }
}

const ENV_KEY_PATTERN = /^[A-Z_][A-Z0-9_]*$/

export const extractEnvVarNamesFromCodexConfig = (config: TomlConfig): string[] => {
  const names = new Set<string>()

  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (typeof value === 'string') {
        const looksLikeEnvValue = ENV_KEY_PATTERN.test(value)
        const keyHintsEnv = /env/i.test(key) || /key/i.test(key)
        if (looksLikeEnvValue && keyHintsEnv) {
          names.add(value)
        }
        continue
      }
      if (Array.isArray(value)) {
        for (const item of value) walk(item)
        continue
      }
      if (value && typeof value === 'object') {
        walk(value)
      }
    }
  }

  walk(config)
  return [...names]
}

export const getCodexRequiredEnvVarNames = async (): Promise<string[]> => {
  const config = await readConfig()
  if (!config) return []
  return extractEnvVarNamesFromCodexConfig(config)
}

const writeConfig = async (config: TomlConfig): Promise<void> => {
  const dir = dirname(CODEX_CONFIG_FILE)
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
  await writeFile(CODEX_CONFIG_FILE, TOML.stringify(config as any))
}

/**
 *  model_provider teemai-proxy provider
 *
 * - count 0→1 backup + inject
 * - count 1→N
 */
export const backupCodexConfig = async (): Promise<void> => {
  return withMutex(async () => {
    activeSessionCount++
    log.info('Codex config backup requested', { activeSessionCount })

    if (activeSessionCount > 1) {
      log.debug('Config already injected, skipping write', { activeSessionCount })
      return
    }

    try {
      const config = await readConfig()
      if (!config) return

      if (config[BACKUP_KEY]) {
        log.debug('Codex config already has TeemAI injection from previous session, skipping')
        return
      }

      const originalProvider = config.model_provider
      if (originalProvider && originalProvider !== TEEMAI_PROVIDER_NAME) {
        config[BACKUP_KEY] = originalProvider
      }

      // Switch model_provider
      config.model_provider = TEEMAI_PROVIDER_NAME

      if (!config.model_providers) {
        config.model_providers = {}
      }
      config.model_providers[TEEMAI_PROVIDER_NAME] = { ...TEEMAI_PROVIDER_CONFIG }

      await writeConfig(config)
      log.info('Injected teemai-proxy into config.toml', { originalProvider })
    } catch (err) {
      log.error('Failed to backup Codex config', { error: err instanceof Error ? err.message : String(err) })
    }
  })
}

/**
 *  model_provider teemai-proxy
 *
 * -  sessioncount N→N-1, N>1
 * -  sessioncount 1→0 restore
 */
export const restoreCodexConfig = async (): Promise<void> => {
  return withMutex(async () => {
    activeSessionCount = Math.max(0, activeSessionCount - 1)
    log.info('Codex config restore requested', { activeSessionCount })

    if (activeSessionCount > 0) {
      log.debug('Other Codex sessions still active, skipping restore', { activeSessionCount })
      return
    }

    try {
      const config = await readConfig()
      if (!config) return

      let changed = false

      if (config[BACKUP_KEY]) {
        config.model_provider = config[BACKUP_KEY]
        delete config[BACKUP_KEY]
        changed = true
      } else if (config.model_provider === TEEMAI_PROVIDER_NAME) {
        delete config.model_provider
        changed = true
      }

      if (config.model_providers?.[TEEMAI_PROVIDER_NAME]) {
        delete config.model_providers[TEEMAI_PROVIDER_NAME]
        if (Object.keys(config.model_providers).length === 0) {
          delete config.model_providers
        }
        changed = true
      }

      if (changed) {
        await writeConfig(config)
        log.info('Restored Codex config.toml')
      }
    } catch (err) {
      log.error('Failed to restore Codex config', { error: err instanceof Error ? err.message : String(err) })
    }
  })
}

export const getActiveSessionCount = (): number => activeSessionCount
