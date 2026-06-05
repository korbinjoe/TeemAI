/**
 * update  —
 *
 * teemai update
 * teemai update check
 * teemai update status
 * teemai update rollback
 */

import { Command } from 'commander'
import chalk from 'chalk'
import { join } from 'path'
import {
  existsSync, mkdirSync, readlinkSync, symlinkSync,
  unlinkSync, readdirSync, lstatSync, rmSync, writeFileSync,
  createWriteStream,
} from 'fs'
import { createHash } from 'crypto'
import { pipeline } from 'stream/promises'
import { createGunzip } from 'zlib'
import { getDeviceConfig, type UpdateCheckResult } from '../lib/bundle-loader.js'
import { PORTS } from '../../shared/ports'
import { TEEMAI_HOME } from '../../shared/teemai-home'
const VERSIONS_DIR = join(TEEMAI_HOME, 'versions')
const CURRENT_LINK = join(TEEMAI_HOME, 'current')
const DOWNLOADS_DIR = join(TEEMAI_HOME, 'downloads')

const DEFAULT_UPDATE_SERVER = process.env.TEEMAI_UPDATE_SERVER ?? `http://localhost:${PORTS.DEV_SERVER}`

export const updateCommand = new Command('update')
  .description('Check and install updates')
  .option('--server <url>', 'Update server address', DEFAULT_UPDATE_SERVER)
  .action(async (options) => {
    console.log(chalk.cyan('\n  Checking for updates...\n'))

    const result = await checkUpdate(options.server)
    if (!result || result.action === 'none') {
      console.log(chalk.green('  ✓ Already up to date'))
      printCurrentVersion()
      return
    }

    const { target } = result
    if (!target) return

    const actionLabel = result.action === 'rollback' ? 'Rollback' : 'Update'
    console.log(chalk.yellow(`  FoundAvailable${actionLabel}: v${target.version}`))
    console.log(chalk.dim(`  ${result.message}\n`))

    const success = await downloadAndInstall(target.version, target.manifest as Record<string, unknown>, options.server)
    if (success) {
      console.log(chalk.green(`\n  ✓ ${actionLabel}Success！Version: v${target.version}`))
      console.log(chalk.dim('  Takes effect after restart\n'))
    } else {
      console.log(chalk.red(`\n  ✗ ${actionLabel}failed. Please retry\n`))
      process.exitCode = 1
    }
  })

// ── Subcommand：check ──
updateCommand
  .command('check')
  .description('Check if updates are available')
  .option('--server <url>', 'Update server address', DEFAULT_UPDATE_SERVER)
  .action(async (options) => {
    const result = await checkUpdate(options.server)
    if (!result || result.action === 'none') {
      console.log(chalk.green('\n  ✓ Already up to date\n'))
    } else {
      const label = result.action === 'rollback' ? 'Rollback' : 'Update'
      console.log(chalk.yellow(`\n  ${label} available: v${result.target?.version}`))
      console.log(chalk.dim(`  ${result.message}`))
      console.log(chalk.dim(`  Run ${chalk.bold('teemai update')} install\n`))
    }
    printCurrentVersion()
  })

// ── Subcommand：status ──
updateCommand
  .command('status')
  .description('Show local version status')
  .action(() => {
    const currentVersion = getCurrentVersion()
    const installed = getLocalVersions()

    console.log(chalk.bold('\n  Version Status:\n'))
    console.log(`  Current version:  ${currentVersion ? chalk.green(`v${currentVersion}`) : chalk.dim('not set')}`)
    console.log(`  Installed versions: ${installed.length > 0 ? installed.map((v) => `v${v}`).join(', ') : chalk.dim('none')}`)
    console.log(`  Version directory:  ${chalk.dim(VERSIONS_DIR)}`)
    console.log()
  })

// ── Subcommand：rollback ──
updateCommand
  .command('rollback')
  .description('Roll back to previous version')
  .action(() => {
    const currentVersion = getCurrentVersion()
    const installed = getLocalVersions()

    if (installed.length < 2) {
      console.log(chalk.red('\n  ✗ No version to rollback to\n'))
      process.exitCode = 1
      return
    }

    const currentIdx = installed.indexOf(currentVersion ?? '')
    const previousVersion = currentIdx > 0
      ? installed[currentIdx - 1]
      : installed.find((v) => v !== currentVersion)

    if (!previousVersion) {
      console.log(chalk.red('\n  ✗ No version to rollback to\n'))
      process.exitCode = 1
      return
    }

    console.log(chalk.yellow(`\n  Rollback: v${currentVersion} → v${previousVersion}`))

    const success = switchVersion(previousVersion)
    if (success) {
      console.log(chalk.green(`  ✓ Rolled back to v${previousVersion}`))
      console.log(chalk.dim('  Takes effect after restart\n'))
    } else {
      console.log(chalk.red('  ✗ Rollback failed\n'))
      process.exitCode = 1
    }
  })

