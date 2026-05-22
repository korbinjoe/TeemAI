/**
 * CronJobLauncher -  Agent
 *
 *  WebSocket
 *  StreamJsonManager + ConfigCompiler  CLI
 */

import { StreamJsonManager } from '../../terminal/StreamJsonManager'
import { ConfigCompiler } from '../../runtime/ConfigCompiler'
import type { AgentRegistry } from '../../config/AgentRegistry'
import { agentDefToAgent } from '../../config/types'
import { getServerPort } from '../../lib/serverPort'
import type { SessionRegistry } from '../../terminal/SessionRegistry'
import type { WorkspaceStore } from '../../stores/WorkspaceStore'
import type { ChatStore } from '../../stores/ChatStore'
import type { CronJob, Chat } from '../../config/types'
import { createLogger } from '../../lib/logger'

const log = createLogger('CronJobLauncher')

const EXECUTION_TIMEOUT_MS = 30 * 60 * 1000

export interface LaunchResult {
  exitCode: number
  lastAssistantMessage: string | null
}

export class CronJobLauncher {
  constructor(
    private configCompiler: ConfigCompiler,
    private agentRegistry: AgentRegistry,
    private sessionRegistry: SessionRegistry,
    private workspaceStore: WorkspaceStore,
    private chatStore: ChatStore,
    private sharedWorkspaceDir?: string,
  ) {}

  /**
   *  Agent
   * @returns LaunchResult { exitCode, lastAssistantMessage }
   */
  async launch(job: CronJob, chat: Chat): Promise<LaunchResult> {
    const workspace = this.workspaceStore.get(job.workspaceId)
    const cwd = workspace?.repositories[0]?.path ?? process.env.HOME ?? '/'
    const agentId = job.agentId ?? chat.primaryAgentId
    const connectionId = `cron-${job.id}-${Date.now()}`

    const agentDef = agentId
      ? (this.agentRegistry.get(agentId) ?? this.agentRegistry.list().find((a) => a.id === agentId))
      : this.agentRegistry.list()[0]

    if (!agentDef) {
      throw new Error(`Agent not found: ${agentId}`)
    }

    const freshDef = this.sharedWorkspaceDir && agentDef.workspaceDir
      ? await this.agentRegistry.reloadAgentDir(agentDef.id).catch(() => null) ?? agentDef
      : agentDef

    const agent = agentDefToAgent(freshDef)
    const provider = agent.provider || 'claude'
    const manager = new StreamJsonManager()
    const sessionId = manager.getSessionId()

    const llmEnv: Record<string, string> = {}

    const compiled = await this.configCompiler.compile(agent, {
      repositories: workspace?.repositories.map((r) => ({ path: r.path })) ?? [{ path: cwd }],
      serverPort: getServerPort(),
      connectionId,
      sharedWorkspaceDir: this.sharedWorkspaceDir,
    }, provider, llmEnv)

    return new Promise<LaunchResult>((resolve, reject) => {
      let settled = false
      let promptSent = false
      let fallbackTimer: ReturnType<typeof setTimeout> | null = null

      const settle = (exitCode: number) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (fallbackTimer) clearTimeout(fallbackTimer)
        resolve({ exitCode, lastAssistantMessage: null })
      }

      const fail = (err: Error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (fallbackTimer) clearTimeout(fallbackTimer)
        reject(err)
      }

      const sendPrompt = () => {
        if (promptSent || settled) return
        promptSent = true
        try {
          manager.write(job.prompt)
          log.info('Prompt sent', { agentId })
        } catch (err) {
          log.error('Failed to send prompt', { agentId, error: err instanceof Error ? err.message : String(err) })
          fail(err instanceof Error ? err : new Error('Failed to send prompt'))
        }
      }

      manager.on('cli-session-id', (cliSessionId: string) => {
        sendPrompt()
        this.chatStore.update(chat.id, {
          expertSessions: { ...chat.expertSessions, [freshDef.id]: { cliSessionId, provider, cwd } },
        }).catch((err) => log.error('Failed to persist cron session', { agentId, error: String(err) }))
      })

      manager.on('activity', ({ phase }: { phase: string }) => {
        if (phase === 'waiting_input' && promptSent && !settled) {
          log.info('Task completed, auto-killing agent', { agentId })
          try { manager.kill() } catch { /* ignore */ }
        }
      })

      fallbackTimer = setTimeout(() => sendPrompt(), 10000)

      manager.on('exit', ({ exitCode }: { exitCode: number }) => {
        log.info('Agent exited', { exitCode })
        settle(exitCode)
      })

      this.sessionRegistry.register({
        sessionId,
        streamManager: manager,
        chatId: chat.id,
        agentId: freshDef.id,
        agentName: freshDef.name,
        cwd,
        connectedWs: null,
        connectionId,
        activitySnapshot: null,
        createdAt: Date.now(),
        disconnectedAt: null,
      })

      const timer = setTimeout(() => {
        try { manager.kill() } catch { /* ignore */ }
        fail(new Error(`Cron job execution timeout (${EXECUTION_TIMEOUT_MS / 60000}min)`))
      }, EXECUTION_TIMEOUT_MS)

      manager.spawn({
        command: compiled.command,
        args: compiled.args,
        cwd: compiled.cwd,
        env: compiled.env,
        provider,
      }).then(() => {
        log.info('Agent started', { agentName: freshDef.name, agentId: freshDef.id, sessionId })
      }).catch((err) => {
        fail(err instanceof Error ? err : new Error('Failed to start agent'))
      })
    })
  }
}
