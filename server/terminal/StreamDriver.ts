/**
 * StreamDriver - common interface for CLI Agent drivers.
 *
 * Both StreamJsonManager (Claude/Codex `exec --json` over stdout JSONL) and
 * CodexAppServerManager (Codex `app-server` over stdio JSON-RPC) implement this
 * surface so the ACP adapter, session registry and ws lifecycle stay
 * driver-agnostic.
 */

import type { EventEmitter } from 'events'
import type { ParsedMessage } from './ConversationParser'
import type { CliProvider } from '../config/types'

/** Codex app-server-only spawn parameters carried alongside the generic options. */
export interface CodexAppServerSpawnConfig {
  /** Per-agent model override; when absent codex uses ~/.codex/config.toml default. */
  model?: string
}

export interface StreamJsonOptions {
  command: string
  args: string[]
  cwd?: string
  env?: Record<string, string>
  provider?: CliProvider
  /** Present only when the driver is CodexAppServerManager. Ignored by StreamJsonManager. */
  codex?: CodexAppServerSpawnConfig
}

export interface StreamDriverInspectState {
  [key: string]: unknown
}

/**
 * The subset of EventEmitter + manager methods consumed across the codebase.
 * Implemented by StreamJsonManager and CodexAppServerManager.
 */
export interface StreamDriver extends EventEmitter {
  spawn(options: StreamJsonOptions): Promise<void>
  write(message: string, images?: Array<{ data: string; mediaType: string }>): void
  kill(signal?: string): void
  getPid(): number | undefined
  getSessionId(): string
  isAlive(): boolean
  getUptime(): number
  getCliSessionId(): string | null
  getProvider(): CliProvider
  getCurrentMessages(): ParsedMessage[] | null
  isWatcherReady(): boolean
  setCliSessionId(sid: string): void
  forceRedraw(): void
  restartSessionFileWatcher(): void
  getInspectState(): StreamDriverInspectState
}
