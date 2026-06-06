/**
 * cliPrompt — Lightweight one-shot LLM calls.
 *
 * Credential resolution:
 *   1. ~/.claude/settings.json "env" block (always the real gateway)
 *   2. process.env fallback
 *   When Electron sets ANTHROPIC_BASE_URL to a localhost proxy, the proxy may
 *   not be running. Reading ~/.claude/settings.json directly bypasses this.
 *
 * Auth priority:
 *   1. ANTHROPIC_API_KEY (x-api-key header)
 *   2. ANTHROPIC_AUTH_TOKEN (Bearer token, e.g. proxied gateways)
 *
 * Fallback: local `claude --print` CLI when neither auth source is available.
 */

import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { execFile } from 'child_process'
import { createLogger } from './logger'
import { resolveCliCommandAsync, resolveInterpreter } from './resolveCliCommand'

const log = createLogger('cliPrompt')

const FALLBACK_MODEL = 'claude-haiku-4-5-20251001'
const DEFAULT_MAX_TOKENS = 1024

let claudeSettingsCache: Record<string, string> | null = null

const readClaudeSettingsEnv = (): Record<string, string> => {
  if (claudeSettingsCache) return claudeSettingsCache
  try {
    const raw = readFileSync(join(homedir(), '.claude', 'settings.json'), 'utf-8')
    const parsed = JSON.parse(raw)
    const env = parsed?.env
    if (env && typeof env === 'object' && !Array.isArray(env)) {
      claudeSettingsCache = env as Record<string, string>
      return claudeSettingsCache
    }
  } catch { /* silent — config is optional */ }
  claudeSettingsCache = {}
  return claudeSettingsCache
}

const resolveEnv = (key: string): string | undefined => {
  const claudeEnv = readClaudeSettingsEnv()
  return claudeEnv[key] || process.env[key]
}

const resolveDefaultModel = (): string =>
  resolveEnv('TEEMAI_LIGHT_MODEL') || resolveEnv('ANTHROPIC_MODEL') || resolveEnv('ANTHROPIC_SMALL_FAST_MODEL') || FALLBACK_MODEL

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

let cachedClient: Anthropic | null = null

const getClient = (): Anthropic | null => {
  if (cachedClient) return cachedClient
  const apiKey = resolveEnv('ANTHROPIC_API_KEY')
  const authToken = resolveEnv('ANTHROPIC_AUTH_TOKEN')
  if (!apiKey && !authToken) return null
  cachedClient = new Anthropic({
    apiKey: apiKey || undefined,
    authToken: !apiKey && authToken ? authToken : undefined,
    baseURL: resolveEnv('ANTHROPIC_BASE_URL') || undefined,
    defaultHeaders: { 'User-Agent': 'teemai (claude-code-extension)' },
  })
  return cachedClient
}

export const cliPrompt = async (options: CliPromptOptions): Promise<CliPromptResult> => {
  const client = getClient()
  if (client) {
    const sdkResult = await promptViaSdk(client, options)
    if (sdkResult.success) return sdkResult
    log.debug('SDK call failed, falling back to CLI', { error: sdkResult.error })
  }
  return promptViaCli(options)
}

const promptViaSdk = async (
  client: Anthropic,
  options: CliPromptOptions,
): Promise<CliPromptResult> => {
  const { prompt, systemPrompt, model = resolveDefaultModel(), timeoutMs = 15_000 } = options

  try {
    const resp = await client.messages.create(
      {
        model,
        max_tokens: DEFAULT_MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
      },
      { timeout: timeoutMs },
    )

    const text = resp.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim()

    if (!text) {
      return { success: false, error: 'SDK returned empty response' }
    }
    return { success: true, text }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.debug('cliPrompt SDK call failed', { error: message })
    return { success: false, error: message }
  }
}

const promptViaCli = async (options: CliPromptOptions): Promise<CliPromptResult> => {
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
        log.debug('cliPrompt CLI call failed', { error: errMsg })
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
