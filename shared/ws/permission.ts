export interface PermissionToolCall {
  toolCallId: string
  title: string
  rawInput?: unknown
}

export interface PermissionOption {
  optionId: string
  name: string
  kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always'
}

export interface ExpertPermissionRequestPayload {
  agentId: string
  chatId: string
  sessionId: string
  requestId: string
  toolCall: PermissionToolCall
  options: PermissionOption[]
}

export interface ExpertPermissionResponsePayload {
  agentId: string
  chatId: string
  sessionId: string
  requestId: string
  outcome:
    | { outcome: 'selected'; optionId: string }
    | { outcome: 'cancelled' }
}
