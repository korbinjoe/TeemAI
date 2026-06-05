/**
 * UpdateBridge — Electron
 *
 * -  bundle
 * -  Renderer
 * -  UI reload Server
 */

import { ipcMain } from 'electron'
import { join } from 'path'
import { homedir } from 'os'
import {
  existsSync, readlinkSync, readFileSync, writeFileSync,
  mkdirSync, rmSync, createWriteStream, createReadStream, symlinkSync, unlinkSync,
  renameSync,
} from 'fs'
import { writeFile } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { createHash } from 'crypto'
import { pipeline } from 'stream/promises'
import type { WindowManager } from './WindowManager'
import { PORTS } from '../../shared/ports'
import { TEEMAI_HOME } from '../../shared/teemai-home'

export const UPDATE_IPC = {
  STATUS: 'update:status',
  AVAILABLE: 'update:available',
  APPLYING: 'update:applying',
  APPLIED: 'update:applied',
  ERROR: 'update:error',
  CHECK_NOW: 'update:check-now',
  APPLY_NOW: 'update:apply-now',
} as const

interface UpdateCheckResult {
  action: 'update' | 'rollback' | 'none'
  target?: {
    version: string
    manifest: {
      version: string
      bundles: {
        ui: { url: string, sha256: string, size: number }
        server: { url: string, sha256: string, size: number }
      }
      changelog: string
      [key: string]: unknown
    }
  }
  force: boolean
  message: string
}

interface DeviceConfig {
  deviceId: string
  shellVersion: string
}

export type UpdateStatus = 'idle' | 'checking' | 'downloading' | 'ready' | 'applying' | 'error'

const VERSIONS_DIR = join(TEEMAI_HOME, 'versions')
const CURRENT_LINK = join(TEEMAI_HOME, 'current')
const DOWNLOADS_DIR = join(TEEMAI_HOME, 'downloads')
const CONFIG_FILE = join(TEEMAI_HOME, 'config.json')

const CHECK_INTERVAL = 5 * 60 * 1000

export class UpdateBridge {
  private status: UpdateStatus = 'idle'
  private pendingUpdate: UpdateCheckResult | null = null
  private checkTimer: ReturnType<typeof setInterval> | null = null
  private serverPort = PORTS.DEV_SERVER

  constructor(private windowManager: WindowManager) {}

  setup(serverPort: number) {
    this.serverPort = serverPort

    ipcMain.on(UPDATE_IPC.CHECK_NOW, async () => {
      await this.checkForUpdates()
    })

    ipcMain.on(UPDATE_IPC.APPLY_NOW, async () => {
      if (this.status === 'downloading' || this.status === 'applying') return
      if (this.pendingUpdate?.target) {
        await this.applyUpdate(this.pendingUpdate)
      }
    })

    setTimeout(() => this.checkForUpdates(), 30_000)
    this.checkTimer = setInterval(() => this.checkForUpdates(), CHECK_INTERVAL)
  }

  destroy() {
    if (this.checkTimer) {
      clearInterval(this.checkTimer)
      this.checkTimer = null
    }
    ipcMain.removeAllListeners(UPDATE_IPC.CHECK_NOW)
    ipcMain.removeAllListeners(UPDATE_IPC.APPLY_NOW)
  }

  async checkForUpdates(): Promise<UpdateCheckResult | null> {
    if (this.status === 'downloading' || this.status === 'applying') return null

    this.setStatus('checking')
    const currentVersion = this.getCurrentVersion() ?? '0.0.0'

    try {
      const params = new URLSearchParams({ currentVersion })
      const res = await fetch(`http://localhost:${this.serverPort}/api/update/check-npm?${params}`)
      if (!res.ok) {
        this.setStatus('idle')
        return null
      }

      const data = await res.json() as {
        hasUpdate: boolean
        currentVersion: string
        latestVersion: string | null
        error?: string
      }

      if (data.hasUpdate && data.latestVersion) {
        const result: UpdateCheckResult = {
          action: 'update',
          target: {
            version: data.latestVersion,
            manifest: {
              version: data.latestVersion,
              bundles: { ui: { url: '', sha256: '', size: 0 }, server: { url: '', sha256: '', size: 0 } },
              changelog: '',
            },
          },
          force: false,
          message: `New version ${data.latestVersion} found, current ${currentVersion}`,
        }

        this.pendingUpdate = result
        this.setStatus('idle')
        this.notifyRenderer(UPDATE_IPC.AVAILABLE, {
          version: data.latestVersion,
          action: 'update',
          message: result.message,
          changelog: '',
          force: false,
        })

        return result
      } else {
        this.pendingUpdate = null
        this.setStatus('idle')
        return { action: 'none', force: false, message: data.error ?? 'Already up to date' }
      }
    } catch (err) {
      console.error('[UpdateBridge] Check failed:', err)
      this.setStatus('idle')
      return null
    }
  }

