/**
 * ExpertEventWiring -  Expert Agent
 *
 *  ExpertLifecycle  StreamJsonManager  ACPClient
 *  FileOperationCollector + MissionAgentTokenTracker + Activity handler
 *  spawn / cleanup
 */

import type { WebSocket } from 'ws'
import { StreamJsonManager } from '../terminal/StreamJsonManager'
import { FileOperationCollector, type FileOperationEvent } from '../terminal/FileOperationCollector'
import type { SessionRegistry } from '../terminal/SessionRegistry'
import type { ChatStore } from '../stores/ChatStore'
import type { TokenUsageStore } from '../stores/TokenUsageStore'
import type { ACPClient } from '../acp/ACPClient'
import { acpUpdateToWSMessage, type BridgeContext } from '../acp/ACPToFrontendBridge'
import type { ACPSessionUpdateParams } from '../../shared/acp-types'
import type { MissionAgentSessionStore } from './MissionAgentSessionStore'
import { MissionAgentTokenTracker } from './MissionAgentTokenTracker'
import { createActivityHandler } from './MissionAgentActivityHandler'
import { flushPendingTasks } from './MissionAgentPendingTaskFlush'
import { createLogger } from '../lib/logger'
import { scanPluginSlashCommands, scanProjectSlashCommands, scanUserSkills } from '../runtime/PluginCommandsScanner'

const log = createLogger('ExpertEventWiring')

export interface MissionAgentEventWiringDeps {
  streamManager: StreamJsonManager
  acpClient: ACPClient
  sessionRegistry: SessionRegistry
  store: MissionAgentSessionStore
  chatStore: ChatStore
  tokenUsageStore: TokenUsageStore
  sessionId: string
  key: string
  agentId: string
  chatId: string
  agentName: string
  cwd: string
  provider: import('../config/types').CliProvider
  persistExpertSession: (agentId: string, cliSessionId: string, cwd: string, connectionId: string, provider?: import('../config/types').CliProvider, chatId?: string) => void
  connectionId: string
  globalBroadcast?: (msg: Record<string, unknown>) => void
  onExit: (exitCode: number, signal: number | undefined, ctx: { fileCollector: FileOperationCollector; tokenTracker: MissionAgentTokenTracker }) => void
  ws: WebSocket
}

export interface WiredMissionAgentHandles {
  fileCollector: FileOperationCollector
  tokenTracker: MissionAgentTokenTracker
}

/**
 *  StreamManager + ACPClient  caller
 */
export const wireMissionAgentStreamHandlers = (deps: MissionAgentEventWiringDeps): WiredMissionAgentHandles => {
  const {
    streamManager, acpClient, sessionRegistry, store, chatStore, tokenUsageStore,
    sessionId, key, agentId, chatId, agentName, cwd, provider,
    persistExpertSession, connectionId, globalBroadcast, onExit,
  } = deps

  streamManager.on('cli-session-id', (csid: string) => {
    const currentKey = store.findBySessionId(sessionId)?.key ?? key
    const entry = store.get(currentKey)
    if (entry) entry.cliSessionId = csid
    sessionRegistry.updateCliSessionId(sessionId, csid)
    log.info('Captured CLI session ID', { agentId, cliSessionId: csid, provider })
    persistExpertSession(agentId, csid, cwd, connectionId, provider, chatId)

    // Claude readiness boundary: queue entries from `expert:input` during
    // the starting window or `expert:start` on an attached-no-cliSessionId
    // expert are flushed here. Codex flushes from ExpertLifecycle instead.
    if (provider === 'claude') {
      flushPendingTasks({ store, acpClient, sessionRegistry, sessionId, key: currentKey, agentId, chatId })
    }
  })

  const fileCollector = new FileOperationCollector(agentId)
  fileCollector.on('file-operations', (ops: FileOperationEvent[]) => {
    sessionRegistry.sendToSession(sessionId, {
      type: 'session:file-operation',
      payload: { sessionId, chatId, agentId, operations: ops },
    })
  })

  const tokenTracker = new MissionAgentTokenTracker(chatId, agentId, tokenUsageStore, chatStore)

  const handleActivity = createActivityHandler({
    store, sessionRegistry, sessionId, key, agentId, chatId,
    fileCollector, tokenTracker,
  })

  const bridgeCtx: BridgeContext = { agentId, sessionId, chatId }
  acpClient.onUpdate((params: ACPSessionUpdateParams) => {
    const wsMsg = acpUpdateToWSMessage(params.update, bridgeCtx)
    if (wsMsg) {
      if (wsMsg.type === 'agent:activity') {
        const session = sessionRegistry.get(sessionId)
        if (session?.createdAt) {
          (wsMsg.payload as Record<string, unknown>).startedAt = session.createdAt
        }
      }
      sessionRegistry.sendToSession(sessionId, wsMsg as unknown as Record<string, unknown>)
    }
  })

  acpClient.onClientRequest((req) => {
    if (req.method === 'session/request_permission') {
      const params = req.params as import('../../shared/acp-types').ACPRequestPermissionParams
      const permissionPayload = {
        agentId,
        chatId,
        sessionId,
        requestId: req.requestId,
        toolCall: params.toolCall,
        options: params.options,
      }
      sessionRegistry.sendToSession(sessionId, {
        type: 'agent:permission-request',
        payload: permissionPayload,
      })
      globalBroadcast?.({
        type: 'mission.permission-request',
        payload: permissionPayload,
      })
    }
  })

  acpClient.onPermissionTimeout((info) => {
    const errorPayload = {
      agentId,
      chatId,
      sessionId,
      requestId: info.requestId,
      error: 'permission_timeout',
      message: `Permission request "${info.toolTitle}" timed out after ${info.timeoutMs}ms`,
    }
    sessionRegistry.sendToSession(sessionId, {
      type: 'agent:error',
      payload: errorPayload,
    })
    sessionRegistry.sendToSession(sessionId, {
      type: 'agent:permission-timeout',
      payload: {
        agentId,
        chatId,
        sessionId,
        requestId: info.requestId,
        toolCallId: info.toolCallId,
      },
    })
  })

  streamManager.on('cli-init', (initData: { slashCommands: string[]; model?: string }) => {
    const sendCommands = (commands: string[]) => {
      sessionRegistry.sendToSession(sessionId, {
        type: 'agent:slash-commands',
        payload: { agentId, chatId, commands },
      })
    }

    // Send CLI-reported commands immediately so the menu is responsive even
    // if the plugin scan is slow or fails.
    sendCommands(initData.slashCommands)

    // Then merge in plugin-provided commands (`<plugin>:<skill>`) and project/user
    // custom commands from `.claude/commands/` which stream-json mode does not enumerate.
    Promise.all([
      scanPluginSlashCommands(),
      scanProjectSlashCommands(cwd),
      scanUserSkills(),
    ])
      .then(([pluginCommands, projectCommands, userSkills]) => {
        const extra = [...pluginCommands, ...projectCommands, ...userSkills]
        if (extra.length === 0) return
        const merged = Array.from(new Set([...initData.slashCommands, ...extra])).sort()
        sendCommands(merged)
      })
      .catch((err) => {
        log.warn('Slash commands scan failed', {
          agentId,
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        })
      })
  })

  streamManager.on('activity', handleActivity)

  streamManager.on('exit', ({ exitCode, signal }: { exitCode: number; signal?: number }) => {
    onExit(exitCode, signal, { fileCollector, tokenTracker })
  })

  streamManager.on('started', ({ pid }: { sessionId: string; pid: number }) => {
    log.info('Agent process started', { agentName, agentId, pid })
  })

  return { fileCollector, tokenTracker }
}
