/**
 * cliPrompt — Execute lightweight LLM calls via local Claude CLI (`claude -p`)
 *
 * Reuses the user's existing CLI login session, no additional ANTHROPIC_API_KEY needed.
 */

import { execFile } from 'child_process'
import { createLogger } from './logger'
import { resolveCliCommandAsync, resolveInterpreter } from './resolveCliCommand'

const log = createLogger('cliPrompt')

export interface CliPromptOptions {
  prompt: string
  systemPrompt?: string
  model?: string
  maxTurns?: number
  timeoutMs?: number
}

export interface CliPromptResult {
  success: boolean
  text?: string
  error?: string
}

export const cliPrompt = async (options: CliPromptOptions): Promise<CliPromptResult> => {
  const { prompt, systemPrompt, model, maxTurns = 1, timeoutMs = 15_000 } = options

  const resolvedClaude = await resolveCliCommandAsync('claude')
  if (!resolvedClaude) {
    return { success: false, error: 'Claude CLI not found' }
  }

  const args = [
    '--print',
    '--output-format', 'text',
    '--max-turns', String(maxTurns),
    '--dangerously-skip-permissions',
  ]

  if (model) {
    args.push('--model', model)
  }

  if (systemPrompt) {
    args.push('--append-system-prompt', systemPrompt)
  }

  args.push('-p', prompt)

  const { command: spawnCmd, prependArgs } = resolveInterpreter(resolvedClaude)
  const fullArgs = [...prependArgs, ...args]

  return new Promise((resolve) => {
    execFile(spawnCmd, fullArgs, { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const errMsg = err.killed
          ? `CLI timeout (${timeoutMs}ms)`
          : stderr.trim() || err.message
        log.debug('cliPrompt failed', { error: errMsg })
        resolve({ success: false, error: errMsg })
        return
      }

      const text = stdout.trim()
      if (!text) {
        resolve({ success: false, error: 'CLI returned empty response' })
        return
      }

      resolve({ success: true, text })
    })
  })
}
