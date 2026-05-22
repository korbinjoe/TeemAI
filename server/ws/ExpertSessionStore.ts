/**
 * ExpertSessionStore - Expert Agent
 *
 *  ExpertHandler  compositeKey  Map
 *  Map
 *
 * compositeKey connectionId::chatId::agentId Tab  agentId
 *
 *  connectionWsMap  connectionActiveChatId agent
 */

import type { ACPClient } from '../acp/ACPClient'
import type { ActivityState } from '../terminal/ActivityDeriver'

/** connectionId::chatId::agentId */
export function compositeKey(connectionId: string, chatId: string, agentId: string): string {
  return `${connectionId}::${chatId}::${agentId}`
}

export function parseAgentId(key: string): string {
  const parts = key.split('::')
  return parts.length >= 3 ? parts[2] : parts[parts.length - 1]
}

export function parseChatId(key: string): string {
  const parts = key.split('::')
  return parts.length >= 3 ? parts[1] : ''
}

export interface ExpertEntry {
  sessionId: string
  acpClient: ACPClient
  agentName: string
  agentIcon: string
  cwd: string
  cliSessionId?: string
  provider?: import('../config/types').CliProvider
  connectionId: string
  chatId: string
  model?: string
}

export interface CompletedEntry {
  sessionId: string
  agentName: string
  agentIcon: string
  exitCode?: number
  completedAt: string
  connectionId: string
  chatId: string
  model?: string
}

export interface ExpertListItem {
  agentId: string
  sessionId: string
  agentName: string
  agentIcon: string
  status: 'running' | 'completed'
  exitCode?: number
  completedAt?: string
  cwd?: string
}

export type ActivityChangeListener = (key: string, chatId: string, agentId: string, activity: ActivityState) => void

export class ExpertSessionStore {
  private running = new Map<string, ExpertEntry>()
  private completed = new Map<string, CompletedEntry>()
  private starting = new Set<string>()
  private pendingTask = new Map<string, string>()
  private pendingTaskTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private lastActivity = new Map<string, ActivityState>()
  /**  executionLogId key::metaKey  */
  private meta = new Map<string, unknown>()

  private activityListeners = new Set<ActivityChangeListener>()

  onActivityChange(listener: ActivityChangeListener): () => void {
    this.activityListeners.add(listener)
    return () => { this.activityListeners.delete(listener) }
  }

  // ── Meta ──

  setMeta(key: string, metaKey: string, value: unknown): void {
    this.meta.set(`${key}::${metaKey}`, value)
  }

  getMeta(key: string, metaKey: string): unknown {
    return this.meta.get(`${key}::${metaKey}`)
  }

  private clearMeta(key: string): void {
    const prefix = `${key}::`
    for (const k of this.meta.keys()) {
      if (k.startsWith(prefix)) this.meta.delete(k)
    }
  }

  // ── Starting Lock ──

  markStarting(key: string): void {
    this.starting.add(key)
  }

  clearStarting(key: string): void {
    this.starting.delete(key)
  }

  isStarting(key: string): boolean {
    return this.starting.has(key)
  }

  // ── Running Map ──

  set(key: string, entry: ExpertEntry): void {
    this.running.set(key, entry)
  }

  get(key: string): ExpertEntry | undefined {
    return this.running.get(key)
  }

  has(key: string): boolean {
    return this.running.has(key)
  }

  runningEntries(): IterableIterator<[string, ExpertEntry]> {
    return this.running.entries()
  }

  // ── Activity Map ──

  getActivity(key: string): ActivityState | undefined {
    return this.lastActivity.get(key)
  }

  setActivity(key: string, activity: ActivityState): void {
    this.lastActivity.set(key, activity)
    const chatId = parseChatId(key)
    const agentId = parseAgentId(key)
    for (const listener of this.activityListeners) {
      try { listener(key, chatId, agentId, activity) } catch {}
    }
  }

  // ── Completed Map ──

