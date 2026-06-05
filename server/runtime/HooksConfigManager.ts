/**
 * HooksConfigManager
 *  hooks  + permissions
 */

import { writeFile, mkdir, unlink } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { TMP_HOOKS_DIR, TEEMAI_HOME } from '../config/paths'
import type { HooksConfig } from '../config/types'

export class HooksConfigManager {
  private configDir = TMP_HOOKS_DIR

  /**
   *  settings.json permissions +  hooks +  hooks + env
   * @param sessionKey
   * @param userHooks      hooks Agent.hooks
   * @param additionalAllowPaths
   * @param systemHooks    hooks userHooks  hook
   * @param envOverrides   settings.env  claude CLI
   *   `--settings > user settings.json` teemai UI  model/
   *    ~/.claude/settings.json  env.*
   */
  async writeConfig(
    sessionKey: string,
    userHooks?: HooksConfig,
    additionalAllowPaths?: string[],
    systemHooks?: HooksConfig,
    envOverrides?: Record<string, string>,
  ): Promise<string> {
    await mkdir(this.configDir, { recursive: true })

    const mergedHooks: HooksConfig = {}
    const mergeEntries = (
      key: 'PreToolUse' | 'PostToolUse' | 'Notification' | 'Stop',
    ) => {
      const sys = systemHooks?.[key] ?? []
      const usr = userHooks?.[key] ?? []
      const combined = [...sys, ...usr]
      if (combined.length) mergedHooks[key] = combined
    }
    mergeEntries('PreToolUse')
    mergeEntries('PostToolUse')
    mergeEntries('Notification')
    mergeEntries('Stop')

    const allowPatterns: string[] = [
      TEEMAI_HOME + '/**',
      ...(additionalAllowPaths ?? []),
    ]

    const filteredEnv = envOverrides
      ? Object.fromEntries(Object.entries(envOverrides).filter(([, v]) => v !== ''))
      : undefined

    const settings: Record<string, unknown> = {
      permissions: { allow: allowPatterns, deny: [] },
      ...(Object.keys(mergedHooks).length > 0 ? { hooks: mergedHooks } : {}),
      ...(filteredEnv && Object.keys(filteredEnv).length > 0 ? { env: filteredEnv } : {}),
    }

    const configPath = join(this.configDir, `${sessionKey}.json`)
    await writeFile(configPath, JSON.stringify(settings, null, 2), 'utf-8')
    return configPath
  }

  async removeConfig(sessionKey: string): Promise<void> {
    const configPath = join(this.configDir, `${sessionKey}.json`)
    if (existsSync(configPath)) {
      await unlink(configPath)
    }
  }

  async cleanup(sessionKey: string): Promise<void> {
    return this.removeConfig(sessionKey)
  }
}
