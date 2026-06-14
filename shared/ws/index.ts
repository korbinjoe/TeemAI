export * from './envelope'
export * from './agent'
export * from './permission'
export * from './chat'
export * from './notification'
export * from './semantic-log'
export * from './shell'
export * from './git'
export interface ImageAttachment {
  data: string
  mediaType: string
}

export interface WsSendMessages {
  // ── Canonical (PR-D): mission.* + agent:* ──────────────────────────────────
  'mission:set-context': { chatId: string | undefined }
  'mission:resume-agents': { chatId: string | undefined }
  'agent:direct-input': {
    chatId: string
    agentId: string
    message: string
    images?: ImageAttachment[]
    autoStart?: boolean
    cwd?: string
    cols?: number
    rows?: number
  }
  'agent:input': { chatId: string; agentId: string; data: string }
  'agent:stop': { chatId: string; agentId: string }
  'agent:resize': { chatId: string; agentId: string; cols: number; rows: number }
  'agent:cli-attach': { chatId: string; agentId: string; cols: number; rows: number }
  'agent:cli-detach': { chatId: string; agentId: string }
  'agent:list': { chatId: string | undefined }
  'agent:clear-completed': { chatId: string | undefined }
  'agent:permission-response': import('./permission').ExpertPermissionResponsePayload
  'agent:user-input': import('./chat').MissionUserInputPayload

  // ── Deprecated compat aliases (removed in PR-F) ────────────────────────────
  'chat:set-context': { chatId: string | undefined }
  'chat:resume-experts': { chatId: string | undefined }
  'expert:direct-input': {
    chatId: string
    agentId: string
    message: string
    images?: ImageAttachment[]
    autoStart?: boolean
    cwd?: string
    cols?: number
    rows?: number
  }
  'expert:input': { chatId: string; agentId: string; data: string }
  'expert:stop': { chatId: string; agentId: string }
  'expert:resize': { chatId: string; agentId: string; cols: number; rows: number }
  /** Web → Server: enter terminal view; server spawns a resume-PTY for this agent. */
  'expert:cli-attach': { chatId: string; agentId: string; cols: number; rows: number }
  /** Web → Server: leave terminal view; server kills the resume-PTY for this agent. */
  'expert:cli-detach': { chatId: string; agentId: string }
  'expert:list': { chatId: string | undefined }
  'expert:clear-completed': { chatId: string | undefined }
  'shell:create': { cwd: string; cols?: number; rows?: number; nonce?: string }
  'shell:input': { shellId: string; data: string }
  'shell:resize': { shellId: string; cols: number; rows: number }
  'shell:destroy': { shellId: string }
  'expert:permission-response': import('./permission').ExpertPermissionResponsePayload
  'expert:user-input': import('./chat').MissionUserInputPayload
  'git:subscribe': import('./git').GitSubscribePayload
  'git:unsubscribe': import('./git').GitUnsubscribePayload
}
