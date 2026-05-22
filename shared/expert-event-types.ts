export type ExpertEventType =
  | 'phase'
  | 'task:input_required'
  | 'task:completed'
  | 'task:failed'

export type ExpertEvent =
  | { type: 'phase'; agentId: string; phase: string; tool?: string }
  | { type: 'task:input_required'; from: string; taskId: string; summary: string }
  | { type: 'task:completed'; from: string; taskId: string; summary: string }
  | { type: 'task:failed'; from: string; taskId: string; error: string }

export const TERMINAL_PHASES = new Set([
  'completed',
  'waiting_input',
  'waiting_confirmation',
  'failed',
])