  async applyUpdate(result: UpdateCheckResult): Promise<boolean> {
    const target = result.target
    if (!target) return false

    const { version, manifest } = target

    this.setStatus('downloading')
    this.notifyRenderer(UPDATE_IPC.APPLYING, { version, phase: 'downloading' })

    const versionDir = join(VERSIONS_DIR, version)
    const downloadDir = join(DOWNLOADS_DIR, version)

    if (existsSync(versionDir) && existsSync(join(versionDir, 'manifest.json'))) {
      return this.switchAndReload(version)
    }

    this.ensureDir(downloadDir)
    this.ensureDir(versionDir)

    for (const [name, bundle] of Object.entries(manifest.bundles)) {
      const targetDir = join(versionDir, name)
      this.ensureDir(targetDir)

      const downloadPath = join(downloadDir, `${name}.tar.gz`)

      try {
        this.notifyRenderer(UPDATE_IPC.APPLYING, { version, phase: 'downloading', bundle: name })

        const res = await fetch(bundle.url)
        if (!res.ok || !res.body) {
          throw new Error(`Download ${name} failed: ${res.status}`)
        }

        const writeStream = createWriteStream(downloadPath)
        await pipeline(res.body, writeStream)

        const hash = createHash('sha256')
        const readStream = createReadStream(downloadPath)
        for await (const chunk of readStream) {
          hash.update(chunk as Buffer)
        }
        const digest = hash.digest('hex')
        if (digest !== bundle.sha256) {
          throw new Error(`${name} SHA256 mismatch: expected ${bundle.sha256.slice(0, 12)}..., got ${digest.slice(0, 12)}...`)
        }

        const execFileAsync = promisify(execFile)
        await execFileAsync('tar', ['-xzf', downloadPath, '-C', targetDir])
      } catch (err) {
        console.error(`[UpdateBridge] Failed to install ${name}:`, err)
        this.cleanup(downloadDir, versionDir)
        this.setStatus('error')
        this.notifyRenderer(UPDATE_IPC.ERROR, {
          version,
          error: err instanceof Error ? err.message : String(err),
        })
        return false
      }
    }

    await writeFile(join(versionDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8')

    this.cleanup(downloadDir)

    return this.switchAndReload(version)
  }

  // ── VersionSwitch + Reload ──

  private switchAndReload(version: string): boolean {
    this.setStatus('applying')
    this.notifyRenderer(UPDATE_IPC.APPLYING, { version, phase: 'switching' })

    const versionDir = join(VERSIONS_DIR, version)
    if (!existsSync(versionDir)) {
      this.setStatus('error')
      return false
    }

    try {
      const tmpLink = `${CURRENT_LINK}.tmp`
      if (existsSync(tmpLink)) unlinkSync(tmpLink)
      symlinkSync(versionDir, tmpLink)
      renameSync(tmpLink, CURRENT_LINK)
    } catch (err) {
      console.error('[UpdateBridge] Switch failed:', err)
      this.setStatus('error')
      return false
    }

    const hasServerChange = existsSync(join(versionDir, 'server'))
    const hasUIChange = existsSync(join(versionDir, 'ui'))

    if (hasUIChange && !hasServerChange) {
      console.log('[UpdateBridge] UI-only update, reloading window...')
      const mainWindow = this.windowManager.getMainWindow()
      mainWindow?.webContents.reload()
      this.setStatus('idle')
      this.pendingUpdate = null
      this.notifyRenderer(UPDATE_IPC.APPLIED, { version, reloadType: 'ui' })
    } else {
      // Server Changes：NeedRestartApply
      console.log('[UpdateBridge] Server update applied, restart required')
      this.setStatus('ready')
      this.notifyRenderer(UPDATE_IPC.APPLIED, {
        version,
        reloadType: 'restart',
        message: 'Update downloaded, restart to apply',
      })
    }

    return true
  }

  private getCurrentVersion(): string | null {
    if (!existsSync(CURRENT_LINK)) return null
    try {
      const target = readlinkSync(CURRENT_LINK)
      return target.split('/').pop() ?? null
    } catch {
      return null
    }
  }

  private getDeviceConfig(): DeviceConfig {
    if (existsSync(CONFIG_FILE)) {
      try {
        return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'))
      } catch { /* regenerate */ }
    }

    const config: DeviceConfig = {
      deviceId: createHash('sha256')
        .update(`${homedir()}-${Date.now()}-${Math.random()}`)
        .digest('hex')
        .slice(0, 16),
      shellVersion: '1.0.0',
    }

    this.ensureDir(TEEMAI_HOME)
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8')
    return config
  }

  private setStatus(status: UpdateStatus) {
    this.status = status
    this.notifyRenderer(UPDATE_IPC.STATUS, { status })
  }

  private notifyRenderer(channel: string, data: unknown) {
    this.windowManager.sendToAll(channel, data)
  }

  private ensureDir(dir: string) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  }

  private cleanup(...dirs: string[]) {
    for (const dir of dirs) {
      try { rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ }
    }
  }
}
