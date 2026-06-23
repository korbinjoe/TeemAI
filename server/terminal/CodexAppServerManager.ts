/**
 * CodexAppServerManager - drives a long-lived `codex app-server --stdio` process
 * over newline-delimited JSON-RPC 2.0.
 *
 * Unlike StreamJsonManager (codex `exec --json`, one process per turn with no
 * text streaming), this keeps a single process across turns and consumes
 * token-level streaming notifications, giving the same live-text UX as Claude.
 *
 * Handshake: initialize → thread/start (or thread/resume when resuming) →
 * per-turn turn/start → stream notifications until turn/completed.
 *
 * Implements StreamDriver so the ACP adapter / registry / lifecycle stay
 * driver-agnostic.
 */

import { spawn, type ChildProcess } from 'child_process'
import { createInterface, type Interface as ReadlineInterface } from 'readline'
import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'
import { existsSync } from 'fs'
import { ActivityDeriver } from './ActivityDeriver'
import {
  createStreamParserState,
  type StreamParserState,
} from './StreamJsonParser'
import { handleAppServerNotification } from './CodexAppServerParser'
import type { ParsedMessage } from './ConversationParser'
import type { CliProvider } from '../config/types'
import { createLogger } from '../lib/logger'
import { trackEvent } from '../lib/eventTracker'
import { resolveCliCommandAsync, resolveInterpreter } from '../lib/resolveCliCommand'
import type { StreamDriver, StreamJsonOptions } from './StreamDriver'

const log = createLogger('CodexAppServerManager')

interface PendingTurnInput {
  message: string
}

export class CodexAppServerManager extends EventEmitter implements StreamDriver {
  private child: ChildProcess | null = null
  private readline: ReadlineInterface | null = null
  private sessionId: string
  private cliSessionId: string | null = null
  private provider: CliProvider = 'codex'
  private parserState: StreamParserState
  private activityDeriver: ActivityDeriver
  private startTime: number = 0

  private seq = 0
  private readonly pending = new Map<number, string>()
  private threadId: string | null = null
  private resumeThreadId: string | null = null
  private model: string | undefined
  private cwd: string = process.cwd()
  /** Turn inputs received before the thread handshake completed. */
  private readonly pendingTurns: PendingTurnInput[] = []
  private threadReady = false

  constructor(sessionId?: string) {
    super()
    this.sessionId = sessionId || randomUUID()
    this.parserState = createStreamParserState()
    this.activityDeriver = new ActivityDeriver()
    this.activityDeriver.on('activity', (state) => this.emit('activity', state))
  }

