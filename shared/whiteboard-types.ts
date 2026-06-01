/**
 * WhiteboardChat  —
 *
 *  Agent  chat  Agent
 *  ContextBriefing  Agent
 *  Agent
 *
 *  - JSONL  mailbox / SessionFileWatcher
 *  -  entry  summary  ≤120
 *  -  SQLite DB  +  goal
 */

export type WhiteboardEntryType =
  | 'goal'
  | 'decision'
  | 'artifact'
  | 'progress'
  | 'open_question'
  | 'constraint'
  | 'handoff'

export type WhiteboardEntryStatus = 'active' | 'archived' | 'superseded'

export interface WhiteboardEntryRefs {
  files?: string[]
  entries?: string[]
  mailbox?: string
  artifacts?: string[]
}

export interface WhiteboardEntry {
  id: string
  chatId: string
  /**
   * chat  1  WhiteboardManager
   *  entries.jsonl cursor  diff
   */
  seq: number
  type: WhiteboardEntryType
  by: string
  summary: string
  refs?: WhiteboardEntryRefs
  tags?: string[]
  status: WhiteboardEntryStatus
  supersededBy?: string
  timestamp: string

  payload?: Record<string, unknown>
  taskId?: string
  resolves?: string
}

/** id / chatId / seq / timestamp / status  Manager  */
export type WhiteboardEntryInput = Omit<WhiteboardEntry, 'id' | 'chatId' | 'seq' | 'timestamp' | 'status' | 'supersededBy'> & {
  status?: WhiteboardEntryStatus
}

export interface WhiteboardQueryOptions {
  sinceTs?: string
  types?: WhiteboardEntryType[]
  byAgent?: string
  tags?: string[]
  status?: WhiteboardEntryStatus
  limit?: number
  taskId?: string
}

/** Snapshot UI  ContextBriefing  */
export interface WhiteboardSnapshot {
  chatId: string
  goal: WhiteboardEntry | null
  active: WhiteboardEntry[]
  archivedCount: number
  updatedAt: string
  taskEntries?: Record<string, WhiteboardEntry[]>
}

export const WHITEBOARD_SUMMARY_MAX = 120

export const WHITEBOARD_PAYLOAD_MAX_BYTES = 4096
export const WHITEBOARD_TASK_ID_MAX_LENGTH = 64

export const WHITEBOARD_ERROR = {
  SUMMARY_TOO_LONG: 'whiteboard.summary_too_long',
  SUMMARY_EMPTY: 'whiteboard.summary_empty',
  MISSING_BY: 'whiteboard.missing_by',
  GOAL_ALREADY_EXISTS: 'whiteboard.goal_already_exists',
  ENTRY_NOT_FOUND: 'whiteboard.entry_not_found',
  PAYLOAD_TOO_LARGE: 'whiteboard.payload_too_large',
  PAYLOAD_INVALID: 'whiteboard.payload_invalid',
  TASK_ID_TOO_LONG: 'whiteboard.task_id_too_long',
  RESOLVES_INVALID: 'whiteboard.resolves_invalid',
} as const

export type WhiteboardErrorCode = typeof WHITEBOARD_ERROR[keyof typeof WHITEBOARD_ERROR]

export interface WorkflowTaskNode {
  taskId: string
  agentId: string
  status: string
  description: string
  dependsOn: string[]
  entryCount: number
  entrySummary: Record<string, number>
}

export interface WhiteboardSnapshotWithWorkflow extends WhiteboardSnapshot {
  workflow?: {
    workflowId: string
    status: string
    tasks: WorkflowTaskNode[]
  }
}

export const normalizeAgentId = (by: string): string =>
  by.endsWith(':auto') ? by.slice(0, -':auto'.length) : by
