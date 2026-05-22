/**
 * LogSemanticizer -
 *
 *  ActivityDeriver  ActivityState
 *  SessionRegistry  activity  WS
 */

import type { ActivityState } from './ActivityDeriver'
import type { AgentPersonality } from '../config/types'

export interface SemanticLogEntry {
  id: string
  timestamp: number
  agentId: string
  agentName: string
  personality?: AgentPersonality
  type: 'status' | 'milestone' | 'question' | 'completion' | 'error'
  message: string
  rawEvent?: string
}

export class LogSemanticizer {
  /**
   *  ActivityState
   *  null
   */
  transform(
    agentId: string,
    agentName: string,
    personality: AgentPersonality | undefined,
    prev: ActivityState | null,
    curr: ActivityState,
  ): SemanticLogEntry | null {
    if (prev && prev.phase === curr.phase && curr.phase !== 'tool_running') return null
    if (prev && prev.phase === 'tool_running' && curr.phase === 'tool_running' && prev.logLine === curr.logLine) return null

    const nick = personality?.nickname || agentName

    switch (curr.phase) {
      case 'thinking':
        return this.entry(agentId, agentName, personality, 'status',
          `${nick} thinking...`,
          'phase: thinking')

      case 'tool_running':
        return this.entry(agentId, agentName, personality, 'status',
          this.describeToolUse(nick, curr),
          `tool: ${curr.currentTool || 'unknown'}${curr.logLine ? ` (${curr.logLine})` : ''}`)

      case 'responding':
        return this.entry(agentId, agentName, personality, 'status',
          `${nick} composing response...`,
          'phase: responding')

      case 'waiting_input':
        return this.entry(agentId, agentName, personality, 'milestone',
          `${nick} waiting for instructions`,
          'phase: waiting_input')

      case 'waiting_confirmation':
        return this.entry(agentId, agentName, personality, 'question',
          `${nick} has a question for you`,
          'phase: waiting_confirmation')

      case 'completed':
        return this.entry(agentId, agentName, personality, 'completion',
          this.describeCompletion(nick, curr),
          `phase: completed, tools: ${curr.toolCompleted}`)

      case 'error':
        return this.entry(agentId, agentName, personality, 'error',
          `${nick} encountered an issue`,
          'phase: error')

      default:
        return null
    }
  }

  private describeToolUse(nick: string, state: ActivityState): string {
    if (state.fileOp) {
      const basename = state.fileOp.path.split('/').pop() || state.fileOp.path
      const ops: Record<string, string> = {
        read: 'Reading', edit: 'editing', create: 'Writing', delete: 'deleting',
      }
      return `${nick} ${ops[state.fileOp.operation] || 'handling'} ${basename}`
    }
    if (state.logLine) return `${nick} ${state.logLine}`
    return `${nick} working...`
  }

  private describeCompletion(nick: string, state: ActivityState): string {
    const parts = [`${nick} completed the task`]
    if (state.toolCompleted > 0) {
      parts.push(`(${state.toolCompleted} tool calls)`)
    }
    return parts.join(' ')
  }

  private entry(
    agentId: string,
    agentName: string,
    personality: AgentPersonality | undefined,
    type: SemanticLogEntry['type'],
    message: string,
    rawEvent?: string,
  ): SemanticLogEntry {
    return {
      id: `sl-${agentId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      agentId,
      agentName,
      personality,
      type,
      message,
      rawEvent,
    }
  }
}
