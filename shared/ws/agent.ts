export interface AgentStartedPayload {
  agentId: string
  chatId: string
  agentName: string
  sessionId: string
  agentIcon: string
  status: 'running' | 'completed'
  exitCode?: number
}

export interface AgentDataPayload {
  agentId: string
  chatId: string
  sessionId?: string
  seq?: number
  snapshot?: boolean
  data: string
  ptySize?: { cols: number; rows: number }
}

export interface AgentExitPayload {
  agentId: string
  chatId: string
  exitCode?: number
}

export interface AgentActivityPayload {
  agentId: string
  chatId: string
  activity: {
    phase: string
    currentTool?: string
    toolCount: number
    toolCompleted: number
    cost?: number
  }
}

export interface AgentListItem {
  agentId: string
  sessionId: string
  agentName: string
  agentIcon: string
  status: 'running' | 'completed'
  exitCode?: number
  completedAt?: string
}

export interface AgentListPayload {
  /** Canonical field (PR-D). Legacy consumers read `experts`; both are emitted during the compat window. */
  agents: AgentListItem[]
  /** @deprecated wire-compat mirror of `agents`; dropped in PR-F. */
  experts?: AgentListItem[]
}

export interface AgentErrorPayload {
  agentId: string
  chatId: string
  message: string
}

export interface AgentStartFailedPayload {
  agentId: string
  chatId: string
  exitCode?: number
  message?: string
}

export interface AgentVersionBlockedPayload {
  agentId: string
  chatId: string
  clientVersion: string
  minClientVersion: string
  upgradeMessage?: string
  upgradeUrl?: string
}

export interface AgentResumeFailedPayload {
  agentId: string
  chatId: string
  agentName: string
  reason: string
  sessionId?: string
  message?: string
}

export interface AgentSlashCommandsPayload {
  agentId: string
  chatId: string
  commands: string[]
}

export interface PlanEntry {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  priority?: 'low' | 'medium' | 'high'
}

export interface AgentPlanUpdatePayload {
  agentId: string
  chatId: string
  sessionId: string
  plan: { entries: PlanEntry[] }
}

export interface AgentModeChangePayload {
  agentId: string
  chatId: string
  sessionId: string
  currentModeId: string
}

export interface AgentCommandsUpdatePayload {
  agentId: string
  chatId: string
  sessionId: string
  availableCommands: string[]
}

export interface AgentSessionInfoPayload {
  agentId: string
  chatId: string
  sessionId: string
  title?: string
  updatedAt?: string
}

// ── Deprecated Expert* aliases (PR-D compat window; removed in PR-F) ──────────
/** @deprecated use {@link AgentStartedPayload} */
export type ExpertStartedPayload = AgentStartedPayload
/** @deprecated use {@link AgentDataPayload} */
export type ExpertDataPayload = AgentDataPayload
/** @deprecated use {@link AgentExitPayload} */
export type ExpertExitPayload = AgentExitPayload
/** @deprecated use {@link AgentActivityPayload} */
export type ExpertActivityPayload = AgentActivityPayload
/** @deprecated use {@link AgentListItem} */
export type ExpertListItem = AgentListItem
/** @deprecated use {@link AgentErrorPayload} */
export type ExpertErrorPayload = AgentErrorPayload
/** @deprecated use {@link AgentStartFailedPayload} */
export type ExpertStartFailedPayload = AgentStartFailedPayload
/** @deprecated use {@link AgentVersionBlockedPayload} */
export type ExpertVersionBlockedPayload = AgentVersionBlockedPayload
/** @deprecated use {@link AgentResumeFailedPayload} */
export type ExpertResumeFailedPayload = AgentResumeFailedPayload
/** @deprecated use {@link AgentSlashCommandsPayload} */
export type ExpertSlashCommandsPayload = AgentSlashCommandsPayload
/** @deprecated use {@link AgentPlanUpdatePayload} */
export type ExpertPlanUpdatePayload = AgentPlanUpdatePayload
/** @deprecated use {@link AgentModeChangePayload} */
export type ExpertModeChangePayload = AgentModeChangePayload
/** @deprecated use {@link AgentCommandsUpdatePayload} */
export type ExpertCommandsUpdatePayload = AgentCommandsUpdatePayload
/** @deprecated use {@link AgentSessionInfoPayload} */
export type ExpertSessionInfoPayload = AgentSessionInfoPayload

/**
 * @deprecated use {@link AgentListPayload}. The legacy shape required `experts`;
 * the canonical {@link AgentListPayload} uses `agents` and mirrors `experts`.
 */
export interface ExpertListPayload {
  experts: AgentListItem[]
  agents?: AgentListItem[]
}
