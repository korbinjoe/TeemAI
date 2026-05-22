export interface ExpertStartedPayload {
  agentId: string
  chatId: string
  agentName: string
  sessionId: string
  agentIcon: string
  status: 'running' | 'completed'
  exitCode?: number
}

export interface ExpertDataPayload {
  agentId: string
  chatId: string
  sessionId?: string
  seq?: number
  snapshot?: boolean
  data: string
  ptySize?: { cols: number; rows: number }
}

export interface ExpertExitPayload {
  agentId: string
  chatId: string
  exitCode?: number
}

export interface ExpertActivityPayload {
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

export interface ExpertListItem {
  agentId: string
  sessionId: string
  agentName: string
  agentIcon: string
  status: 'running' | 'completed'
  exitCode?: number
  completedAt?: string
}

export interface ExpertListPayload {
  experts: ExpertListItem[]
}

export interface ExpertErrorPayload {
  agentId: string
  chatId: string
  message: string
}

export interface ExpertStartFailedPayload {
  agentId: string
  chatId: string
  exitCode?: number
  message?: string
}

export interface ExpertVersionBlockedPayload {
  agentId: string
  chatId: string
  clientVersion: string
  minClientVersion: string
  upgradeMessage?: string
  upgradeUrl?: string
}

export interface ExpertResumeFailedPayload {
  agentId: string
  chatId: string
  agentName: string
  reason: string
  sessionId?: string
  message?: string
}

export interface ExpertSlashCommandsPayload {
  agentId: string
  chatId: string
  commands: string[]
}

export interface PlanEntry {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  priority?: 'low' | 'medium' | 'high'
}

export interface ExpertPlanUpdatePayload {
  agentId: string
  chatId: string
  sessionId: string
  plan: { entries: PlanEntry[] }
}

export interface ExpertModeChangePayload {
  agentId: string
  chatId: string
  sessionId: string
  currentModeId: string
}

export interface ExpertCommandsUpdatePayload {
  agentId: string
  chatId: string
  sessionId: string
  availableCommands: string[]
}

export interface ExpertSessionInfoPayload {
  agentId: string
  chatId: string
  sessionId: string
  title?: string
  updatedAt?: string
}
