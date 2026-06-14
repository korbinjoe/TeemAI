import { nanoid } from 'nanoid'
import type { Chat, WorktreeSession } from '../../config/types'
import type { ChatStore } from '../../stores/ChatStore'
import type { WorkspaceStore } from '../../stores/WorkspaceStore'
import type { AgentStore } from '../../stores/AgentStore'
import { WorktreeManager, detectGitRepo } from '../../git/WorktreeManager'
import { createLogger } from '../../lib/logger'

const log = createLogger('MissionService')

interface MissionServiceDeps {
  chatStore: ChatStore
  workspaceStore: WorkspaceStore
  agentStore: AgentStore
}

export class MissionService {
  private chatStore: ChatStore
  private workspaceStore: WorkspaceStore
  private agentStore: AgentStore

  constructor(deps: MissionServiceDeps) {
    this.chatStore = deps.chatStore
    this.workspaceStore = deps.workspaceStore
    this.agentStore = deps.agentStore
  }

  /**
   *  Chat Workspace  Worktree Agent Team
   * @param params.primaryAgentId  workspace.agentTeam.primaryAgentId
   */
  async createChat(params: {
    workspaceId: string
    model?: string
    title?: string
    primaryAgentId?: string
  }): Promise<Chat> {
    const workspace = this.workspaceStore.get(params.workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    const primaryAgent = workspace.agentTeam?.primaryAgentId
      ? this.agentStore.get(workspace.agentTeam.primaryAgentId)
      : undefined

    const worktreeSessions: WorktreeSession[] = []
    if (workspace.worktreeEnabled) {
      for (const repo of workspace.repositories) {
        try {
          const gitInfo = await detectGitRepo(repo.path)
          if (!gitInfo.isGit || !gitInfo.repoRoot) continue

          const manager = new WorktreeManager(gitInfo.repoRoot)
          const result = await manager.create({
            sessionId: nanoid(8),
            baseBranch: gitInfo.currentBranch,
          })

          worktreeSessions.push({
            id: nanoid(8),
            workspaceId: workspace.id,
            repositoryId: repo.id,
            worktreePath: result.path,
            branch: result.branch,
            baseBranch: gitInfo.currentBranch || 'main',
            status: 'active',
            createdAt: new Date().toISOString(),
          })
        } catch (err) {
          log.warn('Failed to create worktree', { repoPath: repo.path, error: err instanceof Error ? err.message : String(err) })
        }
      }
    }

    const teamIds = workspace.agentTeam?.teamAgentIds
      || primaryAgent?.subAgentNames
      || []

    const chat = await this.chatStore.create({
      workspaceId: workspace.id,
      title: params.title || 'New Session',
      primaryAgentId: params.primaryAgentId
        ?? workspace.agentTeam?.primaryAgentId
        ?? primaryAgent?.id
        ?? 'agent',
      teamAgentIds: teamIds,
      model: params.model,
    })

    if (worktreeSessions.length > 0) {
      try {
        await this.chatStore.update(chat.id, { worktreeSessions })
        chat.worktreeSessions = worktreeSessions
      } catch (err) {
        log.warn('Failed to attach worktree sessions', { error: err instanceof Error ? err.message : String(err) })
      }
    }

    try {
      await this.workspaceStore.update(workspace.id, {})
    } catch (err) {
      log.warn('Failed to update workspace lastAccessedAt', { error: err instanceof Error ? err.message : String(err) })
    }

    return chat
  }

  getAvailableExperts(teamNames: string[]): Array<{ name: string; description: string }> {
    return teamNames.map((name) => {
      const agent = this.agentStore.get(name)
      return { name, description: agent?.description || '' }
    })
  }
}

/** @deprecated PR-D: use MissionService. */
export const ChatService = MissionService
/** @deprecated PR-D: use MissionService. */
export type ChatService = MissionService
