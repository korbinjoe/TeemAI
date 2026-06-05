/**
 * UpdateManager —
 *
 *  ~/.teemai/versions/ manifest
 */

import { join } from 'path'
import {
  existsSync, mkdirSync, readFileSync, writeFileSync,
  readdirSync, rmSync, symlinkSync, unlinkSync, lstatSync, readlinkSync,
} from 'fs'
import { createHash } from 'crypto'
import { createLogger } from '../../lib/logger'
import { TEEMAI_HOME } from '../../config/paths'

const log = createLogger('UpdateManager')

export interface BundleInfo {
  url: string
  sha256: string
  size: number
}

export interface VersionManifest {
  version: string
  minShellVersion: string
  releaseDate: string
  bundles: {
    ui: BundleInfo
    server: BundleInfo
  }
  changelog: string
  rollbackTo?: string
}

export interface ReleaseRecord {
  version: string
  manifest: VersionManifest
  strategy: ReleaseStrategy
  createdAt: string
  active: boolean
}

export interface ReleaseStrategy {
  type: 'canary' | 'gradual' | 'full' | 'pinned'
  rolloutPercent: number
  targetGroup: string[]
  autoRollback: {
    enabled: boolean
    errorThreshold: number
    windowMinutes: number
  }
}

export interface DeviceInfo {
  deviceId: string
  clientType: 'cli' | 'electron'
  currentVersion: string
  shellVersion: string
  platform: string
  lastSeen: string
}

export interface UpdateCheckResult {
  action: 'update' | 'rollback' | 'none'
  target?: {
    version: string
    manifest: VersionManifest
  }
  force: boolean
  message: string
}

const VERSIONS_DIR = join(TEEMAI_HOME, 'versions')
const CURRENT_LINK = join(TEEMAI_HOME, 'current')
const DOWNLOADS_DIR = join(TEEMAI_HOME, 'downloads')
const UPDATE_STATE_FILE = join(TEEMAI_HOME, 'update-state.json')

interface ErrorRecord {
  deviceId: string
  version: string
  errorType: string
  message: string
  timestamp: string
}

interface UpdateState {
  releases: ReleaseRecord[]
  devices: Record<string, DeviceInfo>
  errors: ErrorRecord[]
}

export class UpdateManager {
  private state: UpdateState = { releases: [], devices: {}, errors: [] }

  constructor() {
    this.ensureDirs()
    this.loadState()
  }