  setCompleted(key: string, entry: CompletedEntry): void {
    this.completed.set(key, entry)
  }

  getCompleted(key: string): CompletedEntry | undefined {
    return this.completed.get(key)
  }

  // ── Pending Task ──

  setPendingTask(key: string, task: string): void {
    this.pendingTask.set(key, task)
  }

  getPendingTask(key: string): string | undefined {
    return this.pendingTask.get(key)
  }

  hasPendingTask(key: string): boolean {
    return this.pendingTask.has(key)
  }

  consumePendingTask(key: string): string | undefined {
    const task = this.pendingTask.get(key)
    if (task !== undefined) {
      this.pendingTask.delete(key)
    }
    return task
  }

  setPendingTaskTimer(key: string, timer: ReturnType<typeof setTimeout>): void {
    this.pendingTaskTimers.set(key, timer)
  }

  clearPendingTaskTimer(key: string): void {
    const timer = this.pendingTaskTimers.get(key)
    if (timer) {
      clearTimeout(timer)
      this.pendingTaskTimers.delete(key)
    }
  }

  consumePendingTaskWithTimer(key: string): string | undefined {
    this.clearPendingTaskTimer(key)
    return this.consumePendingTask(key)
  }

  /**
   *  key  completed
   *  entry  activity
   */
  cleanup(key: string): { entry?: ExpertEntry; activity?: ActivityState } {
    const entry = this.running.get(key)
    const activity = this.lastActivity.get(key)

    this.running.delete(key)
    this.starting.delete(key)
    this.pendingTask.delete(key)
    this.lastActivity.delete(key)
    this.clearPendingTaskTimer(key)
    this.clearMeta(key)

    return { entry, activity }
  }

  /**
   * cleanup +  completed
   *  handleStop / handleStopAll
   */
  cleanupWithStop(key: string, connectionId: string): ExpertEntry | undefined {
    const expert = this.running.get(key)
    if (!expert) return undefined

    this.completed.set(key, {
      sessionId: expert.sessionId,
      agentName: expert.agentName,
      agentIcon: expert.agentIcon,
      exitCode: -1,
      completedAt: new Date().toISOString(),
      connectionId,
      chatId: expert.chatId,
    })

    this.clearPendingTaskTimer(key)

    this.running.delete(key)
    this.starting.delete(key)
    this.pendingTask.delete(key)
    this.lastActivity.delete(key)
    this.clearMeta(key)

    return expert
  }

  /**  chatId  running entriesteam-status API  */
  collectByChatId(chatId: string): Array<{ key: string; expert: ExpertEntry }> {
    const result: Array<{ key: string; expert: ExpertEntry }> = []
    for (const [key, expert] of this.running) {
      if (expert.chatId === chatId) {
        result.push({ key, expert })
      }
    }
    return result
  }

  /**  connectionId  running entries */
  collectByConnection(connectionId: string): Array<{ key: string; expert: ExpertEntry }> {
    const result: Array<{ key: string; expert: ExpertEntry }> = []
    for (const [key, expert] of this.running) {
      if (expert.connectionId === connectionId) {
        result.push({ key, expert })
      }
    }
    return result
  }

  /**  connectionId  completed */
  cleanupConnection(connectionId: string): void {
    const items = this.collectByConnection(connectionId)
    for (const { key } of items) {
      this.cleanup(key)
      this.completed.delete(key)
    }
  }

  findBySessionId(sessionId: string): { key: string; entry: ExpertEntry } | undefined {
    for (const [key, entry] of this.running) {
      if (entry.sessionId === sessionId) return { key, entry }
    }
    return undefined
  }

