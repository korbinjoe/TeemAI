/**
 * TerminalViewManager — Resume-PTY bridge for terminal view mode.
 *
 * When the user toggles a chat pane into terminal view, the server spawns a
 * sibling `claude --resume <cliSessionId>` (or equivalent) in the chat's cwd
 * via node-pty, streams raw TUI bytes back as `expert:data`, and forwards web
 * `expert:input` / `expert:resize` to PTY stdin. The ACP stream-json process
 * keeps running in the background — handoff / orchestration / scheduling stay
 * on ACP. Terminal mode only serves the user's optional native CLI experience.
 *
 * Lifetime keying: (chatId, agentId). Browser connections attach to the same
 * view-PTY so duplicate tabs/reconnects do not spawn duplicate resume CLIs.
 */

import * as pty from 'node-pty'
import type { WebSocket } from 'ws'
import { existsSync } from 'fs'
import type { SessionRegistry } from './SessionRegistry'
import { sendFrame } from '../ws/wsFrame'
import type { ChatStore } from '../stores/ChatStore'
import { resolveCliCommandAsync, resolveInterpreter } from '../lib/resolveCliCommand'
import { resolveCodexProviderEnv } from '../lib/codexConfigEnv'
import { isQoderVendor, type CliProvider } from '../config/types'
import { createLogger } from '../lib/logger'

const log = createLogger('TerminalViewManager')

interface ViewPty {
  pty: pty.IPty
  cwd: string
  agentId: string
  chatId: string
  cliSessionId: string
  clients: Map<string, WebSocket>
  cols: number
  rows: number
  firstChunkSent: boolean
  replayData: string
}

const keyOf = (chatId: string, agentId: string): string =>
  `${chatId}::${agentId}`

// Grace window after `handleDetach` before we actually kill the PTY. Lets the
// user toggle terminal mode off/on rapidly (or trigger a re-attach via WS
// reconnect) without thrashing `claude --resume` spawns.
const DETACH_GRACE_MS = 10_000
const MAX_REPLAY_CHARS = 1024 * 1024

export class TerminalViewManager {
  private views = new Map<string, ViewPty>()
  private pendingDetach = new Map<string, NodeJS.Timeout>()

  constructor(
    private sessionRegistry: SessionRegistry,
    private chatStore: ChatStore,
  ) {}

  private cancelPendingDetach(key: string): boolean {
    const timer = this.pendingDetach.get(key)
    if (!timer) return false
    clearTimeout(timer)
    this.pendingDetach.delete(key)
    return true
  }

  /**
   * True iff this connection is attached to an active view-PTY that
   * should receive input/resize events instead of the ACP adapter.
   */
  has(connectionId: string, chatId: string, agentId: string): boolean {
    return this.views.get(keyOf(chatId, agentId))?.clients.has(connectionId) === true
  }

