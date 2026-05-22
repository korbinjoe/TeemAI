export interface SemanticLogEntry {
  id: string
  timestamp: number
  agentId: string
  agentName: string
  personality?: {
    nickname: string
    emoji: string
    animal: string
    tone: string
    verbosity: string
    persona: string
  }
  type: 'status' | 'milestone' | 'question' | 'completion' | 'error'
  message: string
  rawEvent?: string
}

export interface SemanticLogPayload {
  chatId: string
  entry: SemanticLogEntry
}
