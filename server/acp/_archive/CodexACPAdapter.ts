/**
 * CodexACPAdapter -  Codex CLI  ACP
 *
 * Codex  stream-json TUI  + rollout JSONL
 *  session/loadprompt  stdin
 */

import { EventEmitter } from 'events'
import type { StreamJsonManager, StreamJsonOptions } from '../terminal/StreamJsonManager'
import type { ParsedMessage } from '../terminal/ConversationParser'
import type { ActivityState } from '../terminal/ActivityDeriver'
import type { ACPAgentAdapter, AdapterState } from './ACPAgentAdapter'
import type {
  InitializeParams,
  InitializeResult,
  SessionNewParams,
  SessionNewResult,
  SessionPromptParams,
  SessionPromptResult,
  SessionCancelParams,
  ACPSessionUpdateParams,
  SessionUpdateType,
  ACPContentBlock,
  ACPUsage,
} from '../../shared/acp-types'
import { createLogger } from '../lib/logger'

const log = createLogger('CodexACPAdapter')

const PROMPT_TIMEOUT_MS = 10 * 60 * 1000

export interface CodexACPAdapterOptions {
  command: string
  baseArgs: string[]
  env?: Record<string, string>
}

export class CodexACPAdapter extends EventEmitter implements ACPAgentAdapter {
  private sessionId: string
  private _state: AdapterState = 'created'
  private promptResolver: {
    resolve: (result: SessionPromptResult) => void
    reject: (error: Error) => void
    timer: NodeJS.Timeout
  } | null = null
  private currentUsage: ACPUsage = {}

  get state(): AdapterState {
    return this._state
  }

  constructor(
    private streamManager: StreamJsonManager,
    private options: CodexACPAdapterOptions,
  ) {
    super()
    this.sessionId = streamManager.getSessionId()
    this.setupEventBridge()
  }

  handleInitialize(_params: InitializeParams): InitializeResult {
    this._state = 'initialized'
    log.info('ACP initialized', { sessionId: this.sessionId })

    return {
      protocolVersion: 1,
      agentCapabilities: {
        streaming: true,
        loadSession: false,
        modes: ['code'],
      },
      agentInfo: {
        name: 'codex',
        version: '1.0.0',
      },
    }
  }

  async handleSessionNew(params: SessionNewParams): Promise<SessionNewResult> {
    const spawnOptions: StreamJsonOptions = {
      command: this.options.command,
      args: [...this.options.baseArgs],
      cwd: params.cwd,
      env: { ...this.options.env, ...params.env },
      provider: 'codex',
    }

    await this.streamManager.spawn(spawnOptions)
    this._state = 'active'

    log.info('ACP session created', { sessionId: this.sessionId, cwd: params.cwd })
    return { sessionId: this.sessionId }
  }

