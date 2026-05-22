/**
 * VersionGate —
 *
 *  openteam-server  versionPolicy
 *  Expert
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createLogger } from '../../lib/logger'

const log = createLogger('VersionGate')

export interface VersionPolicy {
  minClientVersion: string
  upgradeMessage?: string
  upgradeUrl?: string
}

const __dirname_esm = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname_esm, '../..')

const getClientVersion = (): string => {
  try {
    const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf8'))
    return pkg.version ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 *  semver  prerelease  beta.20
 * @returns  -1 (a < b), 0 (a == b), 1 (a > b)
 */
const compareVersions = (a: string, b: string): number => {
  const [coreA, preA] = a.split('-', 2)
  const [coreB, preB] = b.split('-', 2)

  const partsA = coreA.split('.').map(Number)
  const partsB = coreB.split('.').map(Number)

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const na = partsA[i] ?? 0
    const nb = partsB[i] ?? 0
    if (na > nb) return 1
    if (na < nb) return -1
  }

  if (!preA && !preB) return 0
  if (!preA && preB) return 1   // 1.0.0 > 1.0.0-beta.x
  if (preA && !preB) return -1  // 1.0.0-beta.x < 1.0.0

  const segsA = preA!.split('.')
  const segsB = preB!.split('.')
  for (let i = 0; i < Math.max(segsA.length, segsB.length); i++) {
    const sa = segsA[i] ?? ''
    const sb = segsB[i] ?? ''
    const na = Number(sa)
    const nb = Number(sb)
    if (!isNaN(na) && !isNaN(nb)) {
      if (na > nb) return 1
      if (na < nb) return -1
    } else {
      if (sa > sb) return 1
      if (sa < sb) return -1
    }
  }
  return 0
}

export class VersionGate {
  private policy: VersionPolicy | null = null
  private clientVersion: string

  constructor() {
    this.clientVersion = getClientVersion()
    log.info('VersionGate initialized', { clientVersion: this.clientVersion })
  }

  update(policy: VersionPolicy | null): void {
    if (!policy?.minClientVersion) {
      this.policy = null
      return
    }
    this.policy = policy
    log.info('Version policy updated', { minClientVersion: policy.minClientVersion, clientVersion: this.clientVersion })
  }

  isBlocked(): boolean {
    if (!this.policy?.minClientVersion) return false
    if (this.clientVersion === 'unknown') return false
    return compareVersions(this.clientVersion, this.policy.minClientVersion) < 0
  }

  getPolicy(): VersionPolicy | null {
    return this.policy
  }

  getClientVersion(): string {
    return this.clientVersion
  }
}
