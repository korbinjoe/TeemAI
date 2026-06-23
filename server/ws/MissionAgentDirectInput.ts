import type { WebSocket } from 'ws'
import { sendFrame } from './wsFrame'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { MissionAgentSessionStore, MissionAgentEntry } from './MissionAgentSessionStore'
import { compositeKey } from './MissionAgentSessionStore'
import type { ChatStore } from '../stores/ChatStore'
import type { SessionRegistry } from '../terminal/SessionRegistry'
import type { ChatTitleService } from '../services/chat/ChatTitleService'
import { silentlyIgnore } from '../lib/silentlyIgnore'
import { createLogger } from '../lib/logger'
import { expandSlashCommand } from '../runtime/SlashCommandResolver'
import { trackEvent } from '../lib/eventTracker'
import { cwdToCliProjectKey } from '../../shared/projectKey'
import { locateCodexRollout } from '../terminal/CodexRolloutLocator'
import { isPlaceholderTitle } from '../../shared/placeholderTitles'
import { codexResumeSessionId, isCodexOneShotPromptSpent } from './MissionAgentCodexSession'

const log = createLogger('Expert')

type StartPayload = {
  agentId: string; task?: string
  images?: Array<{ data: string; mediaType: string }>
  cwd?: string
  repositories?: Array<{ path: string }>; resumeSessionId?: string
  chatId?: string; cols?: number; rows?: number
  previousContext?: { agentName: string; lastMessage?: string; jsonlPath?: string }
}

export interface MissionAgentDirectInputDeps {
  store: MissionAgentSessionStore
  chatStore: ChatStore
  sessionRegistry: SessionRegistry
  titleService: ChatTitleService
  broadcastToChat: (chatId: string, msg: Record<string, unknown>) => void
  ensureAttachedRunning: (ws: WebSocket, chatId: string, agentId: string, connectionId: string) => MissionAgentEntry | undefined
  trackParticipant: (agentId: string, connectionId: string, chatId: string) => void
  handleStart: (ws: WebSocket, payload: StartPayload, connectionId: string) => Promise<{ started: boolean; sessionId?: string; method?: string }>
}

