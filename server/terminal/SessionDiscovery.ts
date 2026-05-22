/**
 * SessionDiscovery - CLI Session
 *
 *  session  Agent
 *  CLI provider  SessionDiscoveryStreamJsonManager
 *
 *  CLI provider
 * 1.  SessionDiscovery
 * 2.  createSessionDiscovery()
 */

import { existsSync, readdirSync, statSync, watch, type FSWatcher } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { OutputParser } from './OutputParser'
import { codexOutputParser } from './CodexParser'
import type { CliProvider } from '../config/types'
import { createLogger } from '../lib/logger'
import { cwdToClaudeProjectKey } from '../../shared/projectKey'

const log = createLogger('SessionDiscovery')

export interface SessionDiscoveryResult {
  sessionId: string
  filePath?: string
  parser?: OutputParser
}

export interface SessionDiscovery {
  watch(cwd: string, spawnedAt: number, onFound: (result: SessionDiscoveryResult) => void): void
  stop(): void
  isFound(): boolean
}

/**  provider  SessionDiscovery */
export const createSessionDiscovery = (provider: CliProvider, sessionId: string): SessionDiscovery => {
  switch (provider) {
    case 'claude':
      return new ClaudeSessionDiscovery(sessionId)
    case 'codex':
      return new CodexSessionDiscovery(sessionId)
    case 'acp':
      return new ClaudeSessionDiscovery(sessionId)
    case 'qoder':
      return new ClaudeSessionDiscovery(sessionId, (cwd) => {
        const projectKey = cwd.replace(/[/.]/g, '-')
        return join(homedir(), '.qoder', 'projects', projectKey, 'transcript')
      })
    default: {
      const _exhaustive: never = provider
      throw new Error(`Unknown CLI provider: ${_exhaustive}`)
    }
  }
}

// ── Claude Session Discovery ──

class ClaudeSessionDiscovery implements SessionDiscovery {
  private found = false
  private sessionWatcher: FSWatcher | null = null
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private retryTimer: ReturnType<typeof setInterval> | null = null

  constructor(
    private ownerSessionId: string,
    private dirBuilder?: (cwd: string) => string,
  ) {}

  watch(cwd: string, spawnedAt: number, onFound: (result: SessionDiscoveryResult) => void): void {
    const claudeProjectDir = this.dirBuilder
      ? this.dirBuilder(cwd)
      : join(homedir(), '.claude', 'projects', cwdToClaudeProjectKey(cwd))

    const baselineFiles = new Set<string>()
    const dirExists = existsSync(claudeProjectDir)
    try {
      if (dirExists) {
        for (const f of readdirSync(claudeProjectDir)) {
          if (f.endsWith('.jsonl')) baselineFiles.add(f)
        }
      }
    } catch { /* ignore */ }
    log.debug('watchClaudeSession', { sid: this.ownerSessionId, dir: claudeProjectDir, exists: dirExists, baseline: baselineFiles.size, spawnedAt })

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

    const handleFound = (sid: string): void => {
      this.found = true
      log.info('Captured Claude session ID', { sid: this.ownerSessionId, cliSessionId: sid })
      if (this.sessionWatcher) { this.sessionWatcher.close(); this.sessionWatcher = null }
      this.clearTimers()
      onFound({ sessionId: sid })
    }

    /**
     *  baseline  session
     *
     * 1. mtime  —  spawnedAt 1s
     * 2.  —  mtime  PTY
     */
    const scanForNewSession = (): boolean => {
      if (this.found) return true
      try {
        const candidates: Array<{ sid: string; mtime: number }> = []

        for (const f of readdirSync(claudeProjectDir)) {
          if (!f.endsWith('.jsonl') || baselineFiles.has(f)) continue
          const sid = f.replace('.jsonl', '')
          if (!UUID_RE.test(sid)) continue

          try {
            const mtime = statSync(join(claudeProjectDir, f)).mtimeMs
            if (mtime < spawnedAt - 1000) continue
            candidates.push({ sid, mtime })
          } catch { continue }
        }

        if (candidates.length === 0) return false

        candidates.sort((a, b) => b.mtime - a.mtime)
        handleFound(candidates[0].sid)
        return true
      } catch { /* ignore */ }
      return false
    }

    const setupWatcher = (): boolean => {
      if (!existsSync(claudeProjectDir)) return false
      if (this.found) return true

      if (scanForNewSession()) return true

      log.debug('Setting up fs.watch', { sid: this.ownerSessionId, dir: claudeProjectDir })
      try {
        this.sessionWatcher = watch(claudeProjectDir, (event, filename) => {
          if (this.found || !filename || !filename.endsWith('.jsonl')) return
          if (baselineFiles.has(filename)) return

          const sid = filename.replace('.jsonl', '')
          if (!UUID_RE.test(sid)) return

          try {
            const mtime = statSync(join(claudeProjectDir, filename)).mtimeMs
            if (mtime < spawnedAt - 1000) return
          } catch { return }

          handleFound(sid)
        })
        return true
      } catch (err) {
        log.warn('Failed to watch Claude session dir', { sid: this.ownerSessionId, error: err instanceof Error ? err.message : String(err) })
        return false
      }
    }

    const startPolling = (): void => {
      if (this.pollTimer) return
      this.pollTimer = setInterval(() => {
        if (this.found) {
          this.clearTimers()
          return
        }
        scanForNewSession()
      }, 500)
    }

    if (setupWatcher()) {
      if (!this.found) startPolling()
      return
    }

    log.info('Claude project dir not found, will retry', { sid: this.ownerSessionId, dir: claudeProjectDir })
    let retries = 0
    const maxRetries = 20
    this.retryTimer = setInterval(() => {
      retries++
      if (this.found || retries >= maxRetries) {
        this.clearTimers()
        if (!this.found) startPolling()
        return
      }
      if (setupWatcher()) {
        log.info('Claude project dir found on retry', { sid: this.ownerSessionId, retries })
        if (this.retryTimer) { clearInterval(this.retryTimer); this.retryTimer = null }
        if (!this.found) startPolling()
      }
    }, 500)
  }

