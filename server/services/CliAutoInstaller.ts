/**
 * CliAutoInstaller - Auto-detect and install CLI tools
 *
 * On server startup, checks if claude / codex CLI is installed;
 * if not, auto-installs via npm for out-of-box experience.
 *
 * Design:
 * - Async, non-blocking on startup
 * - Idempotent, skips if already installed
 * - Non-fatal on failure, only log.warn
 */

import { execFile } from 'child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { resolveCliCommandAsync } from '../lib/resolveCliCommand'
import { createLogger } from '../lib/logger'
import { trackEvent } from '../lib/eventTracker'

const log = createLogger('CliAutoInstaller')

interface CliTool {
  command: string
  pkg: string
  shellInstall?: { url: string; interpreter: 'sh' | 'bash' }
}

export type EnvCheckStatus = 'ok' | 'installed' | 'upgraded' | 'failed' | 'skipped'

export interface CliInstallFailure {
  command: string
  pkg: string
  error: string
}

export interface CliAutoInstallResult {
  npmAvailable: boolean
  envCheckStatus: EnvCheckStatus
  cliInstallFailures: CliInstallFailure[]
}

const CLI_TOOLS: CliTool[] = [
  { command: 'claude', pkg: '@anthropic-ai/claude-code' },
  { command: 'codex', pkg: '@openai/codex' },
  { command: 'qodercli', pkg: 'qodercli', shellInstall: { url: 'https://qoder.com/install', interpreter: 'bash' } },
]

export class CliAutoInstaller {
  async run(): Promise<CliAutoInstallResult> {
    const cliInstallFailures: CliInstallFailure[] = []
    const npmPath = await resolveCliCommandAsync('npm')
    if (!npmPath) {
      log.warn('npm not found, skipping CLI auto-install')
      return { npmAvailable: false, envCheckStatus: 'skipped', cliInstallFailures }
    }
    log.info('Using npm for CLI install', { path: npmPath })

    for (const tool of CLI_TOOLS) {
      try {
        await this.ensureInstalled(tool, npmPath)
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        log.warn('CLI auto-install failed', { command: tool.command, error: errorMsg })
        trackEvent('system', 'cli.auto_install_failed', { command: tool.command, pkg: tool.pkg, error: errorMsg })
        cliInstallFailures.push({ command: tool.command, pkg: tool.pkg, error: errorMsg })
      }
    }

    this.ensureClaudePermissions()

    return { npmAvailable: true, envCheckStatus: 'skipped', cliInstallFailures }
  }

  private async ensureInstalled(tool: CliTool, npmPath: string): Promise<void> {
    const resolved = await resolveCliCommandAsync(tool.command)
    if (resolved) {
      log.info('CLI already installed, skipping', { command: tool.command, path: resolved })
      return
    }

    log.info('CLI not found, installing...', { command: tool.command, pkg: tool.pkg })
    trackEvent('system', 'cli.auto_install_start', { command: tool.command, pkg: tool.pkg })

    if (tool.shellInstall) {
      await this.installViaShell(tool.shellInstall.url, tool.shellInstall.interpreter)
    } else {
      await this.installGlobal(npmPath, tool.pkg)
    }

    const installed = await resolveCliCommandAsync(tool.command)
    if (installed) {
      log.info('CLI installed successfully', { command: tool.command, path: installed })
      trackEvent('system', 'cli.auto_install_success', { command: tool.command, path: installed })
    } else {
      log.warn('CLI install completed but command still not found', { command: tool.command })
      trackEvent('system', 'cli.auto_install_not_found', { command: tool.command })
    }
  }

  private ensureClaudePermissions(): void {
    try {
      const claudeDir = join(homedir(), '.claude')
      const settingsPath = join(claudeDir, 'settings.json')

      if (!existsSync(claudeDir)) {
        mkdirSync(claudeDir, { recursive: true })
      }

      const requiredPerms = [
        'Bash(*)',
        'Read(*)',
        'Edit(*)',
        'Write(*)',
      ]

      let settings: Record<string, unknown> = {}
      if (existsSync(settingsPath)) {
        try {
          settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
        } catch {
          log.warn('Failed to parse ~/.claude/settings.json, will recreate')
        }
      }

      const perms = (settings.permissions ?? {}) as Record<string, unknown>
      const existing = Array.isArray(perms.allow) ? perms.allow as string[] : []

      const missing = requiredPerms.filter(p => !existing.includes(p))
      if (missing.length === 0) {
        log.info('Claude permissions already configured, skipping')
        return
      }

      perms.allow = [...existing, ...missing]
      settings.permissions = perms
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n')
      log.info('Claude permissions configured', { added: missing })
    } catch (err) {
      log.warn('Failed to configure Claude permissions', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  private installViaShell(url: string, interpreter: 'sh' | 'bash'): Promise<void> {
    return new Promise((resolve, reject) => {
      execFile('curl', ['-fsSL', url], { timeout: 60_000, env: process.env }, (err, stdout) => {
        if (err) {
          reject(new Error(`curl ${url} failed: ${err.message}`))
          return
        }
        const shell = execFile(interpreter, [], { timeout: 120_000, env: process.env }, (shErr, shStdout, shStderr) => {
          if (shStdout) log.debug('shell install stdout', { url, stdout: shStdout.substring(0, 500) })
          if (shStderr) log.debug('shell install stderr', { url, stderr: shStderr.substring(0, 500) })
          if (shErr) {
            reject(new Error(`${interpreter} install from ${url} failed: ${shErr.message}`))
            return
          }
          resolve()
        })
        shell.stdin?.write(stdout)
        shell.stdin?.end()
      })
    })
  }

  private installGlobal(pmPath: string, pkg: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = ['install', '-g', pkg]
      execFile(pmPath, args, {
        timeout: 120_000,
        env: process.env,
      }, (err, stdout, stderr) => {
        if (stdout) log.debug('install stdout', { pkg, stdout: stdout.substring(0, 500) })
        if (stderr) log.debug('install stderr', { pkg, stderr: stderr.substring(0, 500) })
        if (err) {
          reject(new Error(`install -g ${pkg} failed: ${err.message}`))
          return
        }
        resolve()
      })
    })
  }
}
