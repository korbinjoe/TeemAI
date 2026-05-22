/**
 * GitWatchHandler — WS  GitWatchManager
 *
 * 1.  git:subscribe / git:unsubscribe
 * 2.  connectionId → Set<chatId>
 * 3.  GitWatchManager  'changes'  →  chatId  WS connection
 *
 *  connection  chat  1 connection : 1 chat
 */

import type { WebSocket } from 'ws'
import { createLogger } from '../lib/logger'
import { GitWatchManager, type GitChangeEvent, type TreeChangeEvent } from '../git/GitWatchManager'

const log = createLogger('GitWatchHandler')

interface ConnectionState {
  ws: WebSocket
  chatIds: Set<string>
}

export class GitWatchHandler {
  private readonly connections = new Map<string, ConnectionState>()
  private readonly chatToConnection = new Map<string, string>()

  constructor(private readonly manager: GitWatchManager) {
    this.manager.on('changes', this.handleManagerEvent)
    this.manager.on('tree-changed', this.handleTreeChangeEvent)
  }

  handleSubscribe(ws: WebSocket, payload: { chatId?: string; path?: string }, connectionId: string): void {
    if (!payload.chatId || !payload.path) return
    const { chatId, path } = payload

    let state = this.connections.get(connectionId)
    if (!state) {
      state = { ws, chatIds: new Set() }
      this.connections.set(connectionId, state)
    }
    state.chatIds.add(chatId)
    this.chatToConnection.set(chatId, connectionId)

    this.manager.subscribe(chatId, path)
  }

  handleUnsubscribe(payload: { chatId?: string; path?: string }, connectionId: string): void {
    if (!payload.chatId || !payload.path) return
    const { chatId, path } = payload

    this.manager.unsubscribe(chatId, path)

    if (this.manager.getRefCount(path) === 0) {
    }

    log.debug('handleUnsubscribe', { chatId, path, connectionId })
  }

  handleDisconnect(connectionId: string): void {
    const state = this.connections.get(connectionId)
    if (!state) return

    for (const chatId of state.chatIds) {
      this.manager.unsubscribeAllFor(chatId)
      if (this.chatToConnection.get(chatId) === connectionId) {
        this.chatToConnection.delete(chatId)
      }
    }
    this.connections.delete(connectionId)
    log.debug('handleDisconnect cleanup', { connectionId, chats: state.chatIds.size })
  }

  private handleTreeChangeEvent = (event: TreeChangeEvent): void => {
    const connectionId = this.chatToConnection.get(event.chatId)
    if (!connectionId) return
    const state = this.connections.get(connectionId)
    if (!state) return
    if (state.ws.readyState !== state.ws.OPEN) return

    try {
      state.ws.send(
        JSON.stringify({
          type: 'git:tree-changed',
          payload: { chatId: event.chatId, path: event.path },
        }),
      )
    } catch (err) {
      log.warn('send git:tree-changed failed', { chatId: event.chatId, error: String(err) })
    }
  }

  private handleManagerEvent = (event: GitChangeEvent): void => {
    const connectionId = this.chatToConnection.get(event.chatId)
    if (!connectionId) return
    const state = this.connections.get(connectionId)
    if (!state) return
    if (state.ws.readyState !== state.ws.OPEN) return

    try {
      state.ws.send(
        JSON.stringify({
          type: 'git:changes',
          payload: { chatId: event.chatId, path: event.path, payload: event.payload },
        }),
      )
    } catch (err) {
      log.warn('send git:changes failed', { chatId: event.chatId, error: String(err) })
    }
  }
}
