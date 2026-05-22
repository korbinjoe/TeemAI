/**
 * SessionFileWatcher - Claude  JSONL
 *
 *  JSONL  →  →  → emit
 *  emit 'message:full' emit 'message:delta'
 *
 * - ParserState
 * - 300ms debounce
 * -  ID+React  DOM
 */

import { EventEmitter } from 'events'
import { watch, existsSync, createReadStream, statSync } from 'fs'
import { createInterface } from 'readline'
import type { FSWatcher } from 'fs'
import type { ParserState, ParsedMessage } from './ConversationParser'
import { type OutputParser, claudeOutputParser } from './OutputParser'
import { createLogger } from '../lib/logger'

const log = createLogger('SessionFileWatcher')

export class SessionFileWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null
  private filePath: string
  private parser: OutputParser
  private byteOffset = 0
  private lineCount = 0
  private reading = false
  private pendingRead = false
  private allLines: string[] = []
  private parserState: ParserState
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private debounceMs = 300
  private lastChangeAt = 0
  private quietTicks = 0
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private lastFileSize = 0
  private fileFound = false
  private readonly maxDeferredWaitMs = 120_000
  private deferredStartAt = 0

  constructor(filePath: string, parser?: OutputParser) {
    super()
    this.filePath = filePath
    this.parser = parser || claudeOutputParser
    this.parserState = this.parser.createState()
  }

  async start(): Promise<void> {
    if (!existsSync(this.filePath)) {
      const maxWait = 30_000
      const interval = 200
      let waited = 0
      while (!existsSync(this.filePath) && waited < maxWait) {
        await new Promise((r) => setTimeout(r, interval))
        waited += interval
      }
      if (!existsSync(this.filePath)) {
        log.warn('File not created, starting deferred polling', { filePath: this.filePath, waitedMs: maxWait })
        this.startDeferredPolling()
        return
      }
      log.info('File appeared', { filePath: this.filePath, waitedMs: waited })
    }

    await this.activateWatching()
  }

  private async activateWatching(): Promise<void> {
    this.fileFound = true
    await this.initialRead()

    if (this.allLines.length > 0) {
      const { newMessages } = this.parser.parseNewLines(this.allLines, 0, this.parserState)
      this.parserState.messages.push(...newMessages)
      if (this.parserState.messages.length > 0) {
        this.emit('message:full', { messages: this.parserState.messages })
      }
    }

    this.lastFileSize = this.byteOffset

    this.watcher = watch(this.filePath, () => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer)
      const effectiveDelay = (Date.now() - this.lastChangeAt > 5000) ? 300 : this.debounceMs
      this.debounceTimer = setTimeout(() => {
        this.readNewLines()
        this.adaptDebounce()
      }, effectiveDelay)
    })

    this.watcher.on('error', (err) => {
      log.warn('Watch error', { error: err.message })
    })

    this.startPolling()

    log.info('Watching file', { filePath: this.filePath, baselineLines: this.lineCount, baselineBytes: this.byteOffset })
  }

  /**
   *  30s
   *  activateWatching
   */
  private startDeferredPolling(): void {
    if (this.pollTimer) return
    this.deferredStartAt = Date.now()
    this.pollTimer = setInterval(async () => {
      if (Date.now() - this.deferredStartAt > this.maxDeferredWaitMs) {
        log.warn('Deferred polling timeout, file never appeared', { filePath: this.filePath, waitedMs: this.maxDeferredWaitMs })
        if (this.pollTimer) {
          clearInterval(this.pollTimer)
          this.pollTimer = null
        }
        this.emit('file-timeout', { filePath: this.filePath })
        return
      }

      if (!existsSync(this.filePath)) return

      log.info('File finally appeared (deferred polling)', { filePath: this.filePath })
      this.fileFound = true
      if (this.pollTimer) {
        clearInterval(this.pollTimer)
        this.pollTimer = null
      }
      await this.activateWatching()
    }, 1000)
  }

  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
    log.info('Stopped watching', { filePath: this.filePath })
  }

  isFileFound(): boolean {
    return this.fileFound
  }

  getInspectState() {
    let fileSize = 0
    try {
      if (existsSync(this.filePath)) fileSize = statSync(this.filePath).size
    } catch { /* ignore */ }
    const state = !this.fileFound
      ? (this.pollTimer ? 'deferred-polling' : 'idle')
      : this.reading ? 'reading' : 'watching'
    return {
      filePath: this.filePath,
      fileExists: existsSync(this.filePath),
      fileSizeBytes: fileSize,
      byteOffset: this.byteOffset,
      lineCount: this.lineCount,
      messageCount: this.parserState.messages.length,
      state,
      lastChangeAt: this.lastChangeAt || null,
      debounceMs: this.debounceMs,
    }
  }

  getFullMessages(): ParsedMessage[] {
    return this.parserState.messages
  }

  replayFullState(): void {
    if (this.parserState.messages.length > 0) {
      this.emit('message:full', { messages: this.parserState.messages })
    }
  }

  /**
   *  byteOffset
   *  readline  statSync
   */
  private async initialRead(): Promise<void> {
    const readStartTime = Date.now()
    let snapshotSize = 0
    try {
      snapshotSize = statSync(this.filePath).size
    } catch {
      this.byteOffset = 0
      return
    }

    if (snapshotSize === 0) {
      this.byteOffset = 0
      return
    }

    return new Promise((resolve) => {
      const stream = createReadStream(this.filePath, {
        encoding: 'utf-8',
        start: 0,
        end: snapshotSize - 1,
      })
      const rl = createInterface({ input: stream, crlfDelay: Infinity })

      rl.on('line', (line) => {
        this.allLines.push(line)
      })

      rl.on('close', () => {
        this.lineCount = this.allLines.length
        const calculatedOffset = this.allLines.reduce(
          (sum, line) => sum + Buffer.byteLength(line, 'utf-8') + 1, // +1 for \n
          0,
        )
        this.byteOffset = Math.min(calculatedOffset, snapshotSize)
        const elapsed = Date.now() - readStartTime
        log.debug('initialRead complete', { lines: this.lineCount, offset: this.byteOffset, snapshotSize, elapsedMs: elapsed })
        resolve()
      })

      rl.on('error', () => {
        resolve()
      })
    })
  }

  private readNewLines(): void {
    if (this.reading) {
      this.pendingRead = true
      log.debug('readNewLines: already reading, queued pendingRead')
      return
    }
    this.reading = true

    const safetyTimer = setTimeout(() => {
      if (this.reading) {
        log.error('readNewLines: SAFETY TIMEOUT (10s) — force releasing reading lock')
        this.reading = false
        if (this.pendingRead) {
          this.pendingRead = false
          this.readNewLines()
        }
      }
    }, 10_000)

    let currentSize: number
    try {
      currentSize = statSync(this.filePath).size
    } catch {
      clearTimeout(safetyTimer)
      this.reading = false
      return
    }

    if (currentSize <= this.byteOffset) {
      clearTimeout(safetyTimer)
      this.reading = false
      if (this.pendingRead) {
        this.pendingRead = false
        this.readNewLines()
      }
      return
    }

    log.debug('readNewLines', { newBytes: currentSize - this.byteOffset, offset: this.byteOffset, fileSize: currentSize })

    let stream: ReturnType<typeof createReadStream>
    let rl: ReturnType<typeof createInterface>
    try {
      stream = createReadStream(this.filePath, {
        encoding: 'utf-8',
        start: this.byteOffset,
        end: currentSize - 1,
      })
      rl = createInterface({ input: stream, crlfDelay: Infinity })
    } catch (err) {
      log.error('readNewLines: stream creation failed', { error: err instanceof Error ? err.message : String(err) })
      clearTimeout(safetyTimer)
      this.reading = false
      if (this.pendingRead) {
        this.pendingRead = false
        this.readNewLines()
      }
      return
    }

    const newLines: string[] = []

    rl.on('line', (line) => {
      newLines.push(line)
    })

    rl.on('close', () => {
      clearTimeout(safetyTimer)

      if (newLines.length > 0) {
        let bytesRead = 0
        for (const line of newLines) {
          bytesRead += Buffer.byteLength(line, 'utf-8') + 1 // +1 for \n
        }

        const readRange = currentSize - this.byteOffset
        if (bytesRead > readRange) {
          bytesRead = readRange
        }

        this.byteOffset += bytesRead
        this.lastFileSize = this.byteOffset

        const prevLineCount = this.lineCount
        this.allLines.push(...newLines)
        this.lineCount = this.allLines.length

        const { newMessages, replacedStatsId } = this.parser.parseNewLines(this.allLines, prevLineCount, this.parserState)
        this.parserState.messages.push(...newMessages)

        if (newMessages.length > 0) {
          log.debug('delta', { newLines: newLines.length, newMsgs: newMessages.length, offset: this.byteOffset })
          this.emit('message:delta', { newMessages, replacedStatsId })
        } else {
          log.debug('readNewLines: lines parsed but 0 messages', { newLines: newLines.length, offset: this.byteOffset })
        }

        this.quietTicks = 0
        this.debounceMs = 300
      } else {
        log.debug('readNewLines: no complete lines in byte range')
      }

      this.reading = false
      if (this.pendingRead) {
        this.pendingRead = false
        this.readNewLines()
      }
    })

    rl.on('error', (err) => {
      clearTimeout(safetyTimer)
      log.error('readNewLines: readline error', { error: err instanceof Error ? err.message : String(err) })
      this.reading = false
      if (this.pendingRead) {
        this.pendingRead = false
        this.readNewLines()
      }
    })
  }

  private startPolling(): void {
    if (this.pollTimer) return
    this.pollTimer = setInterval(() => {
      try {
        const size = statSync(this.filePath).size
        if (size > this.lastFileSize) {
          this.lastFileSize = size
          this.readNewLines()
        }
      } catch { /* file may not exist yet */ }
    }, 1000)
  }

  /**
   *  debounce
   * - → 300ms
   * - →  2000ms I/O
   * -  →  300ms
   */
  private adaptDebounce(): void {
    const now = Date.now()
    const gap = now - this.lastChangeAt

    if (gap < 5000) {
      this.quietTicks = 0
      this.debounceMs = 300
    } else {
      this.quietTicks++
      if (this.quietTicks >= 6) this.debounceMs = 2000
      else if (this.quietTicks >= 3) this.debounceMs = 1000
      else if (this.quietTicks >= 1) this.debounceMs = 600
    }

    this.lastChangeAt = now
  }
}
