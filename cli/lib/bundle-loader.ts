/**
 * Bundle Loader — Shell + Bundle
 *
 *  ~/.openteam/current  bundle
 */

import { join } from 'path'
import { homedir } from 'os'
import { existsSync, readlinkSync, readdirSync, lstatSync, readFileSync } from 'fs'
import { createHash } from 'crypto'
import { OPENTEAM_HOME } from '../../shared/openteam-home'
const VERSIONS_DIR = join(OPENTEAM_HOME, 'versions')
const CURRENT_LINK = join(OPENTEAM_HOME, 'current')
const CONFIG_FILE = join(OPENTEAM_HOME, 'config.json')

export interface DeviceConfig {
  deviceId: string
  shellVersion: string
}

export const getDeviceConfig = (): DeviceConfig => {
  if (existsSync(CONFIG_FILE)) {
    try {
      return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'))
    } catch {
    }
  }

  const config: DeviceConfig = {
    deviceId: createHash('sha256')
      .update(`${homedir()}-${Date.now()}-${Math.random()}`)
      .digest('hex')
      .slice(0, 16),
    shellVersion: '1.0.0',
  }

  const { writeFileSync, mkdirSync } = require('fs')
  if (!existsSync(OPENTEAM_HOME)) mkdirSync(OPENTEAM_HOME, { recursive: true })
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8')
  return config
}

// ── Bundle Parse ──

export interface BundlePaths {
  ui: string
  server: string
  version: string
}

/**
 *  bundle
 *  ~/.openteam/current
 */
export const resolveBundle = (): BundlePaths | null => {
  if (existsSync(CURRENT_LINK)) {
    try {
      const target = readlinkSync(CURRENT_LINK)
      const version = target.split('/').pop() ?? 'unknown'
      const uiPath = join(target, 'ui')
      const serverPath = join(target, 'server')

      if (existsSync(serverPath)) {
        return { ui: uiPath, server: serverPath, version }
      }
    } catch {
    }
  }

  const fallback = findLatestLocalVersion()
  if (fallback) return fallback

  return null
}

const findLatestLocalVersion = (): BundlePaths | null => {
  if (!existsSync(VERSIONS_DIR)) return null

  const versions = readdirSync(VERSIONS_DIR)
    .filter((name) => {
      try {
        return lstatSync(join(VERSIONS_DIR, name)).isDirectory()
      } catch {
        return false
      }
    })
    .sort((a, b) => compareVersions(b, a))

  for (const version of versions) {
    const serverPath = join(VERSIONS_DIR, version, 'server')
    if (existsSync(serverPath)) {
      return {
        ui: join(VERSIONS_DIR, version, 'ui'),
        server: serverPath,
        version,
      }
    }
  }

  return null
}

export const healthCheck = async (port: number, retries = 3, intervalMs = 1000): Promise<boolean> => {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`http://localhost:${port}/api/health`)
      if (res.ok) return true
    } catch {
    }
    if (i < retries - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
  }
  return false
}

export interface UpdateCheckResult {
  action: 'update' | 'rollback' | 'none'
  target?: {
    version: string
    manifest: Record<string, unknown>
  }
  force: boolean
  message: string
}

export const checkForUpdates = async (
  serverUrl: string,
  currentVersion: string,
): Promise<UpdateCheckResult | null> => {
  const config = getDeviceConfig()

  try {
    const params = new URLSearchParams({
      deviceId: config.deviceId,
      clientType: 'cli',
      currentVersion,
      shellVersion: config.shellVersion,
      platform: `${process.platform}-${process.arch}`,
    })

    const res = await fetch(`${serverUrl}/api/update/check?${params}`)
    if (!res.ok) return null

    return await res.json() as UpdateCheckResult
  } catch {
    return null
  }
}

const compareVersions = (a: string, b: string): number => {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0
    const nb = pb[i] ?? 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
}
