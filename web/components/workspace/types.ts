import type { WorktreeSession } from '@/types/chat'
import type {
  MissionAgent,
  MissionAgentStatus,
  MissionAgentRole,
  ChatMember,
  ChatMemberStatus,
  ChatMemberRole,
} from '@shared/chat-types'

export type { MissionAgent, MissionAgentStatus, MissionAgentRole }
/** @deprecated use MissionAgent* — kept one release for cross-boundary callers */
export type { ChatMember, ChatMemberStatus, ChatMemberRole }

export interface Repository {
  id: string
  path: string
  name: string
  gitInfo?: { currentBranch?: string; remoteUrl?: string }
}

export interface Workspace {
  id: string
  name: string
  repositories: Repository[]
  agentTeam?: { primaryAgentId: string; teamAgentIds: string[] }
  worktreeEnabled?: boolean
  hiddenAt?: number | null
  lastAccessedAt: string
  createdAt: string
}

export interface Chat {
  id: string
  workspaceId: string
  title: string
  primaryAgentId: string
  teamAgentIds: string[]
  model?: string
  usedModels?: string[]
  status: 'running' | 'idle' | 'stopped' | 'merged'
  totalCost?: number
  totalTokens?: { input: number; output: number; cacheRead?: number; cacheCreation?: number }
  totalToolCalls?: number
  worktreeSessions?: WorktreeSession[]
  /** Per-agent live state enriched by the server. Optional because legacy
   *  read paths may not yet pass through enrichWithMembers. */
  members?: MissionAgent[]
  /** 'native' for chats created in TeemAI, 'external' for adopted local
   *  Claude/Codex jsonl sessions. Defaults to 'native' server-side. */
  source?: 'native' | 'external'
  /** Original cwd for adopted external chats. Always set when source='external'. */
  externalCwd?: string
  /** User explicitly archived (ms since epoch). Null/undefined means not
   *  manually archived; auto-archive may still hide the chat client-side. */
  archivedAt?: number | null
  /** User pinned to top of sidebar (ms since epoch). */
  pinnedAt?: number | null
  /** Agent's last message text when in a waiting state — shown as subtitle on
   *  the Mission row so the user knows what needs attention. */
  waitingReason?: string
  createdAt: string
  lastMessageAt: string
}
