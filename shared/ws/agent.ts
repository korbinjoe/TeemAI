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
  sessionId?: string
  exitCode?: number
  signal?: number
  exitReason?: 'user_stop' | 'timeout' | 'model_switch'
  finalActivity?: unknown
  turnExit?: boolean
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
  cwd?: string
}

export interface AgentListPayload {
  agents: AgentListItem[]
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
