/**
 * ACPSessionManager - ACP
 *
 *  ACP session JSON-RPC  CliACPAdapter
 *  session
 *
 * -  ACPSessionManager  ACP
 * -  onNotification  Agent→Client
 * -  MissionAgentHandler
 */

import { CliACPAdapter, type CliACPAdapterOptions } from './CliACPAdapter'
import { StreamJsonManager } from '../terminal/StreamJsonManager'
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  ACPSessionUpdateParams,
  InitializeParams,
  InitializeResult,
  SessionNewParams,
  SessionPromptParams,
  SessionLoadParams,
  SessionCancelParams,
} from '../../shared/acp-types'
import { jsonRpcSuccess, jsonRpcError, RPC_ERROR } from '../../shared/acp-types'
import { createLogger } from '../lib/logger'

const log = createLogger('ACPSessionManager')

export type ACPNotificationCallback = (notification: JsonRpcNotification) => void

export interface ACPSessionManagerOptions {
  defaultCliOptions: CliACPAdapterOptions
  onNotification: ACPNotificationCallback
}

export class ACPSessionManager {
  private sessions = new Map<string, CliACPAdapter>()
  private initialized = false
  private initResult: InitializeResult | null = null

  constructor(private options: ACPSessionManagerOptions) {}

  async handleRequest(req: JsonRpcRequest): Promise<JsonRpcResponse> {
    try {
      switch (req.method) {
        case 'initialize':
          return this.handleInitialize(req)
        case 'session/new':
          return await this.handleSessionNew(req)
        case 'session/load':
          return await this.handleSessionLoad(req)
        case 'session/prompt':
          return await this.handleSessionPrompt(req)
        case 'session/set_mode':
          return this.handleSessionSetMode(req)
        default:
          return jsonRpcError(req.id, RPC_ERROR.METHOD_NOT_FOUND, `Method not found: ${req.method}`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log.error('Request handler error', { method: req.method, error: message })
      return jsonRpcError(req.id, RPC_ERROR.INTERNAL_ERROR, message)
    }
  }

  handleNotification(notif: JsonRpcNotification): void {
    switch (notif.method) {
      case 'session/cancel': {
        const params = notif.params as SessionCancelParams | undefined
        if (params?.sessionId) {
          const adapter = this.sessions.get(params.sessionId)
          if (adapter) {
            adapter.handleSessionCancel(params)
          }
        }
        break
      }
      default:
        log.warn('Unknown notification method', { method: notif.method })
    }
  }

  getSession(sessionId: string): CliACPAdapter | undefined {
    return this.sessions.get(sessionId)
  }

  getActiveSessions(): string[] {
    return [...this.sessions.keys()].filter(id => {
      const adapter = this.sessions.get(id)
      return adapter?.isAlive()
    })
  }

  cleanup(): void {
    for (const [id, adapter] of this.sessions) {
      if (!adapter.isAlive()) {
        this.sessions.delete(id)
        log.debug('Cleaned up closed session', { sessionId: id })
      }
    }
  }

  destroy(): void {
    for (const [id, adapter] of this.sessions) {
      if (adapter.isAlive()) {
        adapter.handleSessionCancel({ sessionId: id })
      }
    }
    this.sessions.clear()
  }

  private handleInitialize(req: JsonRpcRequest): JsonRpcResponse {
    const params = req.params as unknown as InitializeParams

    const tempManager = new StreamJsonManager()
    const tempAdapter = new CliACPAdapter(tempManager, this.options.defaultCliOptions)
    this.initResult = tempAdapter.handleInitialize(params)
    this.initialized = true

    log.info('ACP initialized', { capabilities: this.initResult.agentCapabilities })
    return jsonRpcSuccess(req.id, this.initResult)
  }

  private async handleSessionNew(req: JsonRpcRequest): Promise<JsonRpcResponse> {
    const params = req.params as unknown as SessionNewParams

    // Create StreamJsonManager + CliACPAdapter
    const streamManager = new StreamJsonManager()
    const adapter = new CliACPAdapter(streamManager, this.options.defaultCliOptions)

    this.bindAdapterNotifications(adapter)

    const result = await adapter.handleSessionNew(params)
    this.sessions.set(result.sessionId, adapter)

    log.info('Session created', { sessionId: result.sessionId })
    return jsonRpcSuccess(req.id, result)
  }

  private async handleSessionLoad(req: JsonRpcRequest): Promise<JsonRpcResponse> {
    const params = req.params as unknown as SessionLoadParams

    const streamManager = new StreamJsonManager()
    const adapter = new CliACPAdapter(streamManager, this.options.defaultCliOptions)

    this.bindAdapterNotifications(adapter)

    const result = await adapter.handleSessionLoad(params)
    this.sessions.set(adapter.getSessionId(), adapter)

    log.info('Session loaded', { sessionId: adapter.getSessionId(), cliSessionId: params.sessionId })
    return jsonRpcSuccess(req.id, result)
  }

  private async handleSessionPrompt(req: JsonRpcRequest): Promise<JsonRpcResponse> {
    const params = req.params as unknown as SessionPromptParams

    const adapter = this.sessions.get(params.sessionId)
    if (!adapter) {
      return jsonRpcError(req.id, RPC_ERROR.SESSION_NOT_FOUND, `Session not found: ${params.sessionId}`)
    }

    const result = await adapter.handleSessionPrompt(params)
    return jsonRpcSuccess(req.id, result)
  }

  private handleSessionSetMode(req: JsonRpcRequest): JsonRpcResponse {
    log.debug('session/set_mode called (no-op for CLI)', { params: req.params })
    return jsonRpcSuccess(req.id, {})
  }

  /**
   *  adapter  ACP  onNotification
   */
  private bindAdapterNotifications(adapter: CliACPAdapter): void {
    adapter.on('acp:session-update', (params: ACPSessionUpdateParams) => {
      this.options.onNotification({
        jsonrpc: '2.0',
        method: 'session/update',
        params: params as unknown as Record<string, unknown>,
      })
    })
  }
}
