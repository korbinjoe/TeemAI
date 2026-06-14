/**
 * Mission-agent participant types — the per-agent roster entry shown in a
 * mission's session rows, agent panes, and mobile dashboard.
 *
 * Canonical names are `MissionAgent*`. The `ChatMember*` aliases are kept for
 * one release so cross-boundary callers compiled against the old names keep
 * working; new code must use `MissionAgent*`.
 */

export type MissionAgentStatus = 'running' | 'waiting' | 'waiting_input' | 'error' | 'idle' | 'done'

export type MissionAgentRole = 'lead' | 'worker'

export interface MissionAgent {
  agentId: string
  role: MissionAgentRole
  status: MissionAgentStatus
  lastMessageAt: string
  lastMessage?: string
  cliSessionId?: string
}

/** @deprecated use {@link MissionAgentStatus} */
export type ChatMemberStatus = MissionAgentStatus
/** @deprecated use {@link MissionAgentRole} */
export type ChatMemberRole = MissionAgentRole
/** @deprecated use {@link MissionAgent} */
export type ChatMember = MissionAgent
