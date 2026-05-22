/**
 * SenseiUpgradeService -  Claude Code CLI stream-json  Sensei
 *
 * spawn claude CLI →  stdout JSON → WS  →  markdown
 */

import { spawn, type ChildProcess } from 'child_process'
import { readFile } from 'fs/promises'
import { createInterface } from 'readline'
import { createLogger } from '../../lib/logger'
import { resolveCliCommandAsync, resolveInterpreter } from '../../lib/resolveCliCommand'

const log = createLogger('SenseiUpgrade')

interface UpgradeRequest {
  agentId: string
  markdown: string
  connectionId: string
}

interface StreamJsonLine {
  type: string
  subtype?: string
  message?: {
    content: Array<{ type: string; text?: string }>
  }
  index?: number
  delta?: {
    type: string
    text?: string
  }
  content_block?: {
    type: string
    text?: string
  }
  result?: string
  duration_ms?: number
  total_cost_usd?: number
  session_id?: string
  model?: string
  tools?: string[]
}

type EmitFn = (connectionId: string, event: string, data: unknown) => void

const TIMEOUT_MS = 120_000

export class SenseiUpgradeService {
  private activeProcesses = new Map<string, ChildProcess>()
  /** close  SIGTERMcode 143 */
  private cancelledProcesses = new WeakSet<ChildProcess>()
  private senseiPromptPaths: string[]

  /**
   * @param senseiPromptPath
   */
  constructor(
    senseiPromptPath: string | string[],
    private emitToConnection: EmitFn,
  ) {
    this.senseiPromptPaths = Array.isArray(senseiPromptPath) ? senseiPromptPath : [senseiPromptPath]
  }

