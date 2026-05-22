/**
 * ShellManager — WebIDE  shell
 *
 *  StreamJsonManager  CLI session JSONL Activity
 *  spawn  shell →  input/output/resize →
 */

import * as pty from 'node-pty'
import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'
import { existsSync } from 'fs'
import { createLogger } from '../lib/logger'

const log = createLogger('ShellManager')

export interface ShellSession {
  id: string
  pty: pty.IPty
  cwd: string
  startTime: number
  bufferedOutput?: string
}

interface PrecreatedShell {
  session: ShellSession
  bufferedOutput: string[]
  timer: ReturnType<typeof setTimeout>
}

export class ShellManager extends EventEmitter {
  /** connectionId → shellId → ShellSession */
  private sessions = new Map<string, Map<string, ShellSession>>()
  /** connectionId → PrecreatedShell */
  private precreated = new Map<string, PrecreatedShell>()

  private static readonly PRECREATE_TTL = 30_000

  create(connectionId: string, cwd: string, cols = 80, rows = 24): ShellSession {
    const pre = this.precreated.get(connectionId)
    if (pre) {
      clearTimeout(pre.timer)
      this.precreated.delete(connectionId)
      const { session, bufferedOutput } = pre

      if (!this.sessions.has(connectionId)) {
        this.sessions.set(connectionId, new Map())
      }
      this.sessions.get(connectionId)!.set(session.id, session)

      if (session.pty.cols !== cols || session.pty.rows !== rows) {
        session.pty.resize(cols, rows)
      } else {
        session.bufferedOutput = bufferedOutput.join('')
      }

      log.info('Shell reused from precreated', { shellId: session.id, cwd: session.cwd })
      return session
    }

    const shellId = randomUUID()

    if (!existsSync(cwd)) {
      cwd = process.env.HOME || process.cwd()
      log.warn('Shell cwd not found, fallback', { cwd })
    }

    const shell = process.env.SHELL || '/bin/zsh'
    const isZsh = shell.endsWith('/zsh')
    const shellArgs = isZsh ? ['-l', '+o', 'promptsp'] : ['-l']

    const ptyProcess = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        LANG: process.env.LANG || 'en_US.UTF-8',
        LC_ALL: process.env.LC_ALL || process.env.LANG || 'en_US.UTF-8',
        ...(!process.env.EDITOR && !process.env.VISUAL ? { EDITOR: 'nano', GIT_EDITOR: 'nano' } : {}),
      },
    })

    const session: ShellSession = { id: shellId, pty: ptyProcess, cwd, startTime: Date.now() }

    if (!this.sessions.has(connectionId)) {
      this.sessions.set(connectionId, new Map())
    }
    this.sessions.get(connectionId)!.set(shellId, session)

    ptyProcess.onData((data) => {
      this.emit('output', { connectionId, shellId, data })
    })

    ptyProcess.onExit(({ exitCode }) => {
      log.info('Shell exited', { shellId, exitCode })
      this.sessions.get(connectionId)?.delete(shellId)
      this.emit('exit', { connectionId, shellId, exitCode: exitCode ?? 0 })
    })

    log.info('Shell created', { shellId, cwd, shell, pid: ptyProcess.pid })
    return session
  }

  write(connectionId: string, shellId: string, data: string): void {
    const session = this.sessions.get(connectionId)?.get(shellId)
    if (!session) return
    session.pty.write(data)
  }

  resize(connectionId: string, shellId: string, cols: number, rows: number): void {
    const session = this.sessions.get(connectionId)?.get(shellId)
    if (!session) return
    session.pty.resize(cols, rows)
  }

  destroy(connectionId: string, shellId: string): void {
    const session = this.sessions.get(connectionId)?.get(shellId)
    if (!session) return
    session.pty.kill()
    this.sessions.get(connectionId)?.delete(shellId)
    log.info('Shell destroyed', { shellId })
  }

  precreate(connectionId: string, cwd: string, cols = 80, rows = 24): string {
    this.disposePrecreated(connectionId)

    if (!existsSync(cwd)) {
      cwd = process.env.HOME || process.cwd()
      log.warn('Precreate: cwd not found, fallback', { cwd })
    }

    const shell = process.env.SHELL || '/bin/zsh'
    const isZsh = shell.endsWith('/zsh')
    const shellArgs = isZsh ? ['-l', '+o', 'promptsp'] : ['-l']
    const shellId = randomUUID()

    const ptyProcess = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        LANG: process.env.LANG || 'en_US.UTF-8',
        LC_ALL: process.env.LC_ALL || process.env.LANG || 'en_US.UTF-8',
      },
    })

    const session: ShellSession = { id: shellId, pty: ptyProcess, cwd, startTime: Date.now() }
    const bufferedOutput: string[] = []

    ptyProcess.onData((data) => {
      const pre = this.precreated.get(connectionId)
      if (pre && pre.session.id === shellId) {
        pre.bufferedOutput.push(data)
      } else {
        this.emit('output', { connectionId, shellId, data })
      }
    })

    ptyProcess.onExit(({ exitCode }) => {
      log.info('Precreated shell exited', { shellId, exitCode })
      const pre = this.precreated.get(connectionId)
      if (pre && pre.session.id === shellId) {
        clearTimeout(pre.timer)
        this.precreated.delete(connectionId)
      }
      this.sessions.get(connectionId)?.delete(shellId)
      this.emit('exit', { connectionId, shellId, exitCode: exitCode ?? 0 })
    })

    const timer = setTimeout(() => {
      log.info('Precreated shell TTL expired, killing', { shellId })
      this.disposePrecreated(connectionId)
    }, ShellManager.PRECREATE_TTL)

    this.precreated.set(connectionId, { session, bufferedOutput, timer })
    log.info('Shell precreated', { shellId, cwd, shell, pid: ptyProcess.pid })
    return shellId
  }

  private disposePrecreated(connectionId: string): void {
    const pre = this.precreated.get(connectionId)
    if (!pre) return
    clearTimeout(pre.timer)
    try { pre.session.pty.kill() } catch {}
    this.precreated.delete(connectionId)
    log.info('Precreated shell disposed', { shellId: pre.session.id })
  }

  cleanupConnection(connectionId: string): void {
    const shells = this.sessions.get(connectionId)
    if (!shells) return
    for (const [shellId, session] of shells) {
      log.info('Cleanup shell on disconnect', { shellId })
      session.pty.kill()
    }
    this.sessions.delete(connectionId)
    this.disposePrecreated(connectionId)
  }
}
