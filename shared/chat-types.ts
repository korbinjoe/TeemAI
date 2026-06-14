/**
 * Mission-agent participant types — the per-agent roster entry shown in a
 * mission's session rows, agent panes, and mobile dashboard.
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