  /**
   *  sensei
   * @returns { body, path }  frontmatter  +
   * @throws
   */
  private async loadSenseiPrompt(): Promise<{ body: string; path: string }> {
    const errors: string[] = []
    for (const p of this.senseiPromptPaths) {
      try {
        const raw = await readFile(p, 'utf-8')
        const body = raw.replace(/^---\n[\s\S]*?\n---\n/, '').trim()
        return { body, path: p }
      } catch (err) {
        errors.push(`  - ${p}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    throw new Error(
      `Failed to read sensei prompt. Tried:\n${errors.join('\n')}`,
    )
  }

  private emitProgress(
    connectionId: string,
    agentId: string,
    text: string,
    logType: 'stage' | 'content' | 'verbose' = 'content',
  ) {
    this.emitToConnection(connectionId, 'sensei:progress', {
      agentId,
      text,
      logType,
    })
  }

  async start(req: UpgradeRequest): Promise<void> {
    const { connectionId, agentId } = req
    const startTime = Date.now()

    log.info('start() called', { agentId, connectionId })
    log.debug('Input markdown length', { chars: req.markdown.length })

    this.cancel(connectionId)

    this.emitProgress(connectionId, agentId, 'Loading Sensei tips...', 'stage')

    let senseiBody: string
    try {
      const loaded = await this.loadSenseiPrompt()
      senseiBody = loaded.body
      log.debug('Sensei prompt loaded', { path: loaded.path, length: senseiBody.length })
      log.debug('Sensei prompt preview', { preview: senseiBody.slice(0, 200) })
      this.emitProgress(connectionId, agentId, `Sensei tips loaded (${senseiBody.length} chars, source: ${loaded.path})`, 'verbose')
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      log.error('Failed to read sensei prompt', { error: errMsg, candidates: this.senseiPromptPaths })
      this.emitToConnection(connectionId, 'sensei:error', { agentId, error: errMsg })
      return
    }

    const userMessage = [
      'Please perform a comprehensive review and optimization of the following digital worker markdown config file.',
      'Output the optimized complete markdown file content (including YAML frontmatter and body) directly. Do not output anything else.',
      'If the config is already good, output the original content unchanged.',
      '',
      '```markdown',
      req.markdown,
      '```',
    ].join('\n')

    const args = [
      '--print',
      '--verbose',
      '--output-format', 'stream-json',
      '--append-system-prompt', senseiBody,
      '--dangerously-skip-permissions',
      '--max-turns', '3',
      '-p', userMessage,
    ]

    const debugArgs = args.map((a, i) => {
      if (i > 0 && (args[i - 1] === '--append-system-prompt' || args[i - 1] === '-p')) {
        return `<${a.length} chars>`
      }
      return a
    })
    log.debug('CLI command', { args: debugArgs.join(' ') })

    this.emitProgress(connectionId, agentId, 'Starting Claude CLI...', 'stage')
    this.emitProgress(connectionId, agentId, `CLI Parameters: --print --verbose --output-format stream-json --max-turns 3`, 'verbose')
    this.emitProgress(connectionId, agentId, `System tips: ${senseiBody.length} chars | User input: ${req.markdown.length} chars`, 'verbose')

    const resolvedClaude = await resolveCliCommandAsync('claude')
    if (!resolvedClaude) {
      const errMsg = 'Command not found: claude. Please install Claude Code CLI first.'
      log.error('Claude CLI not found')
      this.emitToConnection(connectionId, 'sensei:error', { agentId, error: errMsg })
      return
    }

    const { command: spawnCmd, prependArgs } = resolveInterpreter(resolvedClaude)
    const child = spawn(spawnCmd, [...prependArgs, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    this.activeProcesses.set(connectionId, child)

    log.info('Process spawned', { pid: child.pid })
    this.emitProgress(connectionId, agentId, `Process started (PID: ${child.pid}), waiting for response...`, 'stage')

    const timer = setTimeout(() => {
      if (this.activeProcesses.has(connectionId)) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
        log.warn('Timeout, killing process', { elapsed, pid: child.pid })
        this.emitProgress(connectionId, agentId, `Analysis timeout (${elapsed}s)，terminating...`, 'stage')
        child.kill('SIGTERM')
      }
    }, TIMEOUT_MS)

    const rl = createInterface({ input: child.stdout! })
    let resultMarkdown = ''
    let hasReceivedContent = false
    let lineCount = 0

    rl.on('line', (line) => {
      lineCount++
      try {
        const parsed: StreamJsonLine = JSON.parse(line)
        const lineType = parsed.type + (parsed.subtype ? `:${parsed.subtype}` : '')

        log.debug('stdout line', { lineCount, type: lineType, length: line.length })

        // system InitializeEvent
        if (parsed.type === 'system') {
          const info = parsed.subtype === 'init'
            ? `SessionInitialized${parsed.session_id ? ` (session: ${parsed.session_id.slice(0, 8)}...)` : ''}${parsed.model ? ` | Model: ${parsed.model}` : ''}`
            : `System event: ${parsed.subtype ?? 'unknown'}`
          log.debug('System event', { subtype: parsed.subtype, session_id: parsed.session_id, model: parsed.model })
          this.emitProgress(connectionId, agentId, info, 'stage')
        }

        if (parsed.type === 'assistant' && parsed.message?.content) {
          const contentTypes = parsed.message.content.map((c) => c.type).join(', ')
          log.debug('Assistant message', { contentTypes, blocks: parsed.message.content.length })

          if (!hasReceivedContent) {
            this.emitProgress(connectionId, agentId, 'Sensei starting output...', 'stage')
          }
          const text = parsed.message.content
            .filter((c) => c.type === 'text' && c.text)
            .map((c) => c.text)
            .join('')
          if (text) {
            hasReceivedContent = true
            log.debug('Assistant text', { length: text.length })
            this.emitProgress(connectionId, agentId, text, 'content')
          }
        }

        if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta' && parsed.delta.text) {
          if (!hasReceivedContent) {
            hasReceivedContent = true
            this.emitProgress(connectionId, agentId, 'Sensei starting output...', 'stage')
          }
          this.emitProgress(connectionId, agentId, parsed.delta.text, 'content')
        }

        // content_block_start
        if (parsed.type === 'content_block_start') {
          const blockType = parsed.content_block?.type ?? 'unknown'
          log.debug('Content block start', { blockType })
          if (blockType === 'text' && !hasReceivedContent) {
            hasReceivedContent = true
            this.emitProgress(connectionId, agentId, 'Sensei starting output...', 'stage')
          }
        }

        // message_start / message_delta / message_stop
        if (parsed.type === 'message_start') {
          log.debug('Message start')
          this.emitProgress(connectionId, agentId, 'Received model response...', 'verbose')
        }
        if (parsed.type === 'message_stop') {
          log.debug('Message stop')
        }

        if (parsed.type === 'result') {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
          resultMarkdown = parsed.result ? this.extractMarkdown(parsed.result) : ''
          log.info('Result received', { markdownLength: resultMarkdown.length, durationMs: parsed.duration_ms, costUsd: parsed.total_cost_usd })
          this.emitProgress(connectionId, agentId, `Analysis complete (took ${elapsed}s${parsed.total_cost_usd ? `, Cost $${parsed.total_cost_usd.toFixed(4)}` : ''})`, 'stage')
          if (parsed.duration_ms) {
            this.emitProgress(connectionId, agentId, `CLI reported duration: ${(parsed.duration_ms / 1000).toFixed(1)}s`, 'verbose')
          }
        }
      } catch {
        log.debug('stdout non-JSON line', { lineCount, preview: line.slice(0, 100) })
      }
    })

    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderr += text
      const lines = text.split('\n').filter((l) => l.trim())
      for (const line of lines) {
        log.debug('stderr', { line })
        this.emitProgress(connectionId, agentId, line.trim(), 'verbose')
      }
    })

    child.on('close', (code, signal) => {
      clearTimeout(timer)
      this.activeProcesses.delete(connectionId)
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

      if (this.cancelledProcesses.has(child)) {
        log.info('Process closed after user cancel — skip error emit', {
          code, signal, elapsed, pid: child.pid,
        })
        this.cancelledProcesses.delete(child)
        return
      }

      log.info('Process closed', { code, signal, elapsed, stdoutLines: lineCount, stderrLength: stderr.length })

      if (code === 0 && resultMarkdown) {
        log.info('Success — optimized markdown', { chars: resultMarkdown.length })
        this.emitToConnection(connectionId, 'sensei:complete', {
          agentId,
          original: req.markdown,
          optimized: resultMarkdown,
        })
      } else {
        const errMsg = stderr.trim() || `Process exited with code ${code}${signal ? ` (signal ${signal})` : ''}`
        log.error('Failed', { error: errMsg, code, signal })
        this.emitToConnection(connectionId, 'sensei:error', {
          agentId,
          error: errMsg,
        })
      }
    })

    child.on('error', (err) => {
      clearTimeout(timer)
      this.activeProcesses.delete(connectionId)
      if (this.cancelledProcesses.has(child)) {
        this.cancelledProcesses.delete(child)
        log.info('Process error after user cancel — skip error emit', { error: err.message })
        return
      }
      log.error('Process error', { error: err.message })
      this.emitToConnection(connectionId, 'sensei:error', {
        agentId,
        error: err.message,
      })
    })
  }

