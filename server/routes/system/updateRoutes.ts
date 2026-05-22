/**
 * Update REST API —
 *
 * - GET  /api/update/check                          release
 * - GET  /api/update/check-npm                      npm registry
 * - GET  /api/update/download/:version/:bundle       bundle
 * - POST /api/update/report
 * - POST /api/update/error
 *
 * - POST /api/update/release
 * - POST /api/update/upload/:version/:bundle         bundle
 * - POST /api/update/rollback
 * - PUT  /api/update/strategy
 * - GET  /api/update/releases
 * - GET  /api/update/devices
 * - GET  /api/update/status
 * - GET  /api/update/storage
 */

import { Router } from 'express'
import type { UpdateManager, VersionManifest } from '../../services/update/UpdateManager'
import type { BundleStorage } from '../../services/bundle/BundleStorage'
import type { UpdateMonitor } from '../../services/update/UpdateMonitor'
import type { SignatureVerifier } from '../../services/auth/SignatureVerifier'
import { ReleaseStrategyEngine } from '../../services/update/ReleaseStrategy'
import { createLogger } from '../../lib/logger'

const log = createLogger('UpdateRoutes')

interface UpdateRouteDeps {
  updateManager: UpdateManager
  bundleStorage: BundleStorage
  updateMonitor?: UpdateMonitor
  signatureVerifier?: SignatureVerifier
}

