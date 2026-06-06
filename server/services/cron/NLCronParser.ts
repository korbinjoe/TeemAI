/**
 * NLCronParser — Convert natural language to CronJob config via local Claude CLI
 */

import { CronExpressionParser } from 'cron-parser'
import type { CronTrigger } from '../../config/types'
import { cliPrompt } from '../../lib/cliPrompt'
import { createLogger } from '../../lib/logger'

const log = createLogger('NLCronParser')

export interface NLParsedCronJob {
  name: string
  description?: string
  trigger: CronTrigger
  prompt: string
  workspaceId?: string
  agentName?: string
  model?: string
  retryOnFailure: boolean
  maxRetries: number
  expiresAt?: string
}

export interface NLParseResult {
  success: boolean
  parsed?: NLParsedCronJob
  error?: string
}

export interface AvailableWorkspace {
  id: string
  name: string
}

export interface AvailableAgent {
  name: string
  description: string
}

const TIMEOUT_MS = 45_000

export class NLCronParser {
  async parse(
    userInput: string,
    workspaces: AvailableWorkspace[],
    agents: AvailableAgent[],
  ): Promise<NLParseResult> {
    const systemPrompt = this.buildSystemPrompt(workspaces, agents)

    const result = await cliPrompt({
      prompt: userInput,
      systemPrompt,
      timeoutMs: TIMEOUT_MS,
    })

    if (!result.success) {
      log.error('CLI call failed', { error: result.error })
      return { success: false, error: result.error }
    }

    return this.parseJsonResponse(result.text!)
  }

  private buildSystemPrompt(
    workspaces: AvailableWorkspace[],
    agents: AvailableAgent[],
  ): string {
    const wsListStr = workspaces.length > 0
      ? workspaces.map((ws) => `- "${ws.name}" (id: ${ws.id})`).join('\n')
      : '(no workspaces)'

    const agentListStr = agents.length > 0
      ? agents.map((a) => `- "${a.name}": ${a.description}`).join('\n')
      : '(no custom agents)'

    return `You are a cron job configuration assistant. The user will describe a scheduled task in natural language. You must output ONLY a JSON object (no markdown fences, no explanation) with the following schema:

{
  "name": "string - concise task title",
  "description": "string - optional task description",
  "trigger": {
    "kind": "cron" | "once" | "interval",
    "expression": "string - cron expression (when kind=cron)",
    "timezone": "string - default UTC",
    "at": "string - ISO 8601 timestamp (when kind=once)",
    "intervalMs": "number - milliseconds (when kind=interval)"
  },
  "prompt": "string - detailed, executable Agent instruction",
  "workspaceId": "string - matched workspace ID if applicable",
  "agentName": "string - matched Agent name if applicable",
  "expiration": {
    "type": "after_count | after_duration | at_time",
    "count": "number - how many times to run (when type=after_count)",
    "durationMinutes": "number - total minutes from now (when type=after_duration)",
    "at": "string - ISO 8601 absolute deadline (when type=at_time)"
  }
}

## Schedule Conversion
- "every day at 9am" → kind=cron, expression="0 9 * * *"
- "weekdays at 10am" → kind=cron, expression="0 10 * * 1-5"
- "every hour" → kind=interval, intervalMs=3600000
- "every 30 minutes" → kind=interval, intervalMs=1800000
- "every Monday at 9am" → kind=cron, expression="0 9 * * 1"
- "tomorrow at 3pm" → kind=once, at=ISO8601 timestamp
- Default when frequency not specified: kind=cron, expression="0 9 * * *" (daily at 9am)

Current time: ${new Date().toISOString()}

## Workspace Matching
${wsListStr}
- Auto-select when only one workspace exists
- Fuzzy match based on user description when multiple exist

## Available Agents
${agentListStr}
- Match the most suitable Agent based on description

## Expiration
- When the user specifies a limited number of runs: type=after_count, count=N
  - "only run 5 times" → { "type": "after_count", "count": 5 }
- When the user specifies a duration: type=after_duration, durationMinutes=N
  - "run for 2 hours" → { "type": "after_duration", "durationMinutes": 120 }
  - "run for 3 days" → { "type": "after_duration", "durationMinutes": 4320 }
- When the user specifies an absolute deadline: type=at_time, at=ISO8601
  - "until next Friday" → { "type": "at_time", "at": "2026-06-12T23:59:59Z" }
- If no expiration is mentioned, omit the expiration field entirely
- Do NOT calculate timestamps yourself — just output the structured hint

## Important
- Always output valid JSON even with incomplete information, use reasonable defaults
- The prompt field should be detailed and executable, suitable for sending directly to an AI Agent
- Output ONLY the JSON object, nothing else`
  }

