/**
 * ShellHandler — WebIDE shell  WS
 */

import type { WebSocket } from 'ws'
import type { ShellManager } from '../terminal/ShellManager'
import { createLogger } from '../lib/logger'
import { isAllowedCwd } from '../lib/validateCwd'

const log = createLogger('ShellHandler')

export class ShellHandler {
  private shellManager: ShellManager
  private shellWsMap = new Map<string, WebSocket>()

  constructor(shellManager: ShellManager) {
    this.shellManager = shellManager

    shellManager.on('output', ({ connectionId, shellId, data }: { connectionId: string; shellId: string; data: string }) => {
      const ws = this.shellWsMap.get(shellId)
      if (ws?.readyState === 1) {
        ws.send(JSON.stringify({ type: 'shell:output', payload: { shellId, data } }))
      }
    })

    shellManager.on('exit', ({ connectionId, shellId, exitCode }: { connectionId: string; shellId: string; exitCode: number }) => {
      const ws = this.shellWsMap.get(shellId)
      if (ws?.readyState === 1) {
        ws.send(JSON.stringify({ type: 'shell:exit', payload: { shellId, exitCode } }))
      }
      this.shellWsMap.delete(shellId)
    })
  }

  handleCreate(ws: WebSocket, payload: { cwd: string; cols?: number; rows?: number; nonce?: string }, connectionId: string): void {
    const { cwd, cols, rows, nonce } = payload
    if (!isAllowedCwd(cwd)) {
      log.warn('Shell create rejected: cwd outside allowed roots', { cwd, connectionId })
      ws.send(JSON.stringify({ type: 'error', payload: { message: `Refused: cwd "${cwd}" is outside allowed workspace` } }))
      return
    }
    try {
      const session = this.shellManager.create(connectionId, cwd, cols, rows)
      this.shellWsMap.set(session.id, ws)
      ws.send(JSON.stringify({
        type: 'shell:created',
        payload: {
          shellId: session.id,
          cwd: session.cwd,
          bufferedOutput: session.bufferedOutput || undefined,
          ...(nonce ? { nonce } : {}),
        },
      }))
    } catch (err) {
      log.error('Shell create failed', { error: err instanceof Error ? err.message : String(err) })
      ws.send(JSON.stringify({ type: 'error', payload: { message: 'Failed to create shell' } }))
    }
  }

  handleInput(_ws: WebSocket, payload: { shellId: string; data: string }, connectionId: string): void {
    this.shellManager.write(connectionId, payload.shellId, payload.data)
  }

  handleResize(_ws: WebSocket, payload: { shellId: string; cols: number; rows: number }, connectionId: string): void {
    this.shellManager.resize(connectionId, payload.shellId, payload.cols, payload.rows)
  }

  handlePrecreate(ws: WebSocket, payload: { cwd: string; cols?: number; rows?: number }, connectionId: string): void {
    const { cwd, cols, rows } = payload
    if (!isAllowedCwd(cwd)) {
      log.warn('Shell precreate rejected: cwd outside allowed roots', { cwd, connectionId })
      return
    }
    try {
      const shellId = this.shellManager.precreate(connectionId, cwd, cols, rows)
      ws.send(JSON.stringify({ type: 'shell:precreated', payload: { shellId } }))
    } catch (err) {
      log.error('Shell precreate failed', { error: err instanceof Error ? err.message : String(err) })
    }
  }

  handleDestroy(_ws: WebSocket, payload: { shellId: string }, connectionId: string): void {
    this.shellWsMap.delete(payload.shellId)
    this.shellManager.destroy(connectionId, payload.shellId)
  }

  handleDisconnect(connectionId: string): void {
    this.shellManager.cleanupConnection(connectionId)
  }
}
