/**
 * ExpertLifecycle - Expert Agent
 *
 *  MissionAgentHandler
 * - Expert spawn stream-json  SessionRegistry
 * - handleDirectInput
 *
 * Token  → MissionAgentTokenTracker.ts
 *  → ExpertAttacher.ts
 */

import type { WebSocket } from 'ws'
import { sendFrame } from './wsFrame'
import { StreamJsonManager } from '../terminal/StreamJsonManager'
import { ConfigCompiler } from '../runtime/ConfigCompiler'
import type { AgentRegistry } from '../config/AgentRegistry'
import type { AgentStore } from '../stores/AgentStore'
import { agentDefToAgent, isQoderVendor } from '../config/types'
import type { SessionRegistry } from '../terminal/SessionRegistry'
import { getServerPort } from '../lib/serverPort'
import type { ChatStore } from '../stores/ChatStore'
import type { WorkspaceStore } from '../stores/WorkspaceStore'
import type { TokenUsageStore } from '../stores/TokenUsageStore'
import type { ExecutionLogStore } from '../stores/ExecutionLogStore'
import { MissionAgentSessionStore, compositeKey } from './MissionAgentSessionStore'
import { createMissionAgentAttacher, type MissionAgentAttacherDeps } from './MissionAgentAttacher'
import { createMissionAgentExitHandler, type ExitHandlerDeps } from './MissionAgentExitHandler'
import { createMissionAgentDirectInput } from './MissionAgentDirectInput'
import { wireMissionAgentStreamHandlers } from './MissionAgentEventWiring'
import { expandSlashCommand } from '../runtime/SlashCommandResolver'
import type { WhiteboardManager } from '../whiteboard/WhiteboardManager'
import { ContextBriefing } from '../whiteboard/ContextBriefing'
import { isWhiteboardOnDemandEnabled } from '../runtime/featureFlags'
import { createLogger } from '../lib/logger'
import { trackEvent } from '../lib/eventTracker'
import { isAllowedCwd } from '../lib/validateCwd'
import type { VersionGate } from '../services/update/VersionGate'
import { ChatTitleService } from '../services/chat/ChatTitleService'
import { ACPClient } from '../acp/ACPClient'
import { createACPAdapter } from '../acp/ACPAdapterFactory'
import { codexResumeSessionId, isCodexOneShotPromptSpent } from './MissionAgentCodexSession'

const log = createLogger('Expert')

export interface MissionAgentLifecycleDeps {
  configCompiler: ConfigCompiler
  agentRegistry: AgentRegistry
  agentStore: AgentStore
  chatStore: ChatStore
  workspaceStore: WorkspaceStore
  tokenUsageStore: TokenUsageStore
  executionLogStore: ExecutionLogStore
  sessionRegistry: SessionRegistry
  store: MissionAgentSessionStore
  versionGate: VersionGate
  getConnectionWs: (connectionId: string) => WebSocket | undefined
  getConnectionChatId: (connectionId: string) => string | undefined
  sendTo: (connectionId: string, msg: Record<string, unknown>) => void
  persistExpertSession: (agentId: string, cliSessionId: string, cwd: string, connectionId: string, provider?: import('../config/types').CliProvider, chatId?: string) => void
  broadcastToChat: (chatId: string, msg: Record<string, unknown>) => void
  /**  WS  GlobalTaskContext  chat  chat:permission-request */
  globalBroadcast?: (msg: Record<string, unknown>) => void
  whiteboardManager?: WhiteboardManager
  onAgentExited?: (chatId: string, agentId: string, exitCode: number, taskCompleted: boolean) => void
}