export const createMissionAgentDirectInput = (deps: MissionAgentDirectInputDeps) => {
  const { store, chatStore, titleService, broadcastToChat, ensureAttachedRunning, trackParticipant, handleStart } = deps

  const titleInProgress = new Set<string>()

  const handleDirectInput = async (
    ws: WebSocket,
    payload: { chatId?: string; agentId: string; message: string; images?: Array<{ data: string; mediaType: string }>; autoStart?: boolean; cwd?: string; repositories?: Array<{ path: string }>; cols?: number; rows?: number; previousContext?: { agentName: string; lastMessage?: string; jsonlPath?: string } },
    connectionId: string,
  ): Promise<void> => {
    const { agentId, message, images, autoStart = true } = payload
    const chatId = payload.chatId
    if (!chatId) {
      log.error('agent:direct-input missing chatId', { connectionId, agentId })
      sendFrame(ws, {
        type: 'agent:error',
        payload: { agentId, chatId: '', error: 'missing_chat_id', message: 'agent:direct-input payload must carry chatId' },
      })
      return
    }
    const key = compositeKey(connectionId, chatId, agentId)
    const existing = ensureAttachedRunning(ws, chatId, agentId, connectionId) || store.get(key)

    const cleanMessage = message.trim()

    if (cleanMessage && chatId && !titleInProgress.has(chatId)) {
      const chat = chatStore.get(chatId)
      if (chat && isPlaceholderTitle(chat.title)) {
        titleInProgress.add(chatId)
        const truncated = cleanMessage.length > 50 ? cleanMessage.slice(0, 50) + '…' : cleanMessage
        silentlyIgnore(() => chatStore.update(chatId, { title: truncated }), 'auto-title truncated update')
        broadcastToChat(chatId, { type: 'mission.title-updated', payload: { chatId, title: truncated } })
        silentlyIgnore(async () => {
          try {
            const semantic = await titleService.generate(cleanMessage)
            if (semantic) {
              await silentlyIgnore(() => chatStore.update(chatId, { title: semantic }), 'auto-title semantic update')
              broadcastToChat(chatId, { type: 'mission.title-updated', payload: { chatId, title: semantic } })
            }
          } finally {
            titleInProgress.delete(chatId)
          }
        }, 'auto-title semantic generation')
      }
    }

    const isExistingAlive = existing
      ? existing.acpClient.isAlive()
      : false

    if (existing && isExistingAlive) {
      const chatModelNow = chatId ? chatStore.get(chatId)?.model : undefined
      const modelChanged = chatModelNow && existing.model && chatModelNow !== existing.model

      if (cleanMessage && isCodexOneShotPromptSpent(existing)) {
        const persistedSession = chatStore.get(chatId)?.expertSessions?.[agentId]
        const persistedSessionId = typeof persistedSession === 'string'
          ? persistedSession
          : persistedSession?.cliSessionId
        const resumeSessionId = codexResumeSessionId(existing) || persistedSessionId
        log.info('Codex one-shot turn already completed, restarting with resume', { agentId, chatId, resumeSessionId })
        existing.acpClient.destroy()
        deps.sessionRegistry.remove(existing.sessionId)
        store.cleanup(key)
        await handleStart(ws, {
          agentId,
          task: cleanMessage,
          images,
          cwd: payload.cwd || existing.cwd,
          repositories: payload.repositories,
          resumeSessionId,
          chatId,
          cols: payload.cols,
          rows: payload.rows,
          previousContext: payload.previousContext,
        }, connectionId)
        trackParticipant(agentId, connectionId, chatId)
        return
      }

      if (modelChanged) {
        log.info('Model changed, restarting agent', { agentId, chatId, oldModel: existing.model, newModel: chatModelNow })
        const session = deps.sessionRegistry.get(existing.sessionId)
        if (session) session.killReason = 'model_switch'
        existing.acpClient.destroy()
        deps.sessionRegistry.remove(existing.sessionId)
        store.cleanup(key)
      } else {
        if (!cleanMessage) {
          trackParticipant(agentId, connectionId, chatId)
          return
        }

        const promptText = existing.provider !== 'codex'
          ? await expandSlashCommand(cleanMessage, existing.cwd)
          : cleanMessage
        log.info('Sending message via ACP', { agentId, chatId, sessionId: existing.sessionId, messageLen: promptText.length, imageCount: images?.length ?? 0, expanded: promptText !== cleanMessage })
        existing.acpClient.prompt(existing.sessionId, promptText, images?.map(i => ({ data: i.data, mimeType: i.mediaType }))).catch(err => {
          const errorMsg = err instanceof Error ? err.message : String(err)
          log.warn('ACP prompt failed', { agentId, chatId, error: errorMsg })
          trackEvent('agent', 'agent.acp_prompt_failed', { agentId, chatId, error: errorMsg })
          broadcastToChat(chatId, {
            type: 'agent:error',
            payload: { agentId, chatId, error: 'acp_prompt_failed', message: `Failed to send message: ${errorMsg}` },
          })
        })
        trackParticipant(agentId, connectionId, chatId)
        return
      }
    }

    if (!existing && store.isStarting(key)) {
      if (cleanMessage) {
        store.enqueuePendingTask(key, {
          task: cleanMessage,
          images,
          enqueuedAt: Date.now(),
          connectionId,
        })
      }
      log.info('Agent is starting, queuing message', { agentId })
      trackParticipant(agentId, connectionId, chatId)
      return
    }

    if (!autoStart) {
      sendFrame(ws, {
        type: 'agent:error',
        payload: { agentId, chatId, message: `Expert ${agentId} is not running` },
      })
      return
    }

    let resumeSessionId: string | undefined
    let effectiveCwd = payload.cwd
    if (chatId) {
      const chat = chatStore.get(chatId)
      const oldSession = chat?.expertSessions?.[agentId]
      if (oldSession) {
        const oldCliSessionId = typeof oldSession === 'string'
          ? oldSession
          : oldSession.cliSessionId
        const oldProvider = typeof oldSession === 'object' && oldSession.provider
          ? oldSession.provider
          : 'claude'
        const sessionCwd = (typeof oldSession === 'object' && oldSession.cwd) || effectiveCwd || process.cwd()
        if (oldCliSessionId) {
          const canResume = oldProvider === 'codex'
            ? !!locateCodexRollout(oldCliSessionId)
            : existsSync(join(homedir(), '.claude', 'projects', cwdToCliProjectKey(sessionCwd), `${oldCliSessionId}.jsonl`))
          if (canResume) {
            resumeSessionId = oldCliSessionId
            if (!effectiveCwd) effectiveCwd = sessionCwd
            log.info('Resuming dead expert with --resume', { agentId, chatId, resumeSessionId, provider: oldProvider })
          }
        }
      }
    }

    await handleStart(ws, {
      agentId,
      task: cleanMessage,
      images,
      cwd: effectiveCwd,
      repositories: payload.repositories,
      resumeSessionId,
      chatId,
      cols: payload.cols,
      rows: payload.rows,
      previousContext: payload.previousContext,
    }, connectionId)

    trackParticipant(agentId, connectionId, chatId)
  }

  return { handleDirectInput }
}