  private ensureDirs() {
    for (const dir of [TEEMAI_HOME, VERSIONS_DIR, DOWNLOADS_DIR]) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
    }
  }

  private loadState() {
    if (existsSync(UPDATE_STATE_FILE)) {
      try {
        this.state = JSON.parse(readFileSync(UPDATE_STATE_FILE, 'utf-8'))
      } catch (err) {
        log.warn('Failed to load update state, reinitializing', {
          error: err instanceof Error ? err.message : String(err),
        })
        this.state = { releases: [], devices: {}, errors: [] }
      }
    }
  }

  private saveState() {
    writeFileSync(UPDATE_STATE_FILE, JSON.stringify(this.state, null, 2), 'utf-8')
  }

  registerRelease(manifest: VersionManifest, strategy: ReleaseStrategy): ReleaseRecord {
    this.state.releases = this.state.releases.map((r) =>
      r.version === manifest.version ? { ...r, active: false } : r,
    )

    const record: ReleaseRecord = {
      version: manifest.version,
      manifest,
      strategy,
      createdAt: new Date().toISOString(),
      active: true,
    }

    this.state.releases.push(record)
    this.saveState()
    log.info('Release registered', { version: manifest.version, strategy: strategy.type })
    return record
  }

  triggerRollback(targetVersion: string): ReleaseRecord | null {
    const targetRelease = this.state.releases.find(
      (r) => r.version === targetVersion,
    )
    if (!targetRelease) {
      log.error('Rollback target version not found', { targetVersion })
      return null
    }

    this.state.releases = this.state.releases.map((r) => ({ ...r, active: false }))

    const rollbackRecord: ReleaseRecord = {
      ...targetRelease,
      strategy: {
        type: 'full',
        rolloutPercent: 100,
        targetGroup: [],
        autoRollback: { enabled: false, errorThreshold: 0, windowMinutes: 0 },
      },
      active: true,
      createdAt: new Date().toISOString(),
    }

    this.state.releases.push(rollbackRecord)
    this.saveState()
    log.info('Rollback triggered', { targetVersion })
    return rollbackRecord
  }

  updateStrategy(version: string, strategy: Partial<ReleaseStrategy>): ReleaseRecord | null {
    const release = this.state.releases.find(
      (r) => r.version === version && r.active,
    )
    if (!release) return null

    Object.assign(release.strategy, strategy)
    this.saveState()
    log.info('Strategy updated', { version, strategy })
    return release
  }

  getActiveRelease(): ReleaseRecord | null {
    return this.state.releases.find((r) => r.active) ?? null
  }

  listReleases(): ReleaseRecord[] {
    return [...this.state.releases]
  }

  registerDevice(info: DeviceInfo) {
    this.state.devices[info.deviceId] = { ...info, lastSeen: new Date().toISOString() }
    this.saveState()
  }

  listDevices(): DeviceInfo[] {
    return Object.values(this.state.devices)
  }

  getDeviceDistribution(): Record<string, number> {
    const dist: Record<string, number> = {}
    for (const device of Object.values(this.state.devices)) {
      dist[device.currentVersion] = (dist[device.currentVersion] ?? 0) + 1
    }
    return dist
  }

  checkUpdate(device: DeviceInfo): UpdateCheckResult {
    this.registerDevice(device)

    const activeRelease = this.getActiveRelease()
    if (!activeRelease) {
      return { action: 'none', force: false, message: 'NoAvailableUpdate' }
    }

    const { version, manifest, strategy } = activeRelease

    if (device.currentVersion === version) {
      return { action: 'none', force: false, message: 'Already up to date' }
    }

    if (!this.isVersionGte(device.shellVersion, manifest.minShellVersion)) {
      return {
        action: 'none',
        force: false,
        message: `Need Shell Version >= ${manifest.minShellVersion}，Current ${device.shellVersion}`,
      }
    }

    if (!this.shouldReceiveUpdate(device.deviceId, strategy)) {
      return { action: 'none', force: false, message: 'Not in rollout range' }
    }

    const isRollback = this.isVersionGt(device.currentVersion, version)
    const action = isRollback ? 'rollback' : 'update'
    const actionLabel = isRollback ? 'Rollback' : 'Update'

    return {
      action,
      target: { version, manifest },
      force: false,
      message: `New version ${version} found, ${actionLabel} available`,
    }
  }

  listLocalVersions(): string[] {
    if (!existsSync(VERSIONS_DIR)) return []
    return readdirSync(VERSIONS_DIR).filter((name) => {
      const stat = lstatSync(join(VERSIONS_DIR, name))
      return stat.isDirectory()
    }).sort()
  }

  getCurrentVersion(): string | null {
    if (!existsSync(CURRENT_LINK)) return null
    try {
      const target = readlinkSync(CURRENT_LINK)
      return target.split('/').pop() ?? null
    } catch {
      return null
    }
  }

  switchVersion(version: string): boolean {
    const versionDir = join(VERSIONS_DIR, version)
    if (!existsSync(versionDir)) {
      log.error('Version directory not found', { version, versionDir })
      return false
    }

    try {
      const tmpLink = `${CURRENT_LINK}.tmp`
      if (existsSync(tmpLink)) unlinkSync(tmpLink)
      symlinkSync(versionDir, tmpLink)

      const { renameSync } = require('fs')
      renameSync(tmpLink, CURRENT_LINK)

      log.info('Version switched', { version })
      return true
    } catch (err) {
      log.error('Failed to switch version', {
        version,
        error: err instanceof Error ? err.message : String(err),
      })
      return false
    }
  }

  installVersion(version: string, manifest: VersionManifest): string {
    const versionDir = join(VERSIONS_DIR, version)
    const uiDir = join(versionDir, 'ui')
    const serverDir = join(versionDir, 'server')

    for (const dir of [versionDir, uiDir, serverDir]) {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    }

    writeFileSync(
      join(versionDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf-8',
    )

    log.info('Version directory prepared', { version, versionDir })
    return versionDir
  }

  cleanOldVersions(maxKeep = 2) {
    const versions = this.listLocalVersions()
    const currentVersion = this.getCurrentVersion()

    if (versions.length <= maxKeep) return

    const sorted = versions.sort((a, b) => this.compareVersions(b, a))
    const toRemove = sorted.slice(maxKeep).filter((v) => v !== currentVersion)

    for (const version of toRemove) {
      const dir = join(VERSIONS_DIR, version)
      try {
        rmSync(dir, { recursive: true, force: true })
        log.info('Removed old version', { version })
      } catch (err) {
        log.warn('Failed to remove old version', {
          version,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }

  cleanDownloads() {
    if (existsSync(DOWNLOADS_DIR)) {
      rmSync(DOWNLOADS_DIR, { recursive: true, force: true })
      mkdirSync(DOWNLOADS_DIR, { recursive: true })
    }
  }

  recordError(deviceId: string, version: string, errorType: string, message: string): boolean {
    if (!this.state.errors) this.state.errors = []

    this.state.errors.push({
      deviceId,
      version,
      errorType,
      message,
      timestamp: new Date().toISOString(),
    })

    if (this.state.errors.length > 1000) {
      this.state.errors = this.state.errors.slice(-1000)
    }

    this.saveState()

    const activeRelease = this.getActiveRelease()
    if (!activeRelease?.strategy.autoRollback.enabled) return false

    const { errorThreshold, windowMinutes } = activeRelease.strategy.autoRollback
    const windowStart = Date.now() - windowMinutes * 60 * 1000

    const recentErrors = this.state.errors.filter(
      (e) => e.version === version && new Date(e.timestamp).getTime() > windowStart,
    )

    const uniqueDevices = new Set(recentErrors.map((e) => e.deviceId)).size

    if (uniqueDevices >= errorThreshold) {
      log.warn('Auto-rollback threshold reached', {
        version,
        uniqueDevices,
        threshold: errorThreshold,
        windowMinutes,
      })
      return true
    }

    return false
  }

  getErrors(version?: string): ErrorRecord[] {
    const errors = this.state.errors ?? []
    return version ? errors.filter((e) => e.version === version) : errors
  }

  verifySha256(filePath: string, expectedHash: string): boolean {
    const data = readFileSync(filePath)
    const hash = createHash('sha256').update(data).digest('hex')
    return hash === expectedHash
  }

  get teemaiHome() { return TEEMAI_HOME }
  get versionsDir() { return VERSIONS_DIR }
  get currentLink() { return CURRENT_LINK }
  get downloadsDir() { return DOWNLOADS_DIR }

  resolveCurrentBundle(): { ui: string, server: string } | null {
    if (!existsSync(CURRENT_LINK)) return null
    try {
      const target = readlinkSync(CURRENT_LINK)
      return {
        ui: join(target, 'ui'),
        server: join(target, 'server'),
      }
    } catch {
      return null
    }
  }

  private shouldReceiveUpdate(deviceId: string, strategy: ReleaseStrategy): boolean {
    switch (strategy.type) {
      case 'full':
        return true
      case 'canary':
        return strategy.targetGroup.includes(deviceId)
      case 'pinned':
        return strategy.targetGroup.includes(deviceId)
      case 'gradual': {
        const hash = createHash('md5').update(deviceId).digest()
        const bucket = hash.readUInt16BE(0) % 100
        return bucket < strategy.rolloutPercent
      }
      default:
        return false
    }
  }

  private isVersionGte(a: string, b: string): boolean {
    return this.compareVersions(a, b) >= 0
  }

  private isVersionGt(a: string, b: string): boolean {
    return this.compareVersions(a, b) > 0
  }

  private compareVersions(a: string, b: string): number {
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
}
