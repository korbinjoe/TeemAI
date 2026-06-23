/**
 * ExpertExitHandler - Agent
 *
 *  ExpertLifecycle
 * - Agent completed
 * - Agent started
 * - Resume
 * - fileCollector, tokenTracker, compiled cleanup
 */

import type { SessionRegistry } from '../terminal/SessionRegistry'
import type { ExecutionLogStore } from '../stores/ExecutionLogStore'
import type { MissionAgentSessionStore } from './MissionAgentSessionStore'
import type { MissionAgentTokenTracker } from './MissionAgentTokenTracker'
import type { FileOperationCollector } from '../terminal/FileOperationCollector'
import type { ActivityState } from '../terminal/ActivityDeriver'
import { existsSync } from 'fs'
import { readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { ChatStore } from '../stores/ChatStore'
import type { AgentStore } from '../stores/AgentStore'
import { createParserState, parseConversationFile, type ParsedMessage } from '../terminal/ConversationParser'
import { acpUpdateToWSMessage } from '../acp/ACPToFrontendBridge'
import { cwdToCliProjectKey } from '../../shared/projectKey'
import { codexOutputParser } from '../terminal/CodexParser'
import { locateCodexRollout } from '../terminal/CodexRolloutLocator'
import { createLogger } from '../lib/logger'
import { trackEvent } from '../lib/eventTracker'

const log = createLogger('ExpertExit')

const buildMessageMergeKey = (msg: ParsedMessage): string => {
  if (msg.jsonlUuid) return `uuid:${msg.jsonlUuid}:${msg.type}:${msg.role}`
  if (msg.type === 'toolUse' && msg.toolUse) return `toolUse:${msg.toolUse.toolId}:${msg.turnIndex ?? -1}`
  if (msg.type === 'toolResult' && msg.toolResult) return `toolResult:${msg.toolResult.toolUseId}:${msg.turnIndex ?? -1}`
  if (msg.type === 'stats') return `stats:${msg.turnIndex ?? -1}`
  return `fallback:${msg.role}:${msg.type}:${msg.timestamp}:${msg.content}`
}

const parseCodexRolloutMessages = (threadId?: string): ParsedMessage[] | null => {
  if (!threadId) return null
  const rollout = locateCodexRollout(threadId)
  if (!rollout) return null
  try {
    const raw = readFileSync(rollout, 'utf8')
    const lines = raw.split('\n')
    const state = createParserState()
    const { newMessages } = codexOutputParser.parseNewLines(lines, 0, state)
    const all = state.messages.length > 0 ? state.messages : newMessages
    return all.length > 0 ? all : null
  } catch (err) {
    log.warn('Failed to parse Codex rollout on exit fallback', {
      threadId,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

export const buildCodexExitReplay = (
  currentMessages: ParsedMessage[] | null,
  rolloutMessages: ParsedMessage[] | null,
): ParsedMessage[] => {
  const current = currentMessages ?? []
  const rollout = rolloutMessages ?? []
  if (rollout.length === 0) return []

  const hasCurrentAgentText = current.some((m) => m.role === 'agent' && m.type === 'text' && !!m.content?.trim())
  if (hasCurrentAgentText) return []

  const latestUserTurn = rollout
    .filter((m) => m.role === 'user')
    .reduce((max, m) => Math.max(max, m.turnIndex ?? -1), -1)
  const targetTurn = latestUserTurn >= 0
    ? latestUserTurn
    : rollout.reduce((max, m) => Math.max(max, m.turnIndex ?? -1), -1)
  if (targetTurn < 0) return []

  const currentKeys = new Set(current.map(buildMessageMergeKey))
  const replay = rollout.filter((m) => m.role === 'agent' && (m.turnIndex ?? -1) === targetTurn)

  return replay.filter((m) => !currentKeys.has(buildMessageMergeKey(m)))
}

// Content-identity key for cross-parser dedup. The live StreamJsonParser and the
// resume/exit ConversationParser assign different ids/uuids/turnIndexes to the
// same logical message, so jsonlUuid-based keys would treat every JSONL message
// as new. Key by stable content identity instead, and exclude stats (turnIndex
// numbering differs between parsers).
const buildBackfillKey = (msg: ParsedMessage): string | null => {
  switch (msg.type) {
    case 'text':
      return msg.content?.trim() ? `text:${msg.content}` : null
    case 'toolUse':
      return msg.toolUse ? `toolUse:${msg.toolUse.toolId}` : null
    case 'toolResult':
      return msg.toolResult ? `toolResult:${msg.toolResult.toolUseId}` : null
    case 'thinking':
      return `thinking:${(msg.thinkingSummary || '').slice(0, 150)}`
    default:
      return null
  }
}

// Diff the JSONL (single source of truth) against the messages the live stream
// actually emitted, returning the agent messages the stream dropped so they can
// be backfilled on exit. Used for Claude sessions where stream parsing may miss
// authoritative messages.
export const buildJsonlBackfillReplay = (
  currentMessages: ParsedMessage[] | null,
  jsonlMessages: ParsedMessage[] | null,
): ParsedMessage[] => {
  const current = currentMessages ?? []
  const jsonl = jsonlMessages ?? []
  if (jsonl.length === 0) return []

  const presentKeys = new Set<string>()
  for (const m of current) {
    const k = buildBackfillKey(m)
    if (k) presentKeys.add(k)
  }

  const replay: ParsedMessage[] = []
  const seen = new Set<string>()
  for (const m of jsonl) {
    if (m.role !== 'agent') continue
    const k = buildBackfillKey(m)
    if (!k || presentKeys.has(k) || seen.has(k)) continue
    seen.add(k)
    replay.push(m)
  }
  return replay
}

export interface ExitContext {
  agentId: string
  chatId: string
  sessionId: string
  key: string
  agentName: string
  resumeSessionId?: string
  startedSent: boolean
  fileCollector: FileOperationCollector
  tokenTracker: MissionAgentTokenTracker
  compiledCleanup: () => Promise<void>
}

export interface ExitHandlerDeps {
  sessionRegistry: SessionRegistry
  executionLogStore: ExecutionLogStore
  store: MissionAgentSessionStore
  chatStore: ChatStore
  agentStore?: AgentStore
  sendTo: (connectionId: string, msg: Record<string, unknown>) => void
  onExited?: (chatId: string, agentId: string, exitCode: number, taskCompleted: boolean) => void
}

export const createMissionAgentExitHandler = (deps: ExitHandlerDeps) => {
  const { sessionRegistry, executionLogStore, store, chatStore, agentStore, sendTo, onExited } = deps

  const notifyExited = (chatId: string, agentId: string, exitCode: number, taskCompleted: boolean): void => {
    if (onExited) {
      try {
        onExited(chatId, agentId, exitCode, taskCompleted)
      } catch (err) {
        log.error('onExited callback failed', { agentId, chatId, exitCode, error: err instanceof Error ? err.message : String(err) })
      }
    }
  }

  const handleExit = (
    ctx: ExitContext,
    exitCode: number,
    signal?: number,
  ): void => {
    const { agentId, chatId, sessionId, agentName, fileCollector, tokenTracker, compiledCleanup } = ctx

    fileCollector.flushNow()
    fileCollector.destroy()
    tokenTracker.destroy()
    compiledCleanup().catch((err) => log.warn('Cleanup error', { error: err instanceof Error ? err.message : String(err) }))

    const currentKey = store.findBySessionId(sessionId)?.key ?? ctx.key
    const expertInfo = store.get(currentKey)
    const finalActivity = store.getActivity(currentKey)

    if (!expertInfo) {
      log.debug('Exit ignored — already cleaned up by chat switch', { agentId })
      notifyExited(chatId, agentId, exitCode, false)
      return
    }

    const currentConnectionId = expertInfo.connectionId

    if (!ctx.startedSent) {
      log.warn('Agent exited before started was sent', { agentId, exitCode, sessionId })
      sendTo(currentConnectionId, {
        type: 'agent:start-failed',
        payload: { agentId, chatId, exitCode, message: `Agent exited immediately (code ${exitCode})` },
      })
      store.cleanup(currentKey)
      sendTo(currentConnectionId, {
        type: 'agent:list-updated',
        payload: { agents: store.getExpertListForConnection(currentConnectionId, chatId), chatId },
      })
      notifyExited(chatId, agentId, exitCode, false)
      return
    }

    // Resume Failed
    if (ctx.resumeSessionId && exitCode !== 0) {
      log.warn('Resume failed, cleaning up runtime state', { agentId, resumeSessionId: ctx.resumeSessionId })
      const cwd = expertInfo?.cwd
      let jsonlPath: string | null = null
      if (cwd && ctx.resumeSessionId) {
        if (expertInfo.provider === 'codex') {
          jsonlPath = locateCodexRollout(ctx.resumeSessionId)
        } else {
          const projectKey = cwdToCliProjectKey(cwd)
          const candidatePath = join(homedir(), '.claude', 'projects', projectKey, `${ctx.resumeSessionId}.jsonl`)
          if (existsSync(candidatePath)) {
            jsonlPath = candidatePath
          }
        }
        if (!jsonlPath) {
          const chat = chatStore.get(chatId)
          if (chat?.expertSessions?.[agentId]) {
            const updatedSessions = { ...chat.expertSessions }
            delete updatedSessions[agentId]
            chatStore.update(chatId, { expertSessions: Object.keys(updatedSessions).length > 0 ? updatedSessions : undefined })
            log.info('Cleared dead expert session from DB', { agentId, chatId, resumeSessionId: ctx.resumeSessionId })
          }
        }
      }

      let replayed = false
      if (jsonlPath && ctx.resumeSessionId) {
        const messages = parseConversationFile(jsonlPath)
        if (messages.length > 0) {
          const agent = agentStore?.get(agentId)
          sessionRegistry.sendToSession(sessionId, {
            type: 'agent:started',
            payload: { agentId, chatId, sessionId, agentName: agent?.name || agentName, agentIcon: agent?.icon || '', status: 'completed' },
          })
          const wsMsg = acpUpdateToWSMessage({
            sessionUpdate: '_teemai/messages_batch',
            messages: messages as unknown as import('../../shared/acp-types').TeemAIParsedMessage[],
            replacedStatsId: null,
            batchType: 'full',
          }, { agentId, sessionId, chatId })
          if (wsMsg) {
            sessionRegistry.sendToSession(sessionId, wsMsg as Record<string, unknown>)
          }
          sessionRegistry.sendToSession(sessionId, {
            type: 'agent:exit',
            payload: { agentId, chatId, exitCode: 0 },
          })
          replayed = true
          log.info('Resume failed but replayed from JSONL', { agentId, chatId, messageCount: messages.length })
        }
      }

      if (!replayed) {
        sessionRegistry.sendToSession(sessionId, {
          type: 'agent:resume-failed',
          payload: { agentId, chatId, agentName, sessionId, reason: 'session_expired' },
        })
      }

      store.cleanup(currentKey)
      sessionRegistry.sendToSession(sessionId, {
        type: 'agent:list-updated',
        payload: { agents: store.getExpertListForConnection(currentConnectionId, chatId), chatId },
      })
      notifyExited(chatId, agentId, exitCode, false)
      return
    }

    store.setCompleted(currentKey, {
      sessionId: expertInfo.sessionId,
      agentName: expertInfo.agentName,
      agentIcon: expertInfo.agentIcon,
      exitCode,
      completedAt: new Date().toISOString(),
      connectionId: currentConnectionId,
      chatId: expertInfo.chatId,
    })

    trackEvent('agent', 'agent.exited', { agentId, exitCode, chatId: expertInfo.chatId, connectionId: currentConnectionId })

    const runtimeSession = sessionRegistry.get(sessionId)
    const isCodexTurnExit = expertInfo.provider === 'codex'
      && exitCode === 0
      && !runtimeSession?.killReason
      && finalActivity?.phase !== 'error'
    const taskCompleted = finalActivity?.phase !== 'error'

    // Codex `exec` runs one turn per process. If stream parsing missed assistant
    // text but rollout persisted it, backfill from rollout before final exit so
    // the UI doesn't end as "Mission Complete" with an empty turn.
    if (exitCode === 0 && expertInfo.provider === 'codex') {
      const streamMessages = sessionRegistry.get(sessionId)?.streamManager.getCurrentMessages() ?? null
      const rolloutMessages = parseCodexRolloutMessages(expertInfo.cliSessionId)
      const replay = buildCodexExitReplay(streamMessages, rolloutMessages)
      if (replay.length > 0) {
        const wsMsg = acpUpdateToWSMessage({
          sessionUpdate: '_teemai/messages_batch',
          messages: replay as unknown as import('../../shared/acp-types').TeemAIParsedMessage[],
          replacedStatsId: null,
          batchType: 'delta',
        }, { agentId, sessionId, chatId })
        if (wsMsg) {
          sessionRegistry.sendToSession(sessionId, wsMsg as Record<string, unknown>)
          log.info('Applied Codex exit replay fallback', {
            agentId,
            chatId,
            sessionId,
            replayCount: replay.length,
          })
        }
      }
    }

    // Claude sessions: stream parsing can miss authoritative messages. The JSONL
    // is the single source of truth, so reconcile against it on exit and backfill
    // any agent messages the live stream dropped.
    if (exitCode === 0 && expertInfo.provider !== 'codex' && expertInfo.cwd && expertInfo.cliSessionId) {
      const projectKey = cwdToCliProjectKey(expertInfo.cwd)
      const jsonlPath = join(homedir(), '.claude', 'projects', projectKey, `${expertInfo.cliSessionId}.jsonl`)
      if (existsSync(jsonlPath)) {
        const streamMessages = sessionRegistry.get(sessionId)?.streamManager.getCurrentMessages() ?? null
        const jsonlMessages = parseConversationFile(jsonlPath)
        const replay = buildJsonlBackfillReplay(streamMessages, jsonlMessages)
        if (replay.length > 0) {
          const wsMsg = acpUpdateToWSMessage({
            sessionUpdate: '_teemai/messages_batch',
            messages: replay as unknown as import('../../shared/acp-types').TeemAIParsedMessage[],
            replacedStatsId: null,
            batchType: 'delta',
          }, { agentId, sessionId, chatId })
          if (wsMsg) {
            sessionRegistry.sendToSession(sessionId, wsMsg as Record<string, unknown>)
            log.info('Applied Claude exit JSONL backfill', {
              agentId,
              chatId,
              sessionId,
              replayCount: replay.length,
            })
          }
        }
      }
    }

    const chat = chatStore.get(chatId)
    if (chat?.expertSessions?.[agentId]) {
      const updatedSessions = { ...chat.expertSessions }
      updatedSessions[agentId] = { ...updatedSessions[agentId], exitCode, taskCompleted }
      chatStore.update(chatId, { expertSessions: updatedSessions }).catch((err) =>
        log.warn('Failed to persist exitCode', { agentId, error: err instanceof Error ? err.message : String(err) }),
      )
    }

    const execLogId = store.getMeta(currentKey, 'executionLogId') as string | undefined
    if (execLogId) {
      const status = taskCompleted ? 'completed' as const : 'error' as const
      const duration = expertInfo.sessionId ? Date.now() - (sessionRegistry.get(expertInfo.sessionId)?.createdAt || Date.now()) : undefined
      const totalCost = finalActivity?.cost
      const tokenSums = finalActivity?.modelUsage?.reduce((acc, u) => ({
        input: acc.input + u.inputTokens,
        output: acc.output + u.outputTokens,
        cacheRead: acc.cacheRead + u.cacheReadInputTokens,
        cacheCreation: acc.cacheCreation + u.cacheCreationInputTokens,
      }), { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 })
      executionLogStore.update(execLogId, {
        status,
        completedAt: new Date().toISOString(),
        duration,
        toolCalls: finalActivity?.toolCompleted || 0,
        totalCost,
        inputTokens: tokenSums?.input || 0,
        outputTokens: tokenSums?.output || 0,
        cacheReadTokens: tokenSums?.cacheRead || 0,
        cacheCreationTokens: tokenSums?.cacheCreation || 0,
      }).catch((err) => {
        log.warn('Failed to update execution log', { execLogId, error: err instanceof Error ? err.message : String(err) })
      })
    }

    sessionRegistry.sendToSession(sessionId, {
      type: 'agent:exit',
      payload: { agentId, chatId, sessionId, exitCode, signal, finalActivity, ...(isCodexTurnExit ? { turnExit: true } : {}) },
    })

    store.cleanup(currentKey)

    sendTo(currentConnectionId, {
      type: 'agent:list-updated',
      payload: { agents: store.getExpertListForConnection(currentConnectionId, chatId), chatId },
    })

    notifyExited(chatId, agentId, exitCode, taskCompleted)
  }

  return { handleExit }
}
