/**
 * Agent  —
 *
 *  docs/agent-communication-protocol.md  Layer 2 Layer 3
 *  server/  web/
 */

// ── Message ID Generate ──

export const generateMessageId = (): string => {
  const ts = Date.now()
  const rand = Math.random().toString(36).slice(2, 6)
  return `${ts}-${rand}`
}

export const generateTaskId = (): string => {
  const ts = Date.now()
  const rand = Math.random().toString(36).slice(2, 6)
  return `task-${ts}-${rand}`
}

export const wrapTaskEnvelope = (agentId: string, task: string): TaskEnvelope => ({
  taskId: generateTaskId(),
  agentId,
  description: task,
  priority: 'p1',
})

export interface AgentMessageBase {
  id: string
  timestamp: string
  /**  IDinstanceId fullstack-engineer#2 */
  from: string
  to: string
  chatId: string
  taskId?: string
  replyTo?: string
  /**
   *  instanceId
   * ['lead', 'fullstack-engineer#1', 'code-reviewer']
   */
  dispatchChain?: string[]
  protocolVersion: '1.0'
}

/**
 * Discriminated union —  type  payload
 *  type
 */
export type AgentMessage =
  | AgentMessageBase & { type: 'task:assign'; payload: TaskEnvelope }
  | AgentMessageBase & { type: 'task:blocked'; payload: { taskId: string; reason: string } }
  | AgentMessageBase & { type: 'task:input_required'; payload: { taskId: string; question: string } }
  | AgentMessageBase & { type: 'task:completed'; payload: TaskResult }
  | AgentMessageBase & { type: 'task:failed'; payload: TaskResult }
  | AgentMessageBase & { type: 'handoff'; payload: HandoffPayload }
  | AgentMessageBase & { type: 'artifact'; payload: { path: string; description: string } }

export type AgentMessageType = AgentMessage['type']

// ── 3.1 TaskEnvelope ──

export interface TaskEnvelope {
  taskId: string
  parentTaskId?: string
  agentId: string
  instanceSuffix?: string
  description: string
  inputs?: TaskInputs
  expectedOutputs?: TaskExpectedOutputs
  priority?: 'p0' | 'p1' | 'p2'
  estimatedMinutes?: number
}

export interface TaskInputs {
  files?: string[]
  context?: string
  dependencies?: Array<{
    taskId: string
    artifactPath: string
  }>
}

export interface TaskExpectedOutputs {
  type: 'code' | 'document' | 'review' | 'design' | 'image'
  path?: string
  acceptanceCriteria?: string[]
}

// ── 3.2 TaskResult ──

export interface TaskResult {
  taskId: string
  parentTaskId?: string
  executor: string
  status: 'completed' | 'partial' | 'failed'
  summary: string
  artifacts: Array<{
    path: string
    type: 'created' | 'modified' | 'deleted'
    description: string
  }>
  modifiedFiles: Array<{
    path: string
    changeType: 'create' | 'edit' | 'delete'
    linesAdded: number
    linesRemoved: number
  }>
  impactAnalysis?: {
    affectedModules: string[]
    riskAreas: string[]
    testCoverage: string
  }
  delegatedResults?: Array<{
    taskId: string
    executor: string
    status: 'completed' | 'partial' | 'failed'
    summary: string
  }>
  followUp?: string[]
  failureReason?: string
}

// ── 3.4 HandoffPayload ──

export interface HandoffPayload {
  description: string
  artifacts: Array<{
    path: string
    description: string
  }>
  context: string
  caveats?: string[]
  sourceTaskId?: string
}

export const createAgentMessage = <T extends AgentMessage['type']>(
  type: T,
  fields: {
    from: string
    to: string
    chatId: string
    taskId?: string
    replyTo?: string
    dispatchChain?: string[]
    payload: Extract<AgentMessage, { type: T }>['payload']
  },
): Extract<AgentMessage, { type: T }> => {
  return {
    id: generateMessageId(),
    timestamp: new Date().toISOString(),
    protocolVersion: '1.0' as const,
    type,
    ...fields,
  } as unknown as Extract<AgentMessage, { type: T }>
}
