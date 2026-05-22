import { EventEmitter } from 'events'
import type {
  InitializeParams, InitializeResult,
  SessionNewParams, SessionNewResult,
  SessionLoadParams, SessionLoadResult,
  SessionPromptParams, SessionPromptResult,
  SessionCancelParams,
  ACPRequestPermissionParams, ACPRequestPermissionResult,
} from '../../shared/acp-types'
import type { ParsedMessage } from '../terminal/ConversationParser'

export type AdapterState = 'created' | 'initialized' | 'active' | 'prompting' | 'exited'

export interface ACPUpdateEntry {
  ts: number
  type: string
  summary: string
  /** out = adapter→frontendin = client→adapter */
  dir: 'out' | 'in'
  data?: unknown
  isReplay?: boolean
}

export interface ACPAdapterInspect {
  state: AdapterState
  provider: string
  config: {
    supportsSessionLoad: boolean
    supportsImages: boolean
    supportsThinking: boolean
    modes: string[]
  }
  promptInFlight: boolean
  promptStartedAt: number | null
  lastPromptDurationMs: number | null
  cliSessionId: string | null
  updateCount: number
  lastUpdateType: string | null
  lastUpdateAt: number | null
  recentUpdates: ACPUpdateEntry[]
}

export interface ACPAgentAdapter extends EventEmitter {
  readonly state: AdapterState

  handleInitialize(params: InitializeParams): InitializeResult
  handleSessionNew(params: SessionNewParams): Promise<SessionNewResult>
  handleSessionLoad?(params: SessionLoadParams): Promise<SessionLoadResult>
  handleSessionPrompt(params: SessionPromptParams): Promise<SessionPromptResult>
  handleSessionCancel(params: SessionCancelParams): void

  /**  stdin ACP promptfire-and-forget */
  write(text: string, images?: Array<{ data: string; mediaType: string }>): void
  kill(signal?: string): void
  getSessionId(): string

  getCliSessionId(): string | null
  getCurrentMessages(): ParsedMessage[] | null
  isAlive(): boolean
  getPid(): number | undefined
  markReady(): void
  destroy(): void
  getInspectState?(): ACPAdapterInspect

  /**  ACP  emitSessionUpdate */
  replayMessages(messages: ParsedMessage[], type: 'full' | 'delta'): void

  /**
   * ACP agent → client  session/request_permission
   * stream-json provider  allow_once ACP CLI  JSON-RPC request
   */
  requestPermission(params: ACPRequestPermissionParams): Promise<ACPRequestPermissionResult>

  /**
   *  pending permission request resolve  Promise
   */
  handleClientResponse(requestId: string, outcome: ACPRequestPermissionResult['outcome']): void
}
