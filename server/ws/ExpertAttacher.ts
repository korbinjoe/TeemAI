/**
 * ExpertAttacher -  Agent
 *
 *  ExpertLifecycle
 * - ensureAttachedRunning Agent session
 * - trackParticipant Agent  Chat
 */

import type { WebSocket } from 'ws'
import type { SessionRegistry } from '../terminal/SessionRegistry'
import type { ChatStore } from '../stores/ChatStore'
import { ExpertSessionStore, compositeKey, parseAgentId, parseChatId, type ExpertEntry } from './ExpertSessionStore'
import { createLogger } from '../lib/logger'

const log = createLogger('ExpertAttacher')

export interface ExpertAttacherDeps {
  sessionRegistry: SessionRegistry
  chatStore: ChatStore
  store: ExpertSessionStore
  getConnectionChatId: (connectionId: string) => string | undefined
  sendTo: (connectionId: string, msg: Record<string, unknown>) => void
}

export const createExpertAttacher = (deps: ExpertAttacherDeps) => {
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
  ): ExpertEntry | undefined => {
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
      type: 'expert:started',
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
      type: 'expert:list-updated',
      payload: { experts: store.getExpertListForConnection(connectionId, chatId), chatId },
    })

    const replayMessages = existingSession.acpClient.getCurrentMessages()
    if (replayMessages && replayMessages.length > 0) {
      existingSession.acpClient.replayMessages(replayMessages, 'full')
    }

    const lastActivity = store.getActivity(compositeKey(connectionId, chatId, agentId))
    sendTo(connectionId, {
      type: 'expert:activity',
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
