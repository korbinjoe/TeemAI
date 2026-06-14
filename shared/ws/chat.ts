import type { ExpertPermissionRequestPayload } from './permission'

export interface MissionStatusChangedPayload {
  chatId: string
  status: string
}

export interface AgentActivitySnapshot {
  agentId: string
  agentName: string
  phase: string
  currentTool?: string
  toolCount: number
  toolCompleted: number
  cost?: number
  logLine?: string
  fileOp?: {
    path: string
    operation: 'create' | 'edit' | 'delete' | 'read'
  }
}

export interface MissionLatestMessage {
  role: 'user' | 'agent' | 'assistant'
  text: string
  at: number
}

export interface MissionActivityPayload {
  chatId: string
  phase: string
  currentTool?: string
  toolCount: number
  toolCompleted: number
  cost?: number
  logLine?: string
  exitReason?: 'user_stop' | 'timeout' | 'model_switch'
  agentActivities?: AgentActivitySnapshot[]
  latestMessage?: MissionLatestMessage
}

export type MissionPermissionRequestPayload = ExpertPermissionRequestPayload

export interface MissionPermissionResolvedPayload {
  chatId: string
  requestId: string
}

export interface MissionUserInputPayload {
  chatId: string
  text: string
}

// ── Deprecated Chat* aliases (PR-D compat window; removed in PR-F) ────────────
/** @deprecated use {@link MissionStatusChangedPayload} */
export type ChatStatusChangedPayload = MissionStatusChangedPayload
/** @deprecated use {@link MissionLatestMessage} */
export type ChatLatestMessage = MissionLatestMessage
/** @deprecated use {@link MissionActivityPayload} */
export type ChatActivityPayload = MissionActivityPayload
/** @deprecated use {@link MissionPermissionRequestPayload} */
export type ChatPermissionRequestPayload = MissionPermissionRequestPayload
/** @deprecated use {@link MissionPermissionResolvedPayload} */
export type ChatPermissionResolvedPayload = MissionPermissionResolvedPayload
/** @deprecated use {@link MissionUserInputPayload} */
export type ExpertUserInputPayload = MissionUserInputPayload
