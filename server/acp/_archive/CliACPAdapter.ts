/**
 * CliACPAdapter -  Claude Code CLI (stream-json)  ACP
 *
 * Claude Code CLI  ACP
 * - ACP JSON-RPC method → CLI stdin
 * - CLI stdout event → ACP session/update notification
 */

import { EventEmitter } from 'events'
import type { StreamJsonManager, StreamJsonOptions } from '../terminal/StreamJsonManager'
import type { ParsedMessage } from '../terminal/ConversationParser'
import type { ActivityState } from '../terminal/ActivityDeriver'
import type {
  InitializeParams,
  InitializeResult,
  SessionNewParams,
  SessionNewResult,
  SessionLoadParams,
  SessionLoadResult,
  SessionPromptParams,
  SessionPromptResult,
  SessionCancelParams,
  ACPSessionUpdateParams,
  SessionUpdateType,
  ACPContentBlock,
  ACPUsage,
} from '../../shared/acp-types'
import { createLogger } from '../lib/logger'

const log = createLogger('CliACPAdapter')

const PROMPT_TIMEOUT_MS = 10 * 60 * 1000

export interface CliACPAdapterOptions {
  command: string
  baseArgs: string[]
  env?: Record<string, string>
  provider?: 'claude' | 'codex'
}

type SessionState = 'created' | 'initialized' | 'active' | 'prompting' | 'cancelled' | 'closed'

export class CliACPAdapter extends EventEmitter {
  private sessionId: string
  private state: SessionState = 'created'
  private promptResolver: {
    resolve: (result: SessionPromptResult) => void
    reject: (error: Error) => void
    timer: NodeJS.Timeout
  } | null = null
  private cliSessionId: string | null = null
  private cliVersion = '1.0.0'
  private currentUsage: ACPUsage = {}

  constructor(
    private streamManager: StreamJsonManager,
    private options: CliACPAdapterOptions,
  ) {
    super()
    this.sessionId = streamManager.getSessionId()
    this.setupEventBridge()
  }

  handleInitialize(_params: InitializeParams): InitializeResult {
    this.state = 'initialized'
    log.info('ACP initialized', { sessionId: this.sessionId })

    return {
      protocolVersion: 1,
      agentCapabilities: {
        streaming: true,
        loadSession: true,
        modes: ['code', 'plan'],
      },
      agentInfo: {
        name: `claude-code-${this.options.provider ?? 'claude'}`,
        version: this.cliVersion,
      },
    }
  }

  async handleSessionNew(params: SessionNewParams): Promise<SessionNewResult> {
    const spawnOptions: StreamJsonOptions = {
      command: this.options.command,
      args: [...this.options.baseArgs],
      cwd: params.cwd,
      env: { ...this.options.env, ...params.env },
      provider: this.options.provider,
    }

    await this.streamManager.spawn(spawnOptions)
    this.state = 'active'

    log.info('ACP session created', { sessionId: this.sessionId, cwd: params.cwd })
    return { sessionId: this.sessionId }
  }

  async handleSessionLoad(params: SessionLoadParams): Promise<SessionLoadResult> {
    const args = [...this.options.baseArgs, '--resume', params.sessionId]

    const spawnOptions: StreamJsonOptions = {
      command: this.options.command,
      args,
      cwd: params.cwd,
      provider: this.options.provider,
    }

    await this.streamManager.spawn(spawnOptions)
    this.state = 'active'
    this.cliSessionId = params.sessionId

    log.info('ACP session loaded', { sessionId: this.sessionId, cliSessionId: params.sessionId })
    return null
  }

  async handleSessionPrompt(params: SessionPromptParams): Promise<SessionPromptResult> {
    if (this.state !== 'active') {
      throw new Error(`Cannot prompt in state: ${this.state}`)
    }
    if (this.promptResolver) {
      throw new Error('Another prompt is already in progress')
    }

    this.state = 'prompting'
    this.currentUsage = {}

    const textParts = params.prompt
      .filter((c): c is Extract<ACPContentBlock, { type: 'text' }> => c.type === 'text')
      .map(c => c.text)
    const text = textParts.join('\n')

    const images = params.prompt
      .filter((c): c is Extract<ACPContentBlock, { type: 'image' }> => c.type === 'image')
      .map(c => ({ data: c.data, mediaType: c.mimeType }))

    this.streamManager.write(text, images.length > 0 ? images : undefined)

    return new Promise<SessionPromptResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.promptResolver = null
        this.state = 'active'
        reject(new Error(`Prompt timeout after ${PROMPT_TIMEOUT_MS}ms`))
      }, PROMPT_TIMEOUT_MS)

      this.promptResolver = { resolve, reject, timer }
    })
  }

  handleSessionCancel(_params: SessionCancelParams): void {
    if (this.state === 'prompting') {
      this.streamManager.kill('SIGINT')
      this.state = 'active'

      if (this.promptResolver) {
        clearTimeout(this.promptResolver.timer)
        this.promptResolver.resolve({ stopReason: 'cancelled', usage: this.currentUsage })
        this.promptResolver = null
      }

      log.info('ACP session cancelled', { sessionId: this.sessionId })
    }
  }

  getSessionId(): string {
    return this.sessionId
  }

  getCliSessionId(): string | null {
    return this.cliSessionId ?? this.streamManager.getCliSessionId()
  }

  getState(): SessionState {
    return this.state
  }

  isAlive(): boolean {
    return this.streamManager.isAlive()
  }

  markReady(): void {
    if (this.state === 'initialized') {
      this.state = 'active'
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
            cacheReadTokens: msg.stats.cacheReadInputTokens,
            cacheCreationTokens: msg.stats.cacheCreationInputTokens,
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
            this.state = 'active'
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
        sessionUpdate: 'openteam:activity',
        activity: state as unknown as Record<string, unknown>,
      })
    })

    this.streamManager.on('cli-session-id', (sid: string) => {
      this.cliSessionId = sid
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
      this.state = 'closed'
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

      case 'thinking':
        return {
          sessionUpdate: 'openteam:thinking',
          text: msg.content,
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

  private safeParseJson(str: string): unknown {
    try { return JSON.parse(str) } catch { return str }
  }
}
