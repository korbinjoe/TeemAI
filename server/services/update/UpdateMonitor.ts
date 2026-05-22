/**
 * UpdateMonitor —
 *
 *  broadcast  WebSocket
 */

import type { UpdateManager } from './UpdateManager'
import { createLogger } from '../../lib/logger'

const log = createLogger('UpdateMonitor')

export interface UpdateAlert {
  id: string
  level: 'info' | 'warning' | 'critical'
  type: 'error_spike' | 'rollback_triggered' | 'slow_adoption' | 'version_fragmentation'
  title: string
  message: string
  version?: string
  timestamp: string
  data?: Record<string, unknown>
}

export interface UpdateMetrics {
  totalDevices: number
  versionDistribution: Record<string, number>
  activeVersion: string | null
  recentErrors: {
    total: number
    byVersion: Record<string, number>
    byType: Record<string, number>
  }
  adoptionRate: number | null
  alerts: UpdateAlert[]
}

const MONITOR_INTERVAL = 60_000

export class UpdateMonitor {
  private alerts: UpdateAlert[] = []
  private monitorTimer: ReturnType<typeof setInterval> | null = null
  private alertCounter = 0

  constructor(
    private updateManager: UpdateManager,
    private broadcast: (msg: Record<string, unknown>) => void,
  ) {}

  start() {
    this.monitorTimer = setInterval(() => this.runChecks(), MONITOR_INTERVAL)
    log.info('Update monitor started')
  }

  stop() {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer)
      this.monitorTimer = null
    }
  }

  runChecks() {
    this.checkErrorSpike()
    this.checkVersionFragmentation()
    this.checkSlowAdoption()

    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100)
    }
  }

  getMetrics(): UpdateMetrics {
    const devices = this.updateManager.listDevices()
    const distribution = this.updateManager.getDeviceDistribution()
    const activeRelease = this.updateManager.getActiveRelease()
    const errors = this.updateManager.getErrors()

    const oneHourAgo = Date.now() - 60 * 60 * 1000
    const recentErrors = errors.filter((e) => new Date(e.timestamp).getTime() > oneHourAgo)

    const errorsByVersion: Record<string, number> = {}
    const errorsByType: Record<string, number> = {}
    for (const e of recentErrors) {
      errorsByVersion[e.version] = (errorsByVersion[e.version] ?? 0) + 1
      errorsByType[e.errorType] = (errorsByType[e.errorType] ?? 0) + 1
    }

    let adoptionRate: number | null = null
    if (activeRelease && devices.length > 0) {
      const onTarget = devices.filter((d) => d.currentVersion === activeRelease.version).length
      adoptionRate = Math.round((onTarget / devices.length) * 100)
    }

    return {
      totalDevices: devices.length,
      versionDistribution: distribution,
      activeVersion: activeRelease?.version ?? null,
      recentErrors: {
        total: recentErrors.length,
        byVersion: errorsByVersion,
        byType: errorsByType,
      },
      adoptionRate,
      alerts: this.alerts.slice(-20),
    }
  }

  getAlerts(): UpdateAlert[] {
    return [...this.alerts]
  }

  private checkErrorSpike() {
    const activeRelease = this.updateManager.getActiveRelease()
    if (!activeRelease) return

    const errors = this.updateManager.getErrors(activeRelease.version)
    const fiveMinAgo = Date.now() - 5 * 60 * 1000
    const recentErrors = errors.filter((e) => new Date(e.timestamp).getTime() > fiveMinAgo)

    if (recentErrors.length >= 3) {
      const uniqueDevices = new Set(recentErrors.map((e) => e.deviceId)).size
      this.emitAlert({
        level: uniqueDevices >= 5 ? 'critical' : 'warning',
        type: 'error_spike',
        title: 'Update error rate spike',
        message: `Version ${activeRelease.version} received ${recentErrors.length} errors in 5 minutes, affecting ${uniqueDevices} devices`,
        version: activeRelease.version,
        data: { errorCount: recentErrors.length, uniqueDevices },
      })
    }
  }

  private checkVersionFragmentation() {
    const distribution = this.updateManager.getDeviceDistribution()
    const versions = Object.keys(distribution)

    if (versions.length >= 4) {
      this.emitAlert({
        level: 'warning',
        type: 'version_fragmentation',
        title: 'Version fragmentation',
        message: `Currently ${versions.length} different versions running: ${versions.join(', ')}`,
        data: { distribution },
      })
    }
  }

  private checkSlowAdoption() {
    const activeRelease = this.updateManager.getActiveRelease()
    if (!activeRelease) return

    if (activeRelease.strategy.type !== 'full') return

    const releaseAge = Date.now() - new Date(activeRelease.createdAt).getTime()
    if (releaseAge < 60 * 60 * 1000) return

    const devices = this.updateManager.listDevices()
    if (devices.length === 0) return

    const onTarget = devices.filter((d) => d.currentVersion === activeRelease.version).length
    const rate = onTarget / devices.length

    if (rate < 0.5) {
      this.emitAlert({
        level: 'info',
        type: 'slow_adoption',
        title: 'Low version adoption rate',
        message: `Version ${activeRelease.version} released ${Math.round(releaseAge / 3600000)}h ago, adoption rate only ${Math.round(rate * 100)}%`,
        version: activeRelease.version,
        data: { adoptionRate: Math.round(rate * 100), totalDevices: devices.length },
      })
    }
  }

  private emitAlert(alert: Omit<UpdateAlert, 'id' | 'timestamp'>) {
    const fiveMinAgo = Date.now() - 5 * 60 * 1000
    const duplicate = this.alerts.find(
      (a) =>
        a.type === alert.type &&
        a.version === alert.version &&
        new Date(a.timestamp).getTime() > fiveMinAgo,
    )
    if (duplicate) return

    const fullAlert: UpdateAlert = {
      ...alert,
      id: `alert-${++this.alertCounter}`,
      timestamp: new Date().toISOString(),
    }

    this.alerts.push(fullAlert)
    log.warn('Update alert', { type: alert.type, level: alert.level, message: alert.message })

    // WebSocket Push
    this.broadcast({
      type: 'update:alert',
      payload: fullAlert,
    })
  }
}