export const createUpdateRoutes = ({ updateManager, bundleStorage, updateMonitor, signatureVerifier }: UpdateRouteDeps): Router => {
  const router = Router()

  // ════════════════════════════════════════
  // ════════════════════════════════════════

  /**
   * GET /api/update/check —
   *
   * Query: deviceId, clientType, currentVersion, shellVersion, platform
   */
  router.get('/api/update/check', (req, res) => {
    const { deviceId, clientType, currentVersion, shellVersion, platform } = req.query

    if (!deviceId || !clientType || !currentVersion || !shellVersion || !platform) {
      res.status(400).json({ error: 'Missing required parameters: deviceId, clientType, currentVersion, shellVersion, platform' })
      return
    }

    const result = updateManager.checkUpdate({
      deviceId: String(deviceId),
      clientType: String(clientType) as 'cli' | 'electron',
      currentVersion: String(currentVersion),
      shellVersion: String(shellVersion),
      platform: String(platform),
      lastSeen: new Date().toISOString(),
    })

    res.json(result)
  })

  /**
   * GET /api/update/check-npm —  npm registry
   *
   * Query: currentVersion ()
   * : { hasUpdate, currentVersion, latestVersion, registry }
   */
  router.get('/api/update/check-npm', async (req, res) => {
    const currentVersion = String(req.query.currentVersion ?? '0.0.0')
    const pkgName = 'openteam'
    const registry = 'https://registry.npmjs.org'

    try {
      const url = `${registry}/${encodeURIComponent(pkgName).replace('%40', '@')}/latest`
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10_000)

      const npmRes = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })
      clearTimeout(timeout)

      if (!npmRes.ok) {
        log.warn('npm registry returned non-ok', { status: npmRes.status, registry })
        res.json({ hasUpdate: false, currentVersion, latestVersion: null, error: `registry Back ${npmRes.status}` })
        return
      }

      const data = await npmRes.json() as { version?: string }
      const latestVersion = data.version ?? null

      if (!latestVersion) {
        res.json({ hasUpdate: false, currentVersion, latestVersion: null, error: 'Failed to fetch version info' })
        return
      }

      const hasUpdate = compareVersions(latestVersion, currentVersion) > 0

      res.json({ hasUpdate, currentVersion, latestVersion, registry })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log.warn('npm registry check failed', { error: message, registry })
      res.json({ hasUpdate: false, currentVersion, latestVersion: null, error: message })
    }
  })

  /**
   * GET /api/update/download/:version/:bundle —  bundle
   *
   *  Range
   */
  router.get('/api/update/download/:version/:bundle', (req, res) => {
    const { version, bundle } = req.params

    if (bundle !== 'ui' && bundle !== 'server') {
      res.status(400).json({ error: 'bundle must be ui or server' })
      return
    }

    const info = bundleStorage.getInfo(version, bundle)
    if (!info) {
      res.status(404).json({ error: `Bundle ${version}/${bundle} does not exist` })
      return
    }

    const stream = bundleStorage.getReadStream(version, bundle)
    if (!stream) {
      res.status(404).json({ error: `Bundle FileNot found` })
      return
    }

    res.setHeader('Content-Type', 'application/gzip')
    res.setHeader('Content-Disposition', `attachment; filename="${bundle}.tar.gz"`)
    res.setHeader('Content-Length', info.size)
    res.setHeader('X-Bundle-SHA256', info.sha256)
    res.setHeader('Accept-Ranges', 'bytes')

    stream.pipe(res)
  })

  /**
   * POST /api/update/report —
   *
   * Body: { deviceId, clientType, currentVersion, shellVersion, platform, status }
   */
  router.post('/api/update/report', (req, res) => {
    const { deviceId, clientType, currentVersion, shellVersion, platform, status } = req.body

    if (!deviceId || !currentVersion) {
      res.status(400).json({ error: 'Missing deviceId or currentVersion' })
      return
    }

    updateManager.registerDevice({
      deviceId: String(deviceId),
      clientType: String(clientType ?? 'cli') as 'cli' | 'electron',
      currentVersion: String(currentVersion),
      shellVersion: String(shellVersion ?? '1.0.0'),
      platform: String(platform ?? 'unknown'),
      lastSeen: new Date().toISOString(),
    })

    log.debug('Device report received', { deviceId, currentVersion, status })
    res.json({ success: true })
  })

  /**
   * POST /api/update/error —
   *
   * Body: { deviceId, version, errorType, message, stack? }
   */
  router.post('/api/update/error', (req, res) => {
    const { deviceId, version, errorType, message, stack } = req.body

    if (!deviceId || !version || !errorType) {
      res.status(400).json({ error: 'Missing deviceId, version or errorType' })
      return
    }

    log.warn('Client error reported', { deviceId, version, errorType, message })

    const shouldAutoRollback = updateManager.recordError(
      String(deviceId),
      String(version),
      String(errorType),
      String(message ?? ''),
    )

    if (shouldAutoRollback) {
      const activeRelease = updateManager.getActiveRelease()
      if (activeRelease?.manifest.rollbackTo) {
        const rollback = updateManager.triggerRollback(activeRelease.manifest.rollbackTo)
        if (rollback) {
          log.warn('Auto-rollback triggered', {
            from: version,
            to: activeRelease.manifest.rollbackTo,
          })
        }
      }
    }

    res.json({ success: true, autoRollback: shouldAutoRollback })
  })

  // ════════════════════════════════════════
  // ════════════════════════════════════════

  /**
   * POST /api/update/release —
   *
   * Body: { manifest: VersionManifest, strategy?: ReleaseStrategy }
   */
  router.post('/api/update/release', (req, res) => {
    const { manifest, strategy } = req.body

    if (!manifest || !manifest.version || !manifest.bundles) {
      res.status(400).json({ error: 'Missing manifest or invalid manifest format' })
      return
    }

    const m = manifest as VersionManifest
    if (!m.bundles.ui?.url || !m.bundles.ui?.sha256 || !m.bundles.server?.url || !m.bundles.server?.sha256) {
      res.status(400).json({ error: 'manifest.bundles must contain url and sha256 for both ui and server' })
      return
    }

    const releaseStrategy = strategy ?? ReleaseStrategyEngine.defaultFull()

    const validationError = ReleaseStrategyEngine.validate(releaseStrategy)
    if (validationError) {
      res.status(400).json({ error: validationError })
      return
    }

    const record = updateManager.registerRelease(m, releaseStrategy)
    log.info('New release published', { version: m.version })

    res.json({ success: true, release: record })
  })

  /**
   * POST /api/update/upload/:version/:bundle —  bundle
   *
   * Content-Type: application/octet-stream
   * Body: raw tar.gz
   */
  router.post('/api/update/upload/:version/:bundle', (req, res) => {
    const { version, bundle } = req.params

    if (bundle !== 'ui' && bundle !== 'server') {
      res.status(400).json({ error: 'bundle must be ui or server' })
      return
    }

    const chunks: Buffer[] = []

    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })

    req.on('end', () => {
      const data = Buffer.concat(chunks)

      if (data.length === 0) {
        res.status(400).json({ error: 'UploadContentis empty' })
        return
      }

      const info = bundleStorage.store(version, bundle as 'ui' | 'server', data)
      log.info('Bundle uploaded', { version, bundle, size: data.length })

      res.json({ success: true, bundle: info })
    })

    req.on('error', (err) => {
      log.error('Upload error', { error: err.message })
      res.status(500).json({ error: 'UploadFailed' })
    })
  })

  /**
   * POST /api/update/rollback —
   *
   * Body: { targetVersion: string }
   */
  router.post('/api/update/rollback', (req, res) => {
    const { targetVersion } = req.body

    if (!targetVersion) {
      res.status(400).json({ error: 'Missing targetVersion' })
      return
    }

    const record = updateManager.triggerRollback(String(targetVersion))
    if (!record) {
      res.status(404).json({ error: `targetVersion ${targetVersion} does not exist` })
      return
    }

    log.info('Rollback triggered', { targetVersion })
    res.json({ success: true, release: record })
  })

  /**
   * PUT /api/update/strategy —
   *
   * Body: { version: string, strategy: Partial<ReleaseStrategy> }
   */
  router.put('/api/update/strategy', (req, res) => {
    const { version, strategy } = req.body

    if (!version || !strategy) {
      res.status(400).json({ error: 'Missing version or strategy' })
      return
    }

    if (strategy.type) {
      const validationError = ReleaseStrategyEngine.validate(strategy)
      if (validationError) {
        res.status(400).json({ error: validationError })
        return
      }
    }

    const record = updateManager.updateStrategy(String(version), strategy)
    if (!record) {
      res.status(404).json({ error: `Version ${version} has no active release` })
      return
    }

    res.json({ success: true, release: record })
  })

  /**
   * GET /api/update/releases —
   */
  router.get('/api/update/releases', (_req, res) => {
    const releases = updateManager.listReleases()
    res.json({ releases })
  })

  router.get('/api/update/devices', (_req, res) => {
    const devices = updateManager.listDevices()
    const distribution = updateManager.getDeviceDistribution()
    res.json({ devices, distribution })
  })

  router.get('/api/update/status', (_req, res) => {
    res.json({
      currentVersion: updateManager.getCurrentVersion(),
      installedVersions: updateManager.listLocalVersions(),
      activeRelease: updateManager.getActiveRelease(),
    })
  })

  /**
   * GET /api/update/storage —  bundle
   */
  router.get('/api/update/storage', (_req, res) => {
    const stats = bundleStorage.getStorageStats()
    const versions = bundleStorage.listVersions().map((v) => ({
      version: v,
      bundles: bundleStorage.getVersionInfo(v),
    }))

    res.json({ stats, versions })
  })

  /**
   * GET /api/update/metrics —  UI
   */
  router.get('/api/update/metrics', (_req, res) => {
    if (!updateMonitor) {
      res.status(501).json({ error: 'Monitor not initialized' })
      return
    }
    res.json(updateMonitor.getMetrics())
  })

  router.get('/api/update/alerts', (_req, res) => {
    if (!updateMonitor) {
      res.json({ alerts: [] })
      return
    }
    res.json({ alerts: updateMonitor.getAlerts() })
  })

  /**
   * GET /api/update/public-key —
   */
  router.get('/api/update/public-key', (_req, res) => {
    if (!signatureVerifier) {
      res.status(501).json({ error: 'Signature verifier not initialized' })
      return
    }
    res.json({
      publicKey: signatureVerifier.getPublicKey(),
      fingerprint: signatureVerifier.getPublicKeyFingerprint(),
    })
  })

  /**
   * POST /api/update/sign —  manifest
   *
   * Body: { manifest: object }
   */
  router.post('/api/update/sign', (req, res) => {
    if (!signatureVerifier) {
      res.status(501).json({ error: 'Signature verifier not initialized' })
      return
    }

    const { manifest } = req.body
    if (!manifest) {
      res.status(400).json({ error: 'Missing manifest' })
      return
    }

    const signature = signatureVerifier.signManifest(manifest)
    if (!signature) {
      res.status(500).json({ error: 'Signature failed' })
      return
    }

    res.json({ signature, fingerprint: signatureVerifier.getPublicKeyFingerprint() })
  })

  /**
   * POST /api/update/verify —
   *
   * Body: { manifest: object, signature: string }
   */
  router.post('/api/update/verify', (req, res) => {
    if (!signatureVerifier) {
      res.status(501).json({ error: 'Signature verifier not initialized' })
      return
    }

    const { manifest, signature } = req.body
    if (!manifest || !signature) {
      res.status(400).json({ error: 'Missing manifest or signature' })
      return
    }

    const valid = signatureVerifier.verifyManifest(manifest, String(signature))
    res.json({ valid })
  })

  return router
}

const compareVersions = (a: string, b: string): number => {
  const normalize = (v: string) => v.replace(/^v/, '').split('-')[0].split('.').map(Number)
  const pa = normalize(a)
  const pb = normalize(b)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0
    const nb = pb[i] ?? 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  const preA = a.replace(/^v/, '').split('-').slice(1).join('-')
  const preB = b.replace(/^v/, '').split('-').slice(1).join('-')
  if (!preA && preB) return 1
  if (preA && !preB) return -1
  if (preA < preB) return -1
  if (preA > preB) return 1
  return 0
}
