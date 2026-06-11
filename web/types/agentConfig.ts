export interface McpServerConfig {
  transport: 'stdio' | 'sse' | 'http'
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
}

export interface HookEntry {
  matcher?: string
  hooks: Array<{
    type: 'command'
    command: string
    timeout?: number
  }>
}

export interface HooksConfig {
  PreToolUse?: HookEntry[]
  PostToolUse?: HookEntry[]
  Notification?: HookEntry[]
  Stop?: HookEntry[]
}

export interface SkillDefinition {
  name: string
  description: string
  content: string
  allowedTools?: string
  enabled: boolean
  source: 'builtin' | 'custom'
  filePath?: string
}

export type AvatarVariant = 'marble' | 'beam' | 'pixel' | 'sunset' | 'ring' | 'bauhaus' | 'geometric' | 'abstract'

/**  — 'default'  boring-avatars */
export type AvatarStyleMode = 'default' | 'brush'

export interface AgentPersonality {
  nickname: string
  animal: string
  emoji: string
  tone: 'formal' | 'casual' | 'playful'
  verbosity: 'concise' | 'moderate' | 'detailed'
  persona: string
}

export interface AvatarStyle {
  variant: AvatarVariant
  colors?: string[]
}

export interface Agent {
  id: string
  name: string
  description: string
  icon: string
  avatarId?: string
  avatarStyle?: AvatarStyle
  systemPrompt: {
    mode: 'replace' | 'append'
    content: string
  }
  allowedTools?: string[]
  disallowedTools?: string[]
  model?: string
  maxTurns?: number
  skills?: string[]
  mcpServers?: Record<string, McpServerConfig>
  hooks?: HooksConfig
  subAgentNames?: string[]
  personality?: AgentPersonality
  provider?: 'claude' | 'codex' | 'qoder' | 'qodercli'
  tags: string[]
  source: 'builtin' | 'user'
  createdAt: string
  updatedAt: string
}

/** @deprecated  Agent  */
export interface AgentSummary {
  id: string
  name: string
  description: string
  icon: string
  subAgentNames?: string[]
  personality?: AgentPersonality
  provider?: 'claude' | 'codex' | 'qoder' | 'qodercli'
}