  /**  keyoldKey → newKeyresumeFromChat  */
  migrateKey(oldKey: string, newKey: string, connectionId: string): void {
    const entry = this.running.get(oldKey)
    if (!entry) return

    entry.connectionId = connectionId
    this.running.delete(oldKey)
    this.running.set(newKey, entry)

    const activity = this.lastActivity.get(oldKey)
    if (activity) {
      this.lastActivity.delete(oldKey)
      this.lastActivity.set(newKey, activity)
    }

    const oldPrefix = `${oldKey}::`
    const toMigrate: Array<[string, unknown]> = []
    for (const [k, v] of this.meta) {
      if (k.startsWith(oldPrefix)) {
        toMigrate.push([k.slice(oldPrefix.length), v])
      }
    }
    for (const [metaKey, v] of toMigrate) {
      this.meta.delete(`${oldKey}::${metaKey}`)
      this.meta.set(`${newKey}::${metaKey}`, v)
    }
  }

  /**  agentId  keyrunning fallback completed */
  findKeyByAgentId(agentId: string): string | undefined {
    for (const key of this.running.keys()) {
      if (parseAgentId(key) === agentId) return key
    }
    for (const key of this.completed.keys()) {
      if (parseAgentId(key) === agentId) return key
    }
    return undefined
  }

  /**  agentId +  connectionId/chatId  running entry */
  findRunning(agentId: string, connectionId?: string, chatId?: string): ExpertEntry | undefined {
    if (connectionId && chatId) {
      return this.running.get(compositeKey(connectionId, chatId, agentId))
    }
    for (const [key, entry] of this.running) {
      if (parseAgentId(key) !== agentId) continue
      if (connectionId && entry.connectionId !== connectionId) continue
      if (chatId && entry.chatId !== chatId) continue
      return entry
    }
    return undefined
  }

  getExpertListForConnection(connectionId: string, chatId?: string): ExpertListItem[] {
    const runningList = Array.from(this.running.entries())
      .filter(([, info]) => info.connectionId === connectionId && (!chatId || info.chatId === chatId))
      .map(([key, info]) => ({
        agentId: parseAgentId(key),
        sessionId: info.sessionId,
        agentName: info.agentName,
        agentIcon: info.agentIcon,
        status: 'running' as const,
        cwd: info.cwd,
      }))

    const completedList = Array.from(this.completed.entries())
      .filter(([key, info]) => info.connectionId === connectionId && !this.running.has(key) && (!chatId || info.chatId === chatId))
      .map(([key, info]) => ({
        agentId: parseAgentId(key),
        sessionId: info.sessionId,
        agentName: info.agentName,
        agentIcon: info.agentIcon,
        status: 'completed' as const,
        exitCode: info.exitCode,
        completedAt: info.completedAt,
      }))

    return [...runningList, ...completedList]
  }

  getExpertList(): ExpertListItem[] {
    const runningList = Array.from(this.running.entries()).map(([key, info]) => ({
      agentId: parseAgentId(key),
      sessionId: info.sessionId,
      agentName: info.agentName,
      agentIcon: info.agentIcon,
      status: 'running' as const,
    }))

    const completedList = Array.from(this.completed.entries())
      .filter(([key]) => !this.running.has(key))
      .map(([key, info]) => ({
        agentId: parseAgentId(key),
        sessionId: info.sessionId,
        agentName: info.agentName,
        agentIcon: info.agentIcon,
        status: 'completed' as const,
        exitCode: info.exitCode,
        completedAt: info.completedAt,
      }))

    return [...runningList, ...completedList]
  }

  clearCompleted(connectionId: string, chatId?: string): number {
    const toDelete: string[] = []
    for (const [key, entry] of this.completed) {
      if (entry.connectionId === connectionId && (!chatId || entry.chatId === chatId)) {
        toDelete.push(key)
      }
    }
    for (const key of toDelete) this.completed.delete(key)
    return toDelete.length
  }

  /**  connectionId  completed  */
  clearCompletedByConnection(connectionId: string): void {
    const toDelete = [...this.completed.entries()]
      .filter(([, entry]) => entry.connectionId === connectionId)
      .map(([key]) => key)
    for (const key of toDelete) this.completed.delete(key)
  }
}
