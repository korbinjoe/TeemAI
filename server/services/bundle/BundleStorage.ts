/**
 * BundleStorage — Bundle
 *
 *  ~/.teemai/bundle-store/  bundle
 *  OSS/CDN
 */

import { join } from 'path'
import {
  existsSync, mkdirSync, readFileSync, writeFileSync,
  readdirSync, statSync, rmSync, createReadStream,
} from 'fs'
import { createHash } from 'crypto'
import { createLogger } from '../../lib/logger'
import { TEEMAI_HOME } from '../../config/paths'
import type { ReadStream } from 'fs'

const log = createLogger('BundleStorage')

const BUNDLE_STORE = join(TEEMAI_HOME, 'bundle-store')

export interface StoredBundle {
  version: string
  bundle: 'ui' | 'server'
  filePath: string
  sha256: string
  size: number
  uploadedAt: string
}

export class BundleStorage {
  constructor() {
    this.ensureDir()
  }

  private ensureDir() {
    if (!existsSync(BUNDLE_STORE)) {
      mkdirSync(BUNDLE_STORE, { recursive: true })
    }
  }

  private versionDir(version: string): string {
    return join(BUNDLE_STORE, version)
  }

  private bundlePath(version: string, bundle: 'ui' | 'server'): string {
    return join(this.versionDir(version), `${bundle}.tar.gz`)
  }

  store(version: string, bundle: 'ui' | 'server', data: Buffer): StoredBundle {
    const dir = this.versionDir(version)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    const filePath = this.bundlePath(version, bundle)
    writeFileSync(filePath, data)

    const sha256 = createHash('sha256').update(data).digest('hex')
    const size = data.length

    const info: StoredBundle = {
      version,
      bundle,
      filePath,
      sha256,
      size,
      uploadedAt: new Date().toISOString(),
    }

    writeFileSync(
      join(dir, `${bundle}.meta.json`),
      JSON.stringify(info, null, 2),
      'utf-8',
    )

    log.info('Bundle stored', { version, bundle, size, sha256: sha256.slice(0, 12) })
    return info
  }

  exists(version: string, bundle: 'ui' | 'server'): boolean {
    return existsSync(this.bundlePath(version, bundle))
  }

  getReadStream(version: string, bundle: 'ui' | 'server'): ReadStream | null {
    const filePath = this.bundlePath(version, bundle)
    if (!existsSync(filePath)) return null
    return createReadStream(filePath)
  }

  getInfo(version: string, bundle: 'ui' | 'server'): StoredBundle | null {
    const metaPath = join(this.versionDir(version), `${bundle}.meta.json`)
    if (!existsSync(metaPath)) return null

    try {
      return JSON.parse(readFileSync(metaPath, 'utf-8'))
    } catch {
      return null
    }
  }

  getVersionInfo(version: string): { ui?: StoredBundle, server?: StoredBundle } {
    return {
      ui: this.getInfo(version, 'ui') ?? undefined,
      server: this.getInfo(version, 'server') ?? undefined,
    }
  }

  listVersions(): string[] {
    if (!existsSync(BUNDLE_STORE)) return []
    return readdirSync(BUNDLE_STORE)
      .filter((name) => {
        try { return statSync(join(BUNDLE_STORE, name)).isDirectory() } catch { return false }
      })
      .sort()
  }

  remove(version: string) {
    const dir = this.versionDir(version)
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true })
      log.info('Bundle removed', { version })
    }
  }

  getStorageStats(): { totalSize: number, versionCount: number, versions: Record<string, number> } {
    const versions = this.listVersions()
    const versionSizes: Record<string, number> = {}
    let totalSize = 0

    for (const version of versions) {
      const dir = this.versionDir(version)
      let size = 0
      try {
        for (const file of readdirSync(dir)) {
          const filePath = join(dir, file)
          try { size += statSync(filePath).size } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
      versionSizes[version] = size
      totalSize += size
    }

    return { totalSize, versionCount: versions.length, versions: versionSizes }
  }

  verify(version: string, bundle: 'ui' | 'server', expectedSha256: string): boolean {
    const filePath = this.bundlePath(version, bundle)
    if (!existsSync(filePath)) return false

    const data = readFileSync(filePath)
    const hash = createHash('sha256').update(data).digest('hex')
    return hash === expectedSha256
  }
}
