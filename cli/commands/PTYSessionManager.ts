/**
 * PTYSessionManager — CLI PTY  Agent
 *
 * - stdin → WS → expert:input → Server → PTY → stdout
 * -  ~  Agent
 * -  Agent lastMessage + jsonlPath
 */

import React from 'react'
import WebSocket from 'ws'
import chalk from 'chalk'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { TEEMAI_HOME } from '../../shared/teemai-home'
import { cwdToCliProjectKey } from '../../shared/projectKey'
import type { ChatReadyParams } from '../tui/App.js'

/**  server fire-and-forget */
const sendTelemetry = (
  ws: WebSocket,
  category: string,
  event: string,
  properties?: Record<string, unknown>,
): void => {
  if (ws.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify({ type: 'telemetry:track', payload: { category, event, properties } }))
}

export class PTYSessionManager {
  private ws: WebSocket
  private params: ChatReadyParams
  private port: number
  private currentAgentId: string
  private currentAgentName: string
  private stdinDataHandler: ((chunk: Buffer | string) => void) | null = null
  private sessionStartTime = Date.now()
  private switching = false
  private currentCliSessionId: string | null = null
  private lineBuffer = ''
  /**  expert:exit  agentId  switchAgent  stop  */
  private stoppingAgents = new Set<string>()
  private startedResolve: (() => void) | null = null
  private handleResizeFn: (() => void) | null = null
  private sigintHandler: (() => void) | null = null
  private lastCtrlCTime = 0

  constructor(port: number, params: ChatReadyParams) {
    this.port = port
    this.params = params
    this.currentAgentId = params.agentName || 'default'
    this.currentAgentName = params.agentName || 'default'
    this.ws = new WebSocket(`ws://localhost:${port}/ws`)
  }

  start(): void {
    this.ws.on('open', () => {
      this.ws.send(JSON.stringify({ type: 'chat:set-context', payload: { chatId: this.params.chatId } }))

      sendTelemetry(this.ws, 'cli', 'cli.session.started', {
        workspaceId: this.params.workspaceId,
        workspaceName: this.params.workspaceName,
        agentName: this.currentAgentId,
        chatId: this.params.chatId,
      })

      this.startAgent(this.currentAgentId, this.params.initialPrompt)
    })

    this.ws.on('message', (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(data.toString())
        this.handleMessage(msg)
      } catch {
        // ignore parse errors
      }
    })

    this.ws.on('close', () => {
      this.cleanup()
      process.exit(0)
    })

    this.ws.on('error', (err) => {
      sendTelemetry(this.ws, 'cli', 'cli.error', {
        errorType: 'ws_error',
        message: err.message,
        durationMs: Date.now() - this.sessionStartTime,
      })
      process.stderr.write(`\x1b[31mWebSocket error: ${err.message}\x1b[0m\n`)
      this.cleanup()
      process.exit(1)
    })

    this.handleResizeFn = () => {
      this.ws.send(JSON.stringify({
        type: 'expert:resize',
        payload: {
          agentId: this.currentAgentId,
          cols: process.stdout.columns || 80,
          rows: process.stdout.rows || 30,
        },
      }))
    }
    process.stdout.on('resize', this.handleResizeFn)