export const createMissionAgentLifecycle = (deps: MissionAgentLifecycleDeps) => {
  const {
    configCompiler, agentRegistry, agentStore, chatStore, workspaceStore, tokenUsageStore,
    executionLogStore, sessionRegistry, store, versionGate, sendTo,
    persistExpertSession, getConnectionChatId, broadcastToChat, globalBroadcast,
    whiteboardManager, onAgentExited,
  } = deps

  const titleService = new ChatTitleService()
  const briefing = whiteboardManager ? new ContextBriefing(whiteboardManager) : null

  const attacherDeps: MissionAgentAttacherDeps = { sessionRegistry, chatStore, store, getConnectionChatId, sendTo }
  const { trackParticipant, ensureAttachedRunning } = createMissionAgentAttacher(attacherDeps)

  const exitDeps: ExitHandlerDeps = { sessionRegistry, executionLogStore, store, chatStore, agentStore, sendTo, onExited: onAgentExited }
  const { handleExit } = createMissionAgentExitHandler(exitDeps)

  const buildCodexPrompt = (
    primaryTask: string | undefined,
    queuedTasks: Array<{ task: string }>,
  ): string | undefined => {
    const parts: string[] = []
    if (primaryTask?.trim()) parts.push(primaryTask.trim())
    queuedTasks.forEach((queued, index) => {
      if (!queued.task.trim()) return
      parts.push(`Queued user message ${index + 1} received while the agent was starting:\n${queued.task.trim()}`)
    })
    return parts.length > 0 ? parts.join('\n\n---\n\n') : undefined
  }

  const handleStart = async (
    ws: WebSocket,
    payload: { agentId: string; task?: string; images?: Array<{ data: string; mediaType: string }>; cwd?: string; repositories?: Array<{ path: string }>; resumeSessionId?: string; chatId?: string; cols?: number; rows?: number; previousContext?: { agentName: string; lastMessage?: string; jsonlPath?: string }; executionMode?: 't0' | 't1' | 't2' },
    connectionId: string,
  ): Promise<{ started: boolean; sessionId?: string; method?: 'spawned' | 'existing' | 'attached' | 'skipped' }> => {
    try {
      const { agentId, task } = payload
      const executionMode = payload.executionMode
      const chatId = payload.chatId
      if (!chatId) {
        log.error('agent:start missing chatId', { connectionId, agentId })
        sendFrame(ws, {
          type: 'agent:error',
          payload: { agentId, chatId: '', error: 'missing_chat_id', message: 'agent:start payload must carry chatId' },
        })
        return { started: false }
      }
      const key = compositeKey(connectionId, chatId, agentId)

      const isVirtualConnection = connectionId.startsWith('matrix-task-')

      if (versionGate.isBlocked()) {
        const policy = versionGate.getPolicy()
        log.warn('Expert start blocked: client version too low', {
          agentId, chatId,
          clientVersion: versionGate.getClientVersion(),
          minClientVersion: policy?.minClientVersion,
        })
        sendFrame(ws, {
          type: 'agent:version-blocked',
          payload: {
            agentId,
            chatId,
            clientVersion: versionGate.getClientVersion(),
            minClientVersion: policy?.minClientVersion ?? '',
            upgradeMessage: policy?.upgradeMessage,
            upgradeUrl: policy?.upgradeUrl,
          },
        })
        return { started: false }
      }

      const crossSession = sessionRegistry.findByChat(chatId, agentId)
      if (crossSession && crossSession.connectionId !== connectionId) {
        log.warn('Killing duplicate agent on different connection before spawn', {
          chatId, agentId,
          existingConnectionId: crossSession.connectionId,
          newConnectionId: connectionId,
        })
        crossSession.killReason = 'user_stop'
        crossSession.streamManager.kill()
      }

      if (store.isStarting(key)) {
        // Duplicate expert:start during the starting window — the original
        // handleStart's initial-task dispatch already covers this task,
        // so do not enqueue it again. Direct user input arriving during
        // starting goes through ExpertDirectInput, which does enqueue.
        log.info('Agent already starting, skipping duplicate', { agentId })
        return { started: true, method: 'skipped' as const }
      }

      const existing = store.get(key)
      if (existing) {
        if (existing.acpClient.isAlive()) {
          if (task?.trim() && isCodexOneShotPromptSpent(existing)) {
            const persistedSession = chatStore.get(chatId)?.expertSessions?.[agentId]
            const persistedSessionId = typeof persistedSession === 'string'
              ? persistedSession
              : persistedSession?.cliSessionId
            const resumeSessionId = codexResumeSessionId(existing) || persistedSessionId
            log.info('Codex one-shot turn already completed, restarting with resume', { agentId, chatId, resumeSessionId })
            existing.acpClient.destroy()
            sessionRegistry.remove(existing.sessionId)
            store.cleanup(key)
            return handleStart(ws, {
              ...payload,
              cwd: payload.cwd || existing.cwd,
              resumeSessionId: resumeSessionId || payload.resumeSessionId,
            }, connectionId)
          }

          log.info('Agent already running, sending task via prompt', { agentId, sessionId: existing.sessionId })
          sendFrame(ws, {
            type: 'agent:already-running',
            payload: {
              agentId,
              chatId,
              model: existing.model,
              sessionId: existing.sessionId,
              agentName: existing.agentName,
              agentIcon: existing.agentIcon,
              status: 'running',
            },
          })
          if (task?.trim()) {
            const expandedTask = existing.provider !== 'codex'
              ? await expandSlashCommand(task.trim(), existing.cwd)
              : task.trim()
            const promptImages = payload.images?.map(i => ({ data: i.data, mimeType: i.mediaType }))
            existing.acpClient.prompt(existing.sessionId, expandedTask, promptImages).catch(err => {
              const errorMsg = err instanceof Error ? err.message : String(err)
              log.warn('ACP prompt to already-running agent failed', { agentId, chatId, error: errorMsg })
              sendTo(connectionId, {
                type: 'agent:error',
                payload: { agentId, chatId, error: 'acp_prompt_failed', message: `Failed to send task to running agent: ${errorMsg}` },
              })
            })
            log.info('Sent task to already-running agent via prompt', { agentId, taskLen: expandedTask.length })
          }
          return { started: true, sessionId: existing.sessionId, method: 'existing' as const }
        }
        log.warn('Agent in store but process is dead, cleaning up', { agentId })
        store.cleanup(key)
      }

      const attached = ensureAttachedRunning(ws, chatId, agentId, connectionId)
      if (attached) {
        if (task?.trim()) {
          const rawTask = task.trim()
          const expandedAttachedTask = attached.provider !== 'codex'
            ? await expandSlashCommand(rawTask, attached.cwd)
            : rawTask
          if (!attached.cliSessionId && attached.provider !== 'codex') {
            store.enqueuePendingTask(key, {
              task: expandedAttachedTask,
              images: payload.images,
              enqueuedAt: Date.now(),
              connectionId,
            })
          } else {
            attached.acpClient.write(expandedAttachedTask, payload.images)
          }
        }
        return { started: true, sessionId: attached.sessionId, method: 'attached' as const }
      }

      store.markStarting(key)

      const agentDef = agentRegistry.get(agentId)
      const storedAgent = !agentDef ? agentStore.get(agentId) : undefined
      if (!agentDef && !storedAgent) {
        sendFrame(ws, {
          type: 'agent:error',
          payload: { agentId, chatId, message: `Expert ${agentId} not found` },
        })
        store.clearStarting(key)
        return { started: false }
      }

      const agent = agentDef ? agentDefToAgent(agentDef) : storedAgent!

      if (chatId) {
        const chat = chatStore.get(chatId)
        if (chat?.model) {
          agent.model = chat.model
        }
      }

      const provider = agent.provider || 'claude'
      const streamManager = new StreamJsonManager()
      const sessionId = streamManager.getSessionId()

      let cwd = payload.cwd
      if (!cwd && chatId) {
        const chat = chatStore.get(chatId)
        if (chat?.workspaceId) {
          const workspace = workspaceStore.get(chat.workspaceId)
          cwd = workspace?.repositories[0]?.path
        }
      }
      if (!cwd) {
        log.warn('CWD resolution fell through to process.cwd() — workspace isolation may be broken', { agentId, chatId })
        cwd = process.cwd()
      }

      if (!isAllowedCwd(cwd)) {
        log.warn('Expert start rejected: cwd outside allowed roots', { agentId, cwd, connectionId })
        sendFrame(ws, {
          type: 'agent:start-failed',
          payload: { agentId, chatId, message: `Refused: cwd "${cwd}" is outside allowed workspace` },
        })
        return { started: false }
      }

      let acpClient: ACPClient

      const llmEnv: Record<string, string> = {}

      const availableExperts = agent.subAgentNames?.length
        ? agent.subAgentNames.map((name) => {
            const def = agentRegistry.get(name)
            return { name, description: def?.description || '' }
          })
        : undefined

      const parentChain: string[] = process.env.TEEMAI_DISPATCH_CHAIN
        ? JSON.parse(process.env.TEEMAI_DISPATCH_CHAIN)
        : []
      const dispatchChain = [...parentChain, agentId]

      const compiled = await configCompiler.compile(agent, {
        repositories: payload.repositories?.length ? payload.repositories : [{ path: cwd }],
        serverPort: getServerPort(),
        resumeSessionId: payload.resumeSessionId,
        connectionId,
        availableExperts,
        chatId,
        model: agent.model,
        instanceId: agentId,
        dispatchChain,
        previousContext: payload.previousContext,
      }, provider, llmEnv)

      if (provider === 'claude' || provider === 'codex') {
        const effectiveSessionId = compiled.presetSessionId || payload.resumeSessionId
        if (effectiveSessionId) {
          streamManager.setCliSessionId(effectiveSessionId)
        }
      }

      const adapter = createACPAdapter(provider, streamManager, {
        command: compiled.command,
        baseArgs: compiled.args,
        cwd,
      })
      acpClient = new ACPClient(adapter)
      acpClient.initialize().catch((err) => {
        const errorMsg = err instanceof Error ? err.message : String(err)
        log.warn('ACP initialize failed', { agentId, sessionId, error: errorMsg })
        trackEvent('agent', 'agent.acp_initialize_failed', { agentId, sessionId, error: errorMsg })
        sendTo(connectionId, {
          type: 'agent:error',
          payload: { agentId, chatId, error: 'acp_initialize_failed', message: errorMsg },
        })
      })
      log.info('ACP client created for agent', { agentId, sessionId })

      sessionRegistry.register({
        sessionId,
        streamManager,
        acpClient,
        chatId,
        model: agent.model,
        agentId,
        agentName: agent.name,
        agentIcon: agent.icon,
        cwd,
        connectedWs: ws,
        connectionId,
        connectionType: isVirtualConnection ? 'virtual' : 'browser',
        activitySnapshot: null,
        createdAt: Date.now(),
        disconnectedAt: null,
      })

      let startedSent = false

      const { fileCollector, tokenTracker } = wireMissionAgentStreamHandlers({
        streamManager, acpClient, sessionRegistry, store, chatStore, tokenUsageStore,
        sessionId, key, agentId, chatId, agentName: agent.name, cwd, provider,
        persistExpertSession, connectionId, globalBroadcast, ws,
        onExit: (exitCode, signal, ctx) => {
          handleExit({
            agentId, chatId, sessionId, key, agentName: agent.name,
            resumeSessionId: payload.resumeSessionId,
            startedSent, fileCollector: ctx.fileCollector, tokenTracker: ctx.tokenTracker,
            compiledCleanup: () => compiled.cleanup(),
          }, exitCode, signal)
        },
      })

      const onDemandActive = isWhiteboardOnDemandEnabled()
      const expandedTask = task && provider !== 'codex'
        ? await expandSlashCommand(task, cwd)
        : task
      const wrappedTask = expandedTask && briefing && !onDemandActive
        ? briefing.maybeWrapTask(expandedTask, { chatId, agentId, agentName: agent.name, agentTags: agent.tags })
        : expandedTask

      const spawnArgs = compiled.args.slice()

      store.set(key, {
        sessionId,
        acpClient,
        agentName: agent.name,
        agentIcon: agent.icon,
        cwd,
        cliSessionId: payload.resumeSessionId,
        provider,
        connectionId,
        chatId,
        model: agent.model,
      })

      // Start stream-json Process
      await streamManager.spawn({
        command: compiled.command,
        args: spawnArgs,
        cwd: compiled.cwd,
        env: compiled.env,
        provider,
      })

      acpClient.markReady()

      store.clearStarting(key)

      sendTo(connectionId, {
        type: 'agent:started',
        payload: { agentId, chatId, sessionId, agentName: agent.name, agentIcon: agent.icon, status: 'running', cwd, ...(executionMode && { executionMode }) },
      })

      sendTo(connectionId, {
        type: 'agent:list-updated',
        payload: { agents: store.getExpertListForConnection(connectionId, chatId), chatId },
      })

      startedSent = true

      if (payload.resumeSessionId && provider === 'claude') {
        streamManager.emit('cli-session-id', payload.resumeSessionId)
      }

      const codexQueuedTasks = provider === 'codex'
        ? store.drainPendingTasks(key)
        : []
      const promptText = provider === 'codex'
        ? buildCodexPrompt(wrappedTask, codexQueuedTasks)
        : wrappedTask

      if (promptText) {
        const briefingInjected = !!task && promptText !== task
        const initialImages = payload.images?.map(i => ({ data: i.data, mimeType: i.mediaType }))
        const queuedImageCount = codexQueuedTasks.reduce((count, queued) => count + (queued.images?.length ?? 0), 0)
        const promptImages = provider === 'codex' ? undefined : initialImages
        if (provider === 'codex' && ((initialImages?.length ?? 0) > 0 || queuedImageCount > 0)) {
          log.warn('Codex provider does not support image attachments on initial task; dropping images', {
            agentId,
            imageCount: (initialImages?.length ?? 0) + queuedImageCount,
          })
        }
        log.info('Sending task via ACP prompt', { agentId, task: promptText.substring(0, 50), briefingInjected, imageCount: promptImages?.length ?? 0, expanded: !!task && promptText !== task, provider })
        acpClient.prompt(sessionId, promptText, promptImages).catch(err => {
          const errorMsg = err instanceof Error ? err.message : String(err)
          log.warn('ACP initial prompt failed', { agentId, error: errorMsg })
          sendTo(connectionId, {
            type: 'agent:error',
            payload: { agentId, chatId, error: 'prompt_failed', message: errorMsg },
          })
        })
      }

      // Claude flushes from ExpertEventWiring's `cli-session-id` handler.
      // Codex `exec` is one-shot, so startup-window messages are folded into
      // the initial stdin prompt above instead of being sent as extra prompts
      // to a process that has already consumed stdin.

      log.info('Expert started', { agentName: agent.name, agentId, sessionId, connectionId })
      trackEvent('agent', 'agent.started', { agentId, agentName: agent.name, chatId, connectionId })

      const workspaceId = chatStore.get(chatId)?.workspaceId || ''
      const handoffFrom = payload.previousContext ? (store.getMeta(key, 'handoffFrom') as string | undefined) : undefined
      executionLogStore.create({ chatId, workspaceId, agentId, executionMode, handoffFrom }).then((execLog) => {
        store.setMeta(key, 'executionLogId', execLog.id)
      }).catch((err) => {
        log.warn('Failed to create execution log', { agentId, error: err instanceof Error ? err.message : String(err) })
      })

      return { started: true, sessionId, method: 'spawned' as const }

    } catch (error) {
      const chatId = payload.chatId || ''
      const key = compositeKey(connectionId, chatId, payload.agentId)
      store.clearStarting(key)

      const entry = store.get(key)
      if (entry) {
        sessionRegistry.remove(entry.sessionId)
        store.cleanup(key)
      }

      const errorMsg = error instanceof Error ? error.message : String(error)
      const isCommandNotFound = errorMsg.includes('Command not found')
      log.error('Start error', { agentId: payload.agentId, error: errorMsg, isCommandNotFound })
      trackEvent('agent', 'agent.start_failed', { agentId: payload.agentId, error: errorMsg, isCommandNotFound, connectionId })
      let displayMsg = errorMsg
      if (isCommandNotFound && isQoderVendor(provider)) {
        displayMsg = 'Qoder CLI not found. Install it with: curl -fsSL https://qoder.com/install | bash'
      }
      sendFrame(ws, {
        type: 'agent:error',
        payload: {
          agentId: payload.agentId,
          chatId: chatId || 'unknown',
          error: isCommandNotFound ? 'command_not_found' : 'start_failed',
          message: displayMsg,
        },
      })

      sendTo(connectionId, {
        type: 'agent:list-updated',
        payload: { agents: store.getExpertListForConnection(connectionId, chatId), chatId },
      })

      return { started: false }
    }
  }

  const directInputDeps: import('./MissionAgentDirectInput').MissionAgentDirectInputDeps = {
    store, chatStore, sessionRegistry, titleService,
    broadcastToChat, ensureAttachedRunning, trackParticipant, handleStart,
  }
  const { handleDirectInput } = createMissionAgentDirectInput(directInputDeps)

  return { handleStart, handleDirectInput }
}
