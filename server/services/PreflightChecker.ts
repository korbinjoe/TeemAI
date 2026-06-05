/**
 * PreflightChecker -
 *
 *
 * 1. Node.js node-pty  >= 18
 * 2. CLI claude / codex
 * 3. npm
 */

import { execFile } from 'child_process'
import { existsSync, statfsSync } from 'fs'
import { homedir } from 'os'
import { TEEMAI_HOME } from '../config/paths'
import { resolveCliCommandAsync } from '../lib/resolveCliCommand'
import { createLogger } from '../lib/logger'
import type { CliInstallFailure } from './CliAutoInstaller'

const log = createLogger('PreflightChecker')

export type CheckStatus = 'pass' | 'warn' | 'fail'

export interface CheckItem {
  id: string
  label: string
  status: CheckStatus
  current?: string
  required?: string
  hint?: string
  fixCommand?: string
  fixUrl?: string
}

export interface PreflightResult {
  timestamp: number
  overall: CheckStatus
  items: CheckItem[]
}

const NODE_MIN_VERSION = 18

export class PreflightChecker {
  constructor(private readonly cliInstallFailures: CliInstallFailure[] = []) {}

  async run(): Promise<PreflightResult> {
    const items = await Promise.all([
      this.checkNodeVersion(),
      this.checkCliTool('claude', { pkg: '@anthropic-ai/claude-code' }),
      this.checkCliTool('codex', { pkg: '@openai/codex' }),
      this.checkPackageManager(),
      this.checkDiskSpace(),
    ])

    const overall: CheckStatus = items.some((i) => i.status === 'fail')
      ? 'fail'
      : items.some((i) => i.status === 'warn')
        ? 'warn'
        : 'pass'

    const result: PreflightResult = {
      timestamp: Date.now(),
      overall,
      items,
    }

    log.info('Preflight check complete', {
      overall,
      pass: items.filter((i) => i.status === 'pass').length,
      warn: items.filter((i) => i.status === 'warn').length,
      fail: items.filter((i) => i.status === 'fail').length,
    })

    return result
  }

  private async checkNodeVersion(): Promise<CheckItem> {
    try {
      const version = process.versions.node
      const major = parseInt(version.split('.')[0], 10)
      return {
        id: 'node-version',
        label: 'Node.js',
        status: major >= NODE_MIN_VERSION ? 'pass' : 'fail',
        current: `v${version}`,
        required: `>= v${NODE_MIN_VERSION}`,
        hint: major < NODE_MIN_VERSION ? 'Requires Node.js 18+ for node-pty and ES Modules' : undefined,
        fixUrl: 'https://nodejs.org/',
      }
    } catch {
      return {
        id: 'node-version',
        label: 'Node.js',
        status: 'fail',
        current: 'not detected',
        required: `>= v${NODE_MIN_VERSION}`,
        fixUrl: 'https://nodejs.org/',
      }
    }
  }

  private async checkCliTool(
    command: string,
    source: { pkg: string },
  ): Promise<CheckItem> {
    const fixCommand = `npm install -g ${source.pkg}`

    const resolved = await resolveCliCommandAsync(command)
    if (resolved) {
      const version = await this.getCommandVersion(resolved)
      return {
        id: `cli-${command}`,
        label: command,
        status: 'pass',
        current: version || resolved,
      }
    }
    const installFailure = this.cliInstallFailures.find(f => f.command === command)
    if (installFailure) {
      return {
        id: `cli-${command}`,
        label: command,
        status: 'fail',
        current: 'auto-install failed',
        hint: `Auto-install failed: ${installFailure.error.slice(0, 200)}. Please install manually:`,
        fixCommand,
      }
    }
    return {
      id: `cli-${command}`,
      label: command,
      status: 'warn',
      current: 'not installed',
      hint: `Not installed. Install via:`,
      fixCommand,
    }
  }

  private async checkPackageManager(): Promise<CheckItem> {
    const npm = await resolveCliCommandAsync('npm')
    if (!npm) {
      return {
        id: 'pkg-manager',
        label: 'Package Manager',
        status: 'fail',
        current: 'npm not found',
        hint: 'Installing Node.js includes npm',
        fixUrl: 'https://nodejs.org/',
      }
    }
    return {
      id: 'pkg-manager',
      label: 'Package Manager',
      status: 'pass',
      current: 'npm',
    }
  }

  private checkDiskSpace(): CheckItem {
    try {
      const checkPath = existsSync(TEEMAI_HOME) ? TEEMAI_HOME : homedir()
      const stats = statfsSync(checkPath)
      const availableGB = (stats.bavail * stats.bsize) / (1024 ** 3)
      const status: CheckStatus = availableGB < 1 ? 'fail' : availableGB < 5 ? 'warn' : 'pass'
      return {
        id: 'disk-space',
        label: 'Disk Space',
        status,
        current: `${availableGB.toFixed(1)} GB available`,
        required: '>= 5 GB',
        hint: status !== 'pass' ? 'Low disk space may cause issues' : undefined,
      }
    } catch {
      return {
        id: 'disk-space',
        label: 'Disk Space',
        status: 'warn',
        current: 'unable to detect',
      }
    }
  }

  private getCommandVersion(commandPath: string): Promise<string | null> {
    return new Promise((resolve) => {
      execFile(commandPath, ['--version'], { timeout: 5000 }, (err, stdout) => {
        if (err) { resolve(null); return }
        const version = stdout.trim().split('\n')[0]
        resolve(version || null)
      })
    })
  }
}