    process.on('SIGTERM', () => {
      this.cleanup()
      process.exit(0)
    })
  }

  private startAgent(agentId: string, initialMessage?: string, previousContext?: { agentName: string; lastMessage?: string; jsonlPath?: string }): void {
    this.ws.send(JSON.stringify({
      type: 'expert:direct-input',
      payload: {
        chatId: this.params.chatId,
        agentId,
        message: initialMessage || '',
        autoStart: true,
        cwd: this.params.repoPaths[0] || process.cwd(),
        repositories: this.params.repoPaths.map((p: string) => ({ path: p })),
        cols: process.stdout.columns || 80,
        rows: process.stdout.rows || 30,
        previousContext,
        preferPty: true,
      },
    }))
  }

  private handleMessage(msg: { type: string; payload: any }): void {
    switch (msg.type) {
      case 'expert:started':
        if (msg.payload.agentId !== this.currentAgentId) break
        this.currentCliSessionId = msg.payload.cliSessionId || null
        this.currentAgentName = msg.payload.agentName || this.currentAgentId

        if (this.startedResolve) {
          this.startedResolve()
          this.startedResolve = null
          break
        }

        sendTelemetry(this.ws, 'cli', 'cli.pty.started', {
          agentId: this.currentAgentId,
          chatId: this.params.chatId,
        })

        this.saveLastSession()
        this.attachStdin()
        break

      case 'expert:data':
        if (msg.payload.agentId !== this.currentAgentId) break
        if (!this.switching) {
          process.stdout.write(msg.payload.data)
        }
        break

      case 'expert:exit':
        if (this.stoppingAgents.has(msg.payload.agentId)) {
          this.stoppingAgents.delete(msg.payload.agentId)
          break
        }
        if (msg.payload.agentId !== this.currentAgentId) break

        sendTelemetry(this.ws, 'cli', 'cli.pty.ended', {
          agentId: this.currentAgentId,
          chatId: this.params.chatId,
          exitCode: msg.payload.exitCode ?? 0,
          durationMs: Date.now() - this.sessionStartTime,
        })
        process.stdout.write('\n')
        this.cleanup()
        process.exit(msg.payload.exitCode ?? 0)
        break

      case 'expert:error':
        if (this.switching) {
          if (this.startedResolve) {
            this.startedResolve = null
          }
          break
        }
        sendTelemetry(this.ws, 'cli', 'cli.error', {
          agentId: this.currentAgentId,
          chatId: this.params.chatId,
          errorType: 'expert_error',
          message: msg.payload.message,
        })
        process.stderr.write(`\x1b[31mError: ${msg.payload.message}\x1b[0m\n`)
        this.cleanup()
        process.exit(1)
        break
    }
  }

  private attachStdin(): void {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true)
    }
    process.stdin.resume()

    if (!this.sigintHandler) {
      this.sigintHandler = () => {}
      process.on('SIGINT', this.sigintHandler)
    }

    if (this.stdinDataHandler) {
      process.stdin.off('data', this.stdinDataHandler)
    }

    this.lineBuffer = ''

    this.stdinDataHandler = (chunk: Buffer | string) => {
      if (this.switching) return

      const str = typeof chunk === 'string' ? chunk : chunk.toString()
      const firstChar = str[0] || ''

      if (str === '\x03') {
        const now = Date.now()
        if (now - this.lastCtrlCTime < 500) {
          this.cleanup()
          process.exit(0)
        }
        this.lastCtrlCTime = now
      }

      if (str === '~' && this.lineBuffer === '') {
        this.showSwitchMenu()
        return
      }

      if (firstChar === '\r' || firstChar === '\n') {
        this.lineBuffer = ''
      } else if (firstChar === '\x7f' || firstChar === '\x08') {
        this.lineBuffer = this.lineBuffer.slice(0, -1)
      } else if (str.length === 1 && firstChar.charCodeAt(0) >= 0x20) {
        this.lineBuffer += str
      }

      this.ws.send(JSON.stringify({
        type: 'expert:input',
        payload: { agentId: this.currentAgentId, data: str },
      }))
    }
    process.stdin.on('data', this.stdinDataHandler)
  }

  private detachStdin(): void {
    if (this.stdinDataHandler) {
      process.stdin.off('data', this.stdinDataHandler)
      this.stdinDataHandler = null
    }
    if (this.sigintHandler) {
      process.off('SIGINT', this.sigintHandler)
      this.sigintHandler = null
    }
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false)
    }
    process.stdin.pause()
  }

  private async showSwitchMenu(): Promise<void> {
    this.switching = true
    this.detachStdin()

    process.stdout.write('\x1b[?1049h\x1b[H')

    try {
      const { default: AgentSwitchMenu } = await import('../tui/components/AgentSwitchMenu.js')
      const { render: renderInk } = await import('ink')

      const result = await new Promise<string | null>((resolve) => {
        const { unmount } = renderInk(
          React.createElement(AgentSwitchMenu, {
            port: this.port,
            currentAgentId: this.currentAgentId,
            onSelect: (agentId: string) => {
              unmount()
              resolve(agentId)
            },
            onCancel: () => {
              unmount()
              resolve(null)
            },
          }),
        )
      })

      await new Promise(r => setTimeout(r, 100))

      if (!result || result === this.currentAgentId) {
        this.restoreSession()
        return
      }

      process.stdout.write('\x1b[?1049l')
      await this.switchAgent(result)
    } catch (err) {
      process.stderr.write(`\x1b[31mSwitch error: ${err instanceof Error ? err.message : err}\x1b[0m\n`)
      this.restoreSession()
    }
  }

  /** stop fire-and-forget→  Agent */
  private async switchAgent(newAgentId: string): Promise<void> {
    const prevAgentId = this.currentAgentId
    const prevAgentName = this.currentAgentName
    const prevCliSessionId = this.currentCliSessionId

    process.stdout.write('\x1b[2J\x1b[H')
    process.stdout.write(chalk.dim(`Switching: ${prevAgentName} → ${newAgentId}...\n`))

    this.stoppingAgents.add(prevAgentId)
    this.ws.send(JSON.stringify({ type: 'expert:stop', payload: { agentId: prevAgentId } }))

    const jsonlPath = prevCliSessionId ? this.resolveJsonlPath(prevCliSessionId) : undefined
    const contextPromise = this.fetchLastAgentMessage(prevAgentId).catch(() => null)

    this.currentAgentId = newAgentId
    this.currentCliSessionId = null

    const previousContext = jsonlPath ? {
      agentName: prevAgentName,
      jsonlPath,
    } : undefined

    this.startAgent(newAgentId, undefined, previousContext)

    contextPromise.then(() => { /* context fetched, no further action needed */ })

    const started = await Promise.race([
      new Promise<boolean>((resolve) => { this.startedResolve = () => resolve(true) }),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 10000)),
    ])

    if (!started) {
      process.stderr.write(chalk.red(`\nFailed to start ${newAgentId} (timeout). Recovering...\n`))
      this.currentAgentId = prevAgentId
      this.currentAgentName = prevAgentName
      this.startAgent(prevAgentId)
      await Promise.race([
        new Promise<void>((resolve) => { this.startedResolve = () => resolve() }),
        new Promise<void>((resolve) => setTimeout(resolve, 10000)),
      ])
      this.startedResolve = null
    }

    this.switching = false
    this.lineBuffer = ''
    process.stdout.write('\x1b[2J\x1b[H')
    process.stdout.write(chalk.dim(`[${this.params.workspaceName}]`) + ' ' + chalk.cyan(this.currentAgentName) + chalk.dim('  ~ switch | Ctrl+C×2 exit') + '\n')
    this.saveLastSession()
    this.attachStdin()
  }

  private async fetchLastAgentMessage(agentId: string): Promise<string | null> {
    try {
      const res = await fetch(`http://localhost:${this.port}/api/expert/messages/${encodeURIComponent(agentId)}`)
      if (!res.ok) return null
      const messages = await res.json() as Array<{ role: string; type: string; content: string }>
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'agent' && messages[i].type === 'text' && messages[i].content?.trim()) {
          return messages[i].content
        }
      }
      return null
    } catch {
      return null
    }
  }

  private resolveJsonlPath(cliSessionId: string): string {
    const cwd = this.params.repoPaths[0] || process.cwd()
    const projectKey = cwdToCliProjectKey(cwd)
    const homedir = process.env.HOME || process.env.USERPROFILE || '~'
    return `${homedir}/.claude/projects/${projectKey}/${cliSessionId}.jsonl`
  }

  private saveLastSession(): void {
    try {
      mkdirSync(TEEMAI_HOME, { recursive: true })
      writeFileSync(
        join(TEEMAI_HOME, 'last-session.json'),
        JSON.stringify({
          workspaceId: this.params.workspaceId,
          workspaceName: this.params.workspaceName,
          agentId: this.currentAgentId,
          repoPaths: this.params.repoPaths,
          savedAt: new Date().toISOString(),
        }),
        'utf8',
      )
    } catch {
    }
  }

  private restoreSession(): void {
    this.switching = false
    this.lineBuffer = ''
    process.stdout.write('\x1b[?1049l')
    this.attachStdin()
    const cols = process.stdout.columns || 80
    const rows = process.stdout.rows || 30
    this.ws.send(JSON.stringify({
      type: 'expert:resize',
      payload: { agentId: this.currentAgentId, cols, rows: rows - 1 },
    }))
    setTimeout(() => {
      this.ws.send(JSON.stringify({
        type: 'expert:resize',
        payload: { agentId: this.currentAgentId, cols, rows },
      }))
    }, 30)
  }

  private cleanup(): void {
    if (this.handleResizeFn) {
      process.stdout.off('resize', this.handleResizeFn)
    }
    this.detachStdin()
    this.ws.close()
  }
}