  async handleSessionPrompt(params: SessionPromptParams): Promise<SessionPromptResult> {
    if (this._state !== 'active') {
      throw new Error(`Cannot prompt in state: ${this._state}`)
    }
    if (this.promptResolver) {
      throw new Error('Another prompt is already in progress')
    }

    this._state = 'prompting'
    this.currentUsage = {}

    const textParts = params.prompt
      .filter((c): c is Extract<ACPContentBlock, { type: 'text' }> => c.type === 'text')
      .map(c => c.text)
    const text = textParts.join('\n')

    this.streamManager.write(text)

    return new Promise<SessionPromptResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.promptResolver = null
        this._state = 'active'
        reject(new Error(`Prompt timeout after ${PROMPT_TIMEOUT_MS}ms`))
      }, PROMPT_TIMEOUT_MS)

      this.promptResolver = { resolve, reject, timer }
    })
  }

  handleSessionCancel(_params: SessionCancelParams): void {
    if (this._state === 'prompting') {
      this.streamManager.kill('SIGINT')
      this._state = 'active'

      if (this.promptResolver) {
        clearTimeout(this.promptResolver.timer)
        this.promptResolver.resolve({ stopReason: 'cancelled', usage: this.currentUsage })
        this.promptResolver = null
      }

      log.info('ACP session cancelled', { sessionId: this.sessionId })
    }
  }

  getCliSessionId(): string | null {
    return this.streamManager.getCliSessionId()
  }

  getCurrentMessages(): ParsedMessage[] | null {
    return this.streamManager.getCurrentMessages()
  }

  isAlive(): boolean {
    return this.streamManager.isAlive()
  }

  getPid(): number | undefined {
    return this.streamManager.getPid()
  }

  destroy(): void {
    if (this.promptResolver) {
      clearTimeout(this.promptResolver.timer)
      this.promptResolver.reject(new Error('Adapter destroyed'))
      this.promptResolver = null
    }
    this.streamManager.kill('SIGTERM')
    this._state = 'exited'
    this.removeAllListeners()
    log.info('ACP adapter destroyed', { sessionId: this.sessionId })
  }

  markReady(): void {
    if (this._state === 'initialized') {
      this._state = 'active'
      log.info('ACP adapter marked ready', { sessionId: this.sessionId })
    }
  }

  private setupEventBridge(): void {
    this.streamManager.on('session:structured-message', (data: {
      type: string
      messages: ParsedMessage[]
      replacedStatsId: string | null
    }) => {
      for (const msg of data.messages) {
        const acpUpdate = this.parsedMessageToACPUpdate(msg)
        if (acpUpdate) {
          this.emitSessionUpdate(acpUpdate)
        }

        if (msg.type === 'stats' && msg.stats) {
          this.currentUsage = {
            inputTokens: msg.stats.inputTokens,
            outputTokens: msg.stats.outputTokens,
            costUsd: msg.stats.costUsd,
          }
          this.emitSessionUpdate({
            sessionUpdate: 'session_info_update',
            usage: this.currentUsage,
          })

          if (msg.isTurnEnd && this.promptResolver) {
            clearTimeout(this.promptResolver.timer)
            this.promptResolver.resolve({ stopReason: 'end_turn', usage: this.currentUsage })
            this.promptResolver = null
            this._state = 'active'
          }
        }
      }
    })

    this.streamManager.on('session:partial-text', (delta: { blockIndex: number; text: string }) => {
      this.emitSessionUpdate({
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: delta.text },
      })
    })

    this.streamManager.on('activity', (state: ActivityState) => {
      this.emitSessionUpdate({
        sessionUpdate: 'teemai:activity',
        activity: state as unknown as Record<string, unknown>,
      })
    })

    this.streamManager.on('exit', ({ exitCode }: { exitCode: number | null }) => {
      if (this.promptResolver) {
        clearTimeout(this.promptResolver.timer)
        if (exitCode === 0) {
          this.promptResolver.resolve({ stopReason: 'end_turn', usage: this.currentUsage })
        } else {
          this.promptResolver.reject(new Error(`CLI exited with code ${exitCode}`))
        }
        this.promptResolver = null
      }
      this._state = 'exited'
    })
  }

  private parsedMessageToACPUpdate(msg: ParsedMessage): SessionUpdateType | null {
    switch (msg.type) {
      case 'text': {
        const updateType = msg.role === 'agent' ? 'agent_message_chunk' : 'user_message_chunk'
        return {
          sessionUpdate: updateType,
          content: { type: 'text', text: msg.content },
        }
      }

      case 'toolUse':
        if (!msg.toolUse) return null
        return {
          sessionUpdate: 'tool_call',
          toolCallId: msg.toolUse.toolId,
          title: msg.toolUse.toolName,
          kind: 'other',
          status: 'completed',
        }

      case 'toolResult':
        if (!msg.toolResult) return null
        return {
          sessionUpdate: 'tool_call_update',
          toolCallId: msg.toolResult.toolUseId,
          status: msg.toolResult.isError ? 'failed' : 'completed',
          content: [{ type: 'text', text: msg.toolResult.content }],
        }

      case 'stats':
        return null

      default:
        return null
    }
  }

  private emitSessionUpdate(update: SessionUpdateType): void {
    const params: ACPSessionUpdateParams = {
      sessionId: this.sessionId,
      update,
    }
    this.emit('acp:session-update', params)
  }
}