  private computeExpiresAt(
    expiration: Record<string, unknown> | undefined,
    trigger: CronTrigger,
  ): string | undefined {
    if (!expiration || !expiration.type) return undefined

    const now = Date.now()

    switch (expiration.type) {
      case 'after_count': {
        const count = Number(expiration.count) || 1
        let intervalMs: number
        if (trigger.kind === 'interval') {
          intervalMs = trigger.intervalMs
        } else if (trigger.kind === 'cron') {
          try {
            const parsed = CronExpressionParser.parse(trigger.expression, { tz: trigger.timezone, currentDate: new Date() })
            const first = parsed.next().toDate().getTime()
            const second = parsed.next().toDate().getTime()
            intervalMs = second - first
          } catch {
            intervalMs = 60_000
          }
        } else {
          return undefined
        }
        return new Date(now + count * intervalMs).toISOString()
      }
      case 'after_duration': {
        const minutes = Number(expiration.durationMinutes) || 60
        return new Date(now + minutes * 60_000).toISOString()
      }
      case 'at_time': {
        const at = expiration.at as string
        if (at && !isNaN(new Date(at).getTime())) return new Date(at).toISOString()
        return undefined
      }
      default:
        return undefined
    }
  }

  private parseJsonResponse(text: string): NLParseResult {
    const jsonStr = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()

    let input: Record<string, unknown>
    try {
      input = JSON.parse(jsonStr)
    } catch {
      log.error('Failed to parse JSON from CLI response', { preview: text.slice(0, 200) })
      return { success: false, error: 'LLM did not return valid JSON' }
    }

    let trigger: CronTrigger
    const triggerInput = input.trigger as Record<string, unknown> | undefined

    if (!triggerInput || !triggerInput.kind) {
      return { success: false, error: 'Missing trigger in response' }
    }

    try {
      switch (triggerInput.kind) {
        case 'cron':
          trigger = {
            kind: 'cron',
            expression: (triggerInput.expression as string) || '0 9 * * *',
            timezone: (triggerInput.timezone as string) || 'UTC',
          }
          CronExpressionParser.parse(trigger.expression, {
            tz: trigger.timezone,
          })
          break
        case 'once':
          trigger = { kind: 'once', at: triggerInput.at as string }
          break
        case 'interval':
          trigger = { kind: 'interval', intervalMs: triggerInput.intervalMs as number }
          break
        default:
          return { success: false, error: `Unknown trigger kind: ${triggerInput.kind}` }
      }
    } catch {
      trigger = { kind: 'cron', expression: '0 9 * * *', timezone: 'UTC' }
    }

    return {
      success: true,
      parsed: {
        name: (input.name as string) || 'Untitled Task',
        description: input.description as string | undefined,
        trigger,
        prompt: (input.prompt as string) || '',
        workspaceId: input.workspaceId as string | undefined,
        agentName: input.agentName as string | undefined,
        expiresAt: this.computeExpiresAt(input.expiration as Record<string, unknown> | undefined, trigger),
        retryOnFailure: true,
        maxRetries: 2,
      },
    }
  }
}