  async spawn(options: StreamJsonOptions): Promise<void> {
    if (this.child) {
      throw new Error('Codex app-server session already started')
    }

    const { command, args, env = {} } = options
    this.model = options.codex?.model
    let cwd = options.cwd || process.cwd()
    if (!existsSync(cwd)) {
      const fallbackCwd = process.cwd()
      log.warn('CWD does not exist, falling back', { sid: this.sessionId, cwd, fallback: fallbackCwd })
      cwd = fallbackCwd
    }
    this.cwd = cwd

    log.info('Spawning codex app-server process', { sid: this.sessionId, command, cwd, model: this.model })

    const resolvedCommand = await resolveCliCommandAsync(command)
    if (!resolvedCommand) {
      const error = new Error(`Command not found: ${command}. Please check if the command exists in PATH or provide an absolute path.`)
      log.error('Command not found', { sid: this.sessionId, command })
      throw error
    }

    const { command: spawnCommand, prependArgs } = resolveInterpreter(resolvedCommand)

    try {
      this.child = spawn(spawnCommand, [...prependArgs, ...args], {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...env },
      })

      this.startTime = Date.now()
      this.provider = options.provider || 'codex'

      this.readline = createInterface({ input: this.child.stdout! })
      this.readline.on('line', (line) => this.handleStdoutLine(line))

      this.child.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString().trim()
        if (text) {
          const level = /error|reconnect|disconnect|fail|rate.?limit|quota|unauthor|forbidden/i.test(text) ? 'warn' : 'info'
          log[level]('stderr', { sid: this.sessionId, text: text.slice(0, 500) })
        }
      })

      this.child.on('close', (exitCode, signal) => {
        const level = (exitCode === 0 || exitCode === null) ? 'info' : 'warn'
        log[level]('Process exited', { sid: this.sessionId, exitCode, signal })
        if (this.readline) {
          this.readline.close()
          this.readline = null
        }
        this.activityDeriver.onProcessExit(exitCode ?? 1, { treatSuccessAsTurnComplete: false })
        this.emit('exit', { exitCode, signal })
        this.child = null
        this.threadReady = false
      })

      this.child.on('error', (err) => {
        log.error('Process error', { sid: this.sessionId, error: err.message })
        trackEvent('agent', 'agent.stream_json_spawn_failed', { sessionId: this.sessionId, error: err.message })
        this.emit('exit', { exitCode: 1, signal: null })
        this.child = null
        this.threadReady = false
      })

      // Begin the JSON-RPC handshake.
      this.sendRequest('initialize', {
        clientInfo: { name: 'teemai', title: 'TeemAI', version: '1.0.0' },
        capabilities: { experimentalApi: true, requestAttestation: false },
      })

      log.info('Process started', { sid: this.sessionId, pid: this.child.pid })
      this.emit('started', { sessionId: this.sessionId, pid: this.child.pid })
    } catch (error) {
      log.error('Failed to spawn', { sid: this.sessionId, error: error instanceof Error ? error.message : String(error) })
      trackEvent('agent', 'agent.stream_json_spawn_failed', { sessionId: this.sessionId, error: error instanceof Error ? error.message : String(error) })
      throw error
    }
  }

  write(message: string, images?: Array<{ data: string; mediaType: string }>): void {
    if (!this.child || !this.child.stdin) {
      throw new Error('Codex app-server session not started')
    }
    if (images?.length) {
      log.warn('Codex app-server does not support image attachments; dropping', { sid: this.sessionId, count: images.length })
    }

    this.activityDeriver.onUserInput()

    if (!this.threadReady || !this.threadId) {
      this.pendingTurns.push({ message })
      log.debug('Queued turn input until thread is ready', { sid: this.sessionId })
      return
    }
    this.startTurn(message)
  }

  private startTurn(message: string): void {
    this.sendRequest('turn/start', {
      threadId: this.threadId,
      input: [{ type: 'text', text: message, text_elements: [] }],
    })
  }

  kill(signal: string = 'SIGTERM'): void {
    if (!this.child) {
      log.warn('Cannot kill: session not started', { sid: this.sessionId })
      return
    }
    log.info('Killing process', { sid: this.sessionId, signal })
    this.activityDeriver.destroy()
    if (this.readline) {
      this.readline.close()
      this.readline = null
    }
    this.child.kill(signal as NodeJS.Signals)
    this.child = null
    this.threadReady = false
  }

  getPid(): number | undefined {
    return this.child?.pid
  }

  getSessionId(): string {
    return this.sessionId
  }

  isAlive(): boolean {
    return this.child !== null
  }

  getUptime(): number {
    if (!this.child) return 0
    return Date.now() - this.startTime
  }

  getCliSessionId(): string | null {
    return this.cliSessionId
  }

  getProvider(): CliProvider {
    return this.provider
  }

  getCurrentMessages(): ParsedMessage[] | null {
    return this.parserState.messages.length > 0 ? [...this.parserState.messages] : null
  }

  isWatcherReady(): boolean {
    return true
  }

  /** Resume target — stored before spawn so the handshake issues thread/resume. */
  setCliSessionId(sid: string): void {
    this.resumeThreadId = sid
  }

  forceRedraw(): void { /* no-op */ }

  restartSessionFileWatcher(): void { /* no-op */ }

  getInspectState() {
    return {
      codexAppServer: {
        alive: this.isAlive(),
        pid: this.getPid() ?? null,
        spawnedAt: this.startTime || null,
        provider: this.provider,
        cliSessionId: this.cliSessionId,
        threadId: this.threadId,
        threadReady: this.threadReady,
        pendingTurns: this.pendingTurns.length,
        messageCount: this.parserState.messages.length,
        turnIndex: this.parserState.turnIndex,
        model: this.model ?? null,
      },
      activity: this.activityDeriver.getInspectState(),
    }
  }

  // ── JSON-RPC plumbing ──

  private sendRequest(method: string, params: unknown): number {
    const id = ++this.seq
    this.pending.set(id, method)
    this.child?.stdin?.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
    return id
  }

  private handleStdoutLine(line: string): void {
    const trimmed = line.trim()
    if (!trimmed) return
    let msg: any
    try {
      msg = JSON.parse(trimmed)
    } catch {
      log.debug('Non-JSON line', { preview: trimmed.slice(0, 80) })
      return
    }

    // Notification (no id) → stream parser.
    if (msg.method && msg.id === undefined) {
      this.handleNotification(msg.method, msg.params)
      return
    }

    // Server→client request (has both method and id). With approvalPolicy=never
    // and danger-full-access codex auto-resolves these; log only.
    if (msg.method && msg.id !== undefined) {
      log.debug('Unhandled server request', { method: msg.method, id: msg.id })
      return
    }

    // Response to one of our requests.
    if (msg.id !== undefined) {
      const method = this.pending.get(msg.id)
      this.pending.delete(msg.id)
      if (msg.error) {
        log.warn('JSON-RPC error', { sid: this.sessionId, method, error: JSON.stringify(msg.error).slice(0, 300) })
        return
      }
      this.handleResponse(method, msg.result)
    }
  }

  private handleResponse(method: string | undefined, result: any): void {
    if (method === 'initialize') {
      if (this.resumeThreadId) {
        this.sendRequest('thread/resume', {
          threadId: this.resumeThreadId,
          cwd: this.cwd,
          ...(this.model ? { model: this.model } : {}),
          sandbox: 'danger-full-access',
          approvalPolicy: 'never',
          config: {},
        })
      } else {
        this.sendRequest('thread/start', {
          ...(this.model ? { model: this.model } : {}),
          cwd: this.cwd,
          sandbox: 'danger-full-access',
          approvalPolicy: 'never',
          config: {},
        })
      }
      return
    }

    if (method === 'thread/start' || method === 'thread/resume') {
      const threadId = result?.thread?.id || result?.thread?.sessionId || null
      this.threadId = threadId
      if (threadId) {
        this.cliSessionId = threadId
        this.parserState.sessionId = threadId
        log.info('Codex thread ready', { sid: this.sessionId, threadId, resumed: method === 'thread/resume' })
        this.emit('cli-session-id', threadId)
        this.emit('cli-init', { sessionId: threadId, slashCommands: [], model: result?.model })
      }
      this.threadReady = true
      this.flushPendingTurns()
      return
    }

    // turn/start response carries the turn object; streaming already arrived
    // via notifications, so nothing to do here.
  }

  private flushPendingTurns(): void {
    if (!this.threadId) return
    while (this.pendingTurns.length > 0) {
      const next = this.pendingTurns.shift()!
      this.startTurn(next.message)
    }
  }

  private handleNotification(method: string, params: any): void {
    const result = handleAppServerNotification(method, params, this.parserState)

    if (result.newMessages.length > 0) {
      this.emit('session:structured-message', {
        type: 'delta',
        messages: result.newMessages,
        replacedStatsId: null,
      })
      this.activityDeriver.onDeltaMessages(result.newMessages)
    }

    if (result.partialText) {
      this.emit('session:partial-text', result.partialText)
    }
  }
}