  async handleAttach(
    ws: WebSocket,
    payload: { chatId: string; agentId: string; cols: number; rows: number },
    connectionId: string,
  ): Promise<void> {
    const { chatId, agentId } = payload
    const cols = payload.cols && payload.cols > 0 ? payload.cols : 80
    const rows = payload.rows && payload.rows > 0 ? payload.rows : 24
    const key = keyOf(chatId, agentId)

    if (this.cancelPendingDetach(key)) {
      log.debug('Re-attach cancelled pending detach; reusing PTY', { key })
    }

    if (this.views.has(key)) {
      const view = this.views.get(key)!
      view.clients.set(connectionId, ws)
      log.debug('Re-attach to shared view-PTY; resizing only', { key, cols, rows, clients: view.clients.size })
      this.handleResize({ chatId, agentId, cols, rows }, connectionId)
      this.send(ws, 'agent:view-attached', { agentId, chatId, sessionId: view.cliSessionId, cwd: view.cwd })
      if (view.replayData) {
        this.send(ws, 'agent:data', {
          agentId,
          chatId,
          sessionId: view.cliSessionId,
          snapshot: true,
          data: view.replayData,
          ptySize: { cols: view.cols, rows: view.rows },
        })
      }
      return
    }

    const live = this.sessionRegistry.findByChat(chatId, agentId)
    const persisted = this.chatStore.get(chatId)?.expertSessions?.[agentId]
    const cliSessionId = live?.cliSessionId ?? persisted?.cliSessionId
    const cwd = live?.cwd ?? persisted?.cwd
    const provider = (persisted?.provider ?? live?.streamManager.getProvider() ?? 'claude') as CliProvider

    if (!cliSessionId) {
      this.send(ws, 'agent:error', {
        agentId,
        chatId,
        error: 'terminal_view_unavailable',
        message: `No CLI session id for agent ${agentId}; launch it in message view first`,
      })
      return
    }
    if (!cwd || !existsSync(cwd)) {
      this.send(ws, 'agent:error', {
        agentId,
        chatId,
        error: 'terminal_view_unavailable',
        message: `Working directory unavailable for agent ${agentId}`,
      })
      return
    }

    let command: string
    let args: string[]
    if (provider === 'claude' || isQoderVendor(provider)) {
      command = isQoderVendor(provider) ? 'qodercli' : 'claude'
      args = ['--resume', cliSessionId]
    } else if (provider === 'codex') {
      command = 'codex'
      args = ['resume', '--include-non-interactive', cliSessionId]
    } else {
      this.send(ws, 'agent:error', {
        agentId,
        chatId,
        error: 'terminal_view_unsupported_provider',
        message: `Terminal view does not yet support provider "${provider}"`,
      })
      return
    }

    const resolved = await resolveCliCommandAsync(command)
    if (!resolved) {
      this.send(ws, 'agent:error', {
        agentId,
        chatId,
        error: 'terminal_view_cli_not_found',
        message: `CLI command "${command}" not found on PATH`,
      })
      return
    }
    const { command: spawnCmd, prependArgs } = resolveInterpreter(resolved)
    const providerEnv = provider === 'codex'
      ? await resolveCodexProviderEnv(cwd)
      : {}

    let ptyProcess: pty.IPty
    try {
      ptyProcess = pty.spawn(spawnCmd, [...prependArgs, ...args], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env: {
          ...process.env,
          ...providerEnv,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
          LANG: process.env.LANG || 'en_US.UTF-8',
          LC_ALL: process.env.LC_ALL || process.env.LANG || 'en_US.UTF-8',
        },
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log.error('Failed to spawn view-PTY', { key, command, message })
      this.send(ws, 'agent:error', {
        agentId,
        chatId,
        error: 'terminal_view_spawn_failed',
        message,
      })
      return
    }

    const view: ViewPty = {
      pty: ptyProcess,
      cwd,
      agentId,
      chatId,
      cliSessionId,
      clients: new Map([[connectionId, ws]]),
      cols,
      rows,
      firstChunkSent: false,
      replayData: '',
    }
    this.views.set(key, view)
    log.info('View-PTY spawned', { key, command, cliSessionId, cwd, pid: ptyProcess.pid })

    // Tell the web client the view-PTY is ready and which agent / cliSessionId
    // it is bound to. Web uses this to pre-populate the ExpertInfo entry (so
    // xterm has a slot to mount) before the first `expert:data` frame arrives.
    ptyProcess.onData((data) => {
      this.appendReplay(view, data)
      const hasPrintableData = this.hasPrintableData(data)
      const shouldSnapshot = !view.firstChunkSent && hasPrintableData
      this.sendToView(view, 'agent:data', {
        agentId,
        chatId,
        sessionId: cliSessionId,
        snapshot: shouldSnapshot,
        data: shouldSnapshot ? view.replayData : data,
        ptySize: { cols: view.cols, rows: view.rows },
      })
      if (shouldSnapshot) view.firstChunkSent = true
    })

    ptyProcess.onExit(({ exitCode }) => {
      log.info('View-PTY exited', { key, exitCode })
      this.views.delete(key)
      this.sendToView(view, 'agent:exit', { agentId, chatId, exitCode: exitCode ?? 0 })
    })

    this.send(ws, 'agent:view-attached', { agentId, chatId, sessionId: cliSessionId, cwd })
  }

  handleDetach(payload: { chatId: string; agentId: string }, connectionId: string): void {
    const key = keyOf(payload.chatId, payload.agentId)
    const view = this.views.get(key)
    if (!view) return
    view.clients.delete(connectionId)
    if (view.clients.size > 0) {
      log.debug('View-PTY client detached; shared PTY remains attached', { key, clients: view.clients.size })
      return
    }
    if (this.pendingDetach.has(key)) return
    log.debug('View-PTY detach scheduled', { key, graceMs: DETACH_GRACE_MS })
    const timer = setTimeout(() => {
      this.pendingDetach.delete(key)
      const current = this.views.get(key)
      if (!current) return
      log.info('View-PTY detach (grace expired)', { key })
      try { current.pty.kill() } catch (err) {
        log.warn('view.pty.kill failed', { key, error: err instanceof Error ? err.message : String(err) })
      }
      this.views.delete(key)
    }, DETACH_GRACE_MS)
    this.pendingDetach.set(key, timer)
  }

  /**
   * Forward web input to the view-PTY when one is active for this target.
   * Returns true if the input was consumed; false if the caller should fall
   * back to the normal ACP path.
   */
  forwardInput(payload: { chatId: string; agentId: string; data: string }, connectionId: string): boolean {
    const view = this.views.get(keyOf(payload.chatId, payload.agentId))
    if (!view || !view.clients.has(connectionId)) return false
    try { view.pty.write(payload.data) } catch (err) {
      log.warn('view.pty.write failed', { connectionId, error: err instanceof Error ? err.message : String(err) })
    }
    return true
  }

  forwardResize(
    payload: { chatId: string; agentId: string; cols: number; rows: number },
    connectionId: string,
  ): boolean {
    const view = this.views.get(keyOf(payload.chatId, payload.agentId))
    if (!view || !view.clients.has(connectionId)) return false
    const cols = payload.cols > 0 ? payload.cols : view.cols
    const rows = payload.rows > 0 ? payload.rows : view.rows
    view.cols = cols
    view.rows = rows
    try { view.pty.resize(cols, rows) } catch (err) {
      log.warn('view.pty.resize failed', { connectionId, error: err instanceof Error ? err.message : String(err) })
    }
    return true
  }

  handleResize(
    payload: { chatId: string; agentId: string; cols: number; rows: number },
    connectionId: string,
  ): void {
    this.forwardResize(payload, connectionId)
  }

  handleDisconnect(connectionId: string): void {
    const toKill: string[] = []
    for (const [key, view] of this.views) {
      if (!view.clients.delete(connectionId)) continue
      if (view.clients.size === 0) toKill.push(key)
    }
    for (const key of toKill) {
      this.cancelPendingDetach(key)
      const view = this.views.get(key)
      if (!view) continue
      try { view.pty.kill() } catch { /* best effort */ }
      this.views.delete(key)
      log.info('View-PTY cleaned up on WS disconnect', { key })
    }
  }

  private sendToView(view: ViewPty, type: string, payload: Record<string, unknown>): void {
    for (const ws of view.clients.values()) {
      this.send(ws, type, payload)
    }
  }

  private send(ws: WebSocket, type: string, payload: Record<string, unknown>): void {
    if (ws.readyState !== 1 /* OPEN */) return
    try { sendFrame(ws, { type, payload }) } catch (err) {
      log.warn('ws.send failed', { type, error: err instanceof Error ? err.message : String(err) })
    }
  }

  private appendReplay(view: ViewPty, data: string): void {
    view.replayData += data
    if (view.replayData.length > MAX_REPLAY_CHARS) {
      view.replayData = view.replayData.slice(view.replayData.length - MAX_REPLAY_CHARS)
    }
  }

  private hasPrintableData(data: string): boolean {
    const stripped = data
      .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
      .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
      .replace(/\x1b[78=>]/g, '')
      .replace(/[\u0000-\u001f\u007f]/g, '')
    return stripped.trim().length > 0
  }
}
