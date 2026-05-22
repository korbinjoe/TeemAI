/**
 * statusVerbs — Agent
 *
 *   /
 * Edit/Read thinking/responding
 */

import { useEffect, useState } from 'react'
import type { AgentPhase } from '@/types/chat'

const VERBS_BY_PHASE: Record<AgentPhase, string[]> = {
  initializing: ['Warming up', 'Getting ready', 'Assembling', 'Coming online'],
  thinking: ['Brainstorming', 'Deliberating', 'Pondering', 'Mulling over', 'Deep in thought', 'Planning', 'Brewing', 'Meditating'],
  tool_running: ['Working', 'Tinkering', 'Hacking', 'Hands on', 'Building', 'Busy'],
  responding: ['Composing', 'Wording', 'Writing', 'Polishing', 'Drafting', 'Replying'],
  waiting_input: ['On standby'],
  waiting_confirmation: ['Awaiting confirmation'],
  completed: ['Completed'],
  error: ['Error occurred'],
}

const pickVerb = (phase: AgentPhase, tick: number): string => {
  const pool = VERBS_BY_PHASE[phase] ?? VERBS_BY_PHASE.thinking
  if (pool.length === 0) return ''
  return pool[tick % pool.length]
}

/**
 * useRotatingVerb —  intervalMs
 *
 * @param phase  Agent phase
 * @param intervalMs  3000ms Claude Code
 */
export const useRotatingVerb = (phase: AgentPhase, intervalMs = 3000): string => {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (phase === 'completed' || phase === 'error' || phase === 'waiting_input') return
    const id = setInterval(() => setTick((t) => t + 1), intervalMs)
    return () => clearInterval(id)
  }, [phase, intervalMs])

  return pickVerb(phase, tick)
}

export { VERBS_BY_PHASE, pickVerb }