  stop(): void {
    if (this.sessionWatcher) { this.sessionWatcher.close(); this.sessionWatcher = null }
    this.clearTimers()
  }

  isFound(): boolean {
    return this.found
  }

  private clearTimers(): void {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null }
    if (this.retryTimer) { clearInterval(this.retryTimer); this.retryTimer = null }
  }
}

// ── Codex Session Discovery ──

class CodexSessionDiscovery implements SessionDiscovery {
  private found = false
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private retryTimer: ReturnType<typeof setInterval> | null = null

  constructor(private ownerSessionId: string) {}

  watch(_cwd: string, spawnedAt: number, onFound: (result: SessionDiscoveryResult) => void): void {
    const sessionsBaseDir = join(homedir(), '.codex', 'sessions')

    const ROLLOUT_RE = /^rollout-.+-([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\.jsonl$/

    const getDayDir = () => {
      const d = new Date()
      return join(
        sessionsBaseDir,
        String(d.getFullYear()),
        String(d.getMonth() + 1).padStart(2, '0'),
        String(d.getDate()).padStart(2, '0'),
      )
    }

    let dayDir = getDayDir()
    const baselineFiles = new Set<string>()

    try {
      if (existsSync(dayDir)) {
        for (const f of readdirSync(dayDir)) {
          if (ROLLOUT_RE.test(f)) baselineFiles.add(f)
        }
      }
    } catch { /* ignore */ }

    log.debug('watchCodexSession', { sid: this.ownerSessionId, dir: dayDir, baseline: baselineFiles.size })

    const scanForNewRollout = (): boolean => {
      if (this.found) return true

      const currentDayDir = getDayDir()
      if (currentDayDir !== dayDir) {
        dayDir = currentDayDir
        baselineFiles.clear()
      }

      if (!existsSync(dayDir)) return false

      try {
        const candidates: Array<{ threadId: string; filePath: string; mtime: number }> = []
        for (const f of readdirSync(dayDir)) {
          if (baselineFiles.has(f)) continue
          const match = f.match(ROLLOUT_RE)
          if (!match) continue
          try {
            const fp = join(dayDir, f)
            const mtime = statSync(fp).mtimeMs
            if (mtime < spawnedAt - 1000) continue
            candidates.push({ threadId: match[1], filePath: fp, mtime })
          } catch { continue }
        }
        if (candidates.length === 0) return false

        candidates.sort((a, b) => b.mtime - a.mtime)
        const best = candidates[0]
        log.info('Captured Codex thread', { sid: this.ownerSessionId, threadId: best.threadId })

        this.found = true
        this.clearTimers()
        onFound({ sessionId: best.threadId, filePath: best.filePath, parser: codexOutputParser })
        return true
      } catch { return false }
    }

    if (scanForNewRollout()) return

    this.pollTimer = setInterval(() => {
      if (this.found) {
        this.clearTimers()
        return
      }
      scanForNewRollout()
    }, 500)

    if (!existsSync(dayDir)) {
      let retries = 0
      const maxRetries = 20
      this.retryTimer = setInterval(() => {
        retries++
        if (this.found || retries >= maxRetries) {
          this.clearTimers()
          return
        }
        if (existsSync(getDayDir())) {
          log.info('Codex sessions dir found on retry', { sid: this.ownerSessionId, retries })
          if (this.retryTimer) { clearInterval(this.retryTimer); this.retryTimer = null }
          scanForNewRollout()
        }
      }, 500)
    }
  }

  stop(): void {
    this.clearTimers()
  }

  isFound(): boolean {
    return this.found
  }

  private clearTimers(): void {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null }
    if (this.retryTimer) { clearInterval(this.retryTimer); this.retryTimer = null }
  }
}
