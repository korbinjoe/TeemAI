/**
 * ExpertAttacher -  Agent
 *
 *  ExpertLifecycle
 * - ensureAttachedRunning Agent session
 * - trackParticipant Agent  Chat
 */

import type { WebSocket } from 'ws'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { SessionRegistry } from '../terminal/SessionRegistry'
import type { ChatStore } from '../stores/ChatStore'
import { MissionAgentSessionStore, compositeKey, parseAgentId, parseChatId, type MissionAgentEntry } from './MissionAgentSessionStore'
import { cwdToCliProjectKey } from '../../shared/projectKey'
import { parseConversationFile } from '../terminal/ConversationParser'
import { buildJsonlBackfillReplay } from './MissionAgentExitHandler'
import { createLogger } from '../lib/logger'

const log = createLogger('ExpertAttacher')

export interface MissionAgentAttacherDeps {
  sessionRegistry: SessionRegistry
  chatStore: ChatStore
  store: MissionAgentSessionStore
  getConnectionChatId: (connectionId: string) => string | undefined
  sendTo: (connectionId: string, msg: Record<string, unknown>) => void
}

export const createMissionAgentAttacher = (deps: MissionAgentAttacherDeps) => {
  const { sessionRegistry, chatStore, store, getConnectionChatId, sendTo } = deps

  const trackParticipant = (agentName: string, connectionId: string, chatId?: string): void => {
    const resolvedChatId = chatId || getConnectionChatId(connectionId)
    if (!resolvedChatId) return

    const chat = chatStore.get(resolvedChatId)
    if (!chat) return

    const existing = chat.participantAgents || []
    if (existing.includes(agentName)) return

    chatStore.update(resolvedChatId, {
      participantAgents: [...existing, agentName],
    }).catch((err) => {
      log.error('Failed to track participant', { agentName, error: err instanceof Error ? err.message : String(err) })
    })
  }

  /**
   *  Agent session /
   *  attach  entry undefined
   */
  const ensureAttachedRunning = (
    ws: WebSocket,
    chatId: string,
    agentId: string,
    connectionId: string,
  ): MissionAgentEntry | undefined => {
    if (!chatId) return undefined
    const existingSession = sessionRegistry.findByChat(chatId, agentId)
    if (!existingSession) return undefined
    if (!existingSession.streamManager.isAlive()) return undefined
    if (!existingSession.acpClient) return undefined

    const newKey = compositeKey(connectionId, chatId, agentId)
    const alreadyAttached = store.has(newKey)

    sessionRegistry.attach(existingSession.sessionId, ws, connectionId)
    const oldKey = [...store.runningEntries()].map(([k]) => k).find(
      (k) => parseAgentId(k) === agentId && parseChatId(k) === chatId && k !== newKey,
    )
    if (oldKey) {
      store.migrateKey(oldKey, newKey, connectionId)
    }

    let entry = store.get(newKey)
    if (!entry) {
      entry = {
        sessionId: existingSession.sessionId,
        acpClient: existingSession.acpClient,
        agentName: existingSession.agentName,
        agentIcon: existingSession.agentIcon || '',
        cwd: existingSession.cwd,
        cliSessionId: existingSession.cliSessionId,
        provider: existingSession.streamManager.getProvider(),
        connectionId,
        chatId,
      }
      store.set(newKey, entry)
    }

    if (alreadyAttached && !oldKey) {
      return entry
    }

    sendTo(connectionId, {
      type: 'agent:started',
      payload: {
        agentId,
        chatId,
        sessionId: existingSession.sessionId,
        agentName: existingSession.agentName,
        agentIcon: existingSession.agentIcon || '',
        status: 'running',
        cwd: existingSession.cwd,
      },
    })
    sendTo(connectionId, {
      type: 'agent:list-updated',
      payload: { agents: store.getExpertListForConnection(connectionId, chatId), chatId },
    })

    const replayMessages = existingSession.acpClient.getCurrentMessages()
    if (replayMessages && replayMessages.length > 0) {
      existingSession.acpClient.replayMessages(replayMessages, 'full')
    }

    // In-memory stream messages can be lossy. Reconcile against the JSONL
    // (single source of truth) and backfill any agent messages the live stream
    // dropped, so reload/attach shows the full conversation.
    if (entry.provider !== 'codex' && entry.cwd && entry.cliSessionId) {
      const projectKey = cwdToCliProjectKey(entry.cwd)
      const jsonlPath = join(homedir(), '.claude', 'projects', projectKey, `${entry.cliSessionId}.jsonl`)
      if (existsSync(jsonlPath)) {
        const jsonlMessages = parseConversationFile(jsonlPath)
        const backfill = buildJsonlBackfillReplay(replayMessages ?? null, jsonlMessages)
        if (backfill.length > 0) {
          existingSession.acpClient.replayMessages(backfill, 'delta')
          log.info('Backfilled missing messages from JSONL on attach', { agentId, chatId, count: backfill.length })
        }
      }
    }

    const lastActivity = store.getActivity(compositeKey(connectionId, chatId, agentId))
    sendTo(connectionId, {
      type: 'agent:activity',
      payload: {
        agentId, chatId, sessionId: existingSession.sessionId,
        startedAt: existingSession.createdAt,
        activity: lastActivity ?? { phase: 'waiting_input', background: false, toolCount: 0, toolCompleted: 0, hasText: false, updatedAt: Date.now() },
      },
    })

    return entry
  }

  return { trackParticipant, ensureAttachedRunning }
}