const checkUpdate = async (serverUrl: string): Promise<UpdateCheckResult | null> => {
  const config = getDeviceConfig()
  const currentVersion = getCurrentVersion() ?? '0.0.0'

  try {
    const params = new URLSearchParams({
      deviceId: config.deviceId,
      clientType: 'cli',
      currentVersion,
      shellVersion: config.shellVersion,
      platform: `${process.platform}-${process.arch}`,
    })

    const res = await fetch(`${serverUrl}/api/update/check?${params}`)
    if (!res.ok) {
      console.log(chalk.red(`  ✗ Update server returned error: ${res.status}`))
      return null
    }

    return await res.json() as UpdateCheckResult
  } catch (err) {
    console.log(chalk.red(`  ✗ Cannot connect to update server: ${serverUrl}`))
    console.log(chalk.dim(`    ${err instanceof Error ? err.message : String(err)}`))
    return null
  }
}

const downloadAndInstall = async (
  version: string,
  manifest: Record<string, unknown>,
  _serverUrl: string,
): Promise<boolean> => {
  const versionDir = join(VERSIONS_DIR, version)
  const downloadDir = join(DOWNLOADS_DIR, version)

  if (existsSync(versionDir)) {
    console.log(chalk.dim(`  Version v${version} already exists, switching directly`))
    return switchVersion(version)
  }

  ensureDir(downloadDir)
  ensureDir(versionDir)

  const bundles = manifest.bundles as Record<string, { url: string, sha256: string, size: number }> | undefined
  if (!bundles) {
    console.log(chalk.red('  ✗ manifest missing bundles info'))
    return false
  }

  for (const [name, bundle] of Object.entries(bundles)) {
    const targetDir = join(versionDir, name)
    ensureDir(targetDir)

    console.log(chalk.dim(`  Download ${name} bundle...`))

    const downloadPath = join(downloadDir, `${name}.tar.gz`)

    try {
      const res = await fetch(bundle.url)
      if (!res.ok || !res.body) {
        console.log(chalk.red(`  ✗ Download ${name} Failed: ${res.status}`))
        cleanup(downloadDir, versionDir)
        return false
      }

      const fileStream = createWriteStream(downloadPath)
      await pipeline(res.body, fileStream)

      // SHA256 Validate
      const { readFileSync } = require('fs')
      const data = readFileSync(downloadPath)
      const hash = createHash('sha256').update(data).digest('hex')
      if (hash !== bundle.sha256) {
        console.log(chalk.red(`  ✗ ${name} SHA256 ValidateFailed`))
        console.log(chalk.dim(`    Expected: ${bundle.sha256}`))
        console.log(chalk.dim(`    Actual: ${hash}`))
        cleanup(downloadDir, versionDir)
        return false
      }

      const { execSync } = require('child_process')
      execSync(`tar -xzf "${downloadPath}" -C "${targetDir}"`, { stdio: 'pipe' })

      console.log(chalk.green(`  ✓ ${name} installDone`))
    } catch (err) {
      console.log(chalk.red(`  ✗ ${name} Install failed: ${err instanceof Error ? err.message : String(err)}`))
      cleanup(downloadDir, versionDir)
      return false
    }
  }

  // Write manifest
  writeFileSync(
    join(versionDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8',
  )

  const switched = switchVersion(version)

  cleanup(downloadDir)

  if (switched) cleanOldVersions()

  return switched
}

const getCurrentVersion = (): string | null => {
  if (!existsSync(CURRENT_LINK)) return null
  try {
    const target = readlinkSync(CURRENT_LINK)
    return target.split('/').pop() ?? null
  } catch {
    return null
  }
}

const getLocalVersions = (): string[] => {
  if (!existsSync(VERSIONS_DIR)) return []
  return readdirSync(VERSIONS_DIR)
    .filter((name) => {
      try { return lstatSync(join(VERSIONS_DIR, name)).isDirectory() } catch { return false }
    })
    .sort(compareVersions)
}

const switchVersion = (version: string): boolean => {
  const versionDir = join(VERSIONS_DIR, version)
  if (!existsSync(versionDir)) return false

  try {
    const tmpLink = `${CURRENT_LINK}.tmp`
    if (existsSync(tmpLink)) unlinkSync(tmpLink)
    symlinkSync(versionDir, tmpLink)

    const { renameSync } = require('fs')
    renameSync(tmpLink, CURRENT_LINK)
    return true
  } catch {
    return false
  }
}

const cleanOldVersions = (maxKeep = 2) => {
  const versions = getLocalVersions()
  const current = getCurrentVersion()
  if (versions.length <= maxKeep) return

  const sorted = [...versions].sort((a, b) => compareVersions(b, a))
  const toRemove = sorted.slice(maxKeep).filter((v) => v !== current)

  for (const version of toRemove) {
    try {
      rmSync(join(VERSIONS_DIR, version), { recursive: true, force: true })
    } catch { /* ignore */ }
  }
}

const ensureDir = (dir: string) => {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

const cleanup = (...dirs: string[]) => {
  for (const dir of dirs) {
    try { rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}

const printCurrentVersion = () => {
  const version = getCurrentVersion()
  if (version) {
    console.log(chalk.dim(`  CurrentVersion: v${version}\n`))
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