  async generate(req: { agentId: string; description: string; connectionId: string }): Promise<void> {
    const { connectionId, agentId } = req
    const startTime = Date.now()

    log.info('generate() called', { agentId, connectionId })

    this.cancel(connectionId)

    this.emitProgress(connectionId, agentId, 'Loading Sensei tips...', 'stage')

    let senseiBody = ''
    try {
      const loaded = await this.loadSenseiPrompt()
      senseiBody = loaded.body
      this.emitProgress(connectionId, agentId, `Sensei tips loaded (${senseiBody.length} chars)`, 'verbose')
    } catch {
      this.emitProgress(connectionId, agentId, 'Sensei tips not found, using built-in mode', 'verbose')
    }

    const userMessage = [
      'Based on the following description, generate a high-quality AGENTS.md system prompt file for the digital worker.',
      '',
      'Requirements:',
      '1. Output the complete AGENTS.md Markdown content directly (no YAML frontmatter needed)',
      '2. Include key sections: role definition, core capabilities, workflow, output standards',
      '3. Professional language, clear instructions, well-structured, logically complete',
      '4. Write in English',
      '',
      'Digital worker description:',
      req.description,
    ].join('\n')

    const resolvedClaude = await resolveCliCommandAsync('claude')
    if (!resolvedClaude) {
      const errMsg = 'Command not found: claude. Please install Claude Code CLI first.'
      this.emitToConnection(connectionId, 'sensei:error', { agentId, error: errMsg })
      return
    }

    const args = [
      '--print',
      '--verbose',
      '--output-format', 'stream-json',
      ...(senseiBody ? ['--append-system-prompt', senseiBody] : []),
      '--dangerously-skip-permissions',
      '--max-turns', '1',
      '-p', userMessage,
    ]

    this.emitProgress(connectionId, agentId, 'Starting Claude CLI...', 'stage')

    const { command: spawnCmdGen, prependArgs: prependArgsGen } = resolveInterpreter(resolvedClaude)
    const child = spawn(spawnCmdGen, [...prependArgsGen, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    this.activeProcesses.set(connectionId, child)
    this.emitProgress(connectionId, agentId, `Process started (PID: ${child.pid}), waiting for response...`, 'stage')

    const timer = setTimeout(() => {
      if (this.activeProcesses.has(connectionId)) {
        child.kill('SIGTERM')
      }
    }, TIMEOUT_MS)

    const rl = createInterface({ input: child.stdout! })
    let resultContent = ''
    let hasReceivedContent = false

    rl.on('line', (line) => {
      try {
        const parsed: StreamJsonLine = JSON.parse(line)

        if (parsed.type === 'system' && parsed.subtype === 'init') {
          this.emitProgress(connectionId, agentId, `SessionInitialized${parsed.model ? ` | Model: ${parsed.model}` : ''}`, 'stage')
        }

        if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta' && parsed.delta.text) {
          if (!hasReceivedContent) {
            hasReceivedContent = true
            this.emitProgress(connectionId, agentId, 'Starting content generation...', 'stage')
          }
          this.emitProgress(connectionId, agentId, parsed.delta.text, 'content')
        }

        if (parsed.type === 'assistant' && parsed.message?.content) {
          const text = parsed.message.content.filter((c) => c.type === 'text' && c.text).map((c) => c.text).join('')
          if (text) {
            if (!hasReceivedContent) {
              hasReceivedContent = true
              this.emitProgress(connectionId, agentId, 'Starting content generation...', 'stage')
            }
            this.emitProgress(connectionId, agentId, text, 'content')
          }
        }

        if (parsed.type === 'result') {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
          resultContent = parsed.result ? this.extractContent(parsed.result) : ''
          this.emitProgress(connectionId, agentId, `Generation complete (took ${elapsed}s${parsed.total_cost_usd ? `, Cost $${parsed.total_cost_usd.toFixed(4)}` : ''})`, 'stage')
        }
      } catch { /* skip non-JSON */ }
    })

    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    child.on('close', (code, signal) => {
      clearTimeout(timer)
      this.activeProcesses.delete(connectionId)

      if (this.cancelledProcesses.has(child)) {
        log.info('generate() process closed after cancel — skip error emit', {
          code, signal, pid: child.pid,
        })
        this.cancelledProcesses.delete(child)
        return
      }

      if (code === 0 && resultContent) {
        this.emitToConnection(connectionId, 'sensei:complete', {
          agentId,
          original: '',
          optimized: resultContent,
        })
      } else {
        this.emitToConnection(connectionId, 'sensei:error', {
          agentId,
          error: stderr.trim() || `Process exited with code ${code}${signal ? ` (signal ${signal})` : ''}`,
        })
      }
    })

    child.on('error', (err) => {
      clearTimeout(timer)
      this.activeProcesses.delete(connectionId)
      if (this.cancelledProcesses.has(child)) {
        this.cancelledProcesses.delete(child)
        return
      }
      this.emitToConnection(connectionId, 'sensei:error', { agentId, error: err.message })
    })
  }

  /**
   * 1.  child  cancelledProcesses close/error handler
   * 2.  activeProcesses  start()  cancel
   * 3.  SIGTERM
   * WebSocket
   */
  cancel(connectionId: string): void {
    const child = this.activeProcesses.get(connectionId)
    if (!child) return
    log.info('cancel() — killing process', { pid: child.pid })
    this.cancelledProcesses.add(child)
    this.activeProcesses.delete(connectionId)
    try {
      child.kill('SIGTERM')
    } catch (err) {
      log.warn('cancel() — kill failed', { error: err instanceof Error ? err.message : String(err) })
    }
  }

  private extractContent(text: string): string {
    const match = text.match(/```(?:markdown|md)?\n([\s\S]*?)```/)
    if (match) return match[1].trim()
    return text.trim()
  }

  private extractMarkdown(text: string): string {
    const match = text.match(/```(?:markdown|md)?\n([\s\S]*?)```/)
    if (match) return match[1].trim()
    const fmMatch = text.match(/(---\n[\s\S]*?\n---\n[\s\S]*)/)
    if (fmMatch) return fmMatch[1].trim()
    return text.trim()
  }
}
