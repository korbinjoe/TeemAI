/**
 * ACPClient - TeemAI  ACP
 *
 *  ACPAgentAdapter API
 * ExpertLifecycle  Agent
 */

import type { ACPAgentAdapter, ACPAdapterInspect } from './ACPAgentAdapter'
import type { ParsedMessage } from '../terminal/ConversationParser'
import type {
  InitializeResult,
  SessionNewParams,
  SessionNewResult,
  SessionLoadParams,
  SessionPromptResult,
  ACPSessionUpdateParams,
  ACPContentBlock,
  ACPRequestPermissionParams,
  ACPRequestPermissionResult,
} from '../../shared/acp-types'

export interface ImageAttachment {
  data: string
  mimeType: string
}

export class ACPClient {
  constructor(private adapter: ACPAgentAdapter) {}

  async initialize(): Promise<InitializeResult> {
    return this.adapter.handleInitialize({
      protocolVersion: 1,
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
        terminal: true,
      },
      clientInfo: { name: 'teemai', title: 'TeemAI AI OS', version: '1.0.0' },
    })
  }

  async createSession(params: SessionNewParams): Promise<SessionNewResult> {
    return this.adapter.handleSessionNew(params)
  }

  async loadSession(params: SessionLoadParams): Promise<void> {
    if (!this.adapter.handleSessionLoad) {
      throw new Error('Adapter does not support session/load')
    }
    await this.adapter.handleSessionLoad(params)
  }

  async prompt(sessionId: string, text: string, images?: ImageAttachment[]): Promise<SessionPromptResult> {
    const prompt: ACPContentBlock[] = []
    if (images?.length) {
      images.forEach(img => prompt.push({ type: 'image', data: img.data, mimeType: img.mimeType }))
    }
    prompt.push({ type: 'text', text })
    return this.adapter.handleSessionPrompt({ sessionId, prompt })
  }

  cancel(sessionId: string): void {
    this.adapter.handleSessionCancel({ sessionId })
  }

  /**  ACP prompt handleInput  */
  write(text: string, images?: Array<{ data: string; mediaType: string }>): void {
    this.adapter.write(text, images)
  }

  kill(signal?: string): void {
    this.adapter.kill(signal)
  }

  getSessionId(): string {
    return this.adapter.getSessionId()
  }

  onUpdate(handler: (params: ACPSessionUpdateParams) => void): void {
    this.adapter.on('acp:session-update', handler)
  }

  onExit(handler: (info: { exitCode: number | null }) => void): void {
    this.adapter.on('exit', handler)
  }

  /**  agent → client  request session/request_permission */
  onClientRequest(handler: (req: { requestId: string; method: string; params: unknown }) => void): void {
    this.adapter.on('acp:client-request', handler)
  }

  onPermissionTimeout(handler: (info: { requestId: string; toolCallId: string; toolTitle: string; timeoutMs: number }) => void): void {
    this.adapter.on('acp:permission-timeout', handler)
  }

  /**  permission request CLI/Provider  */
  requestPermission(params: ACPRequestPermissionParams): Promise<ACPRequestPermissionResult> {
    return this.adapter.requestPermission(params)
  }

  handleClientResponse(requestId: string, outcome: ACPRequestPermissionResult['outcome']): void {
    this.adapter.handleClientResponse(requestId, outcome)
  }

  getCliSessionId(): string | null {
    return this.adapter.getCliSessionId()
  }

  getCurrentMessages(): ParsedMessage[] | null {
    return this.adapter.getCurrentMessages()
  }

  isAlive(): boolean {
    return this.adapter.isAlive()
  }

  getPid(): number | undefined {
    return this.adapter.getPid()
  }

  markReady(): void {
    this.adapter.markReady()
  }

  destroy(): void {
    this.adapter.destroy()
  }

  getInspectState(): ACPAdapterInspect | null {
    return this.adapter.getInspectState?.() ?? null
  }

  replayMessages(messages: ParsedMessage[], type: 'full' | 'delta'): void {
    this.adapter.replayMessages(messages, type)
  }

  /**  adapter  DevInspector hook  */
  getAdapter(): ACPAgentAdapter {
    return this.adapter
  }
}
