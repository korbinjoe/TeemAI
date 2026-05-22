/**
 * Frontend Logger —
 *
 * - debug/info:  console
 * - warn/error: console  +  POST /api/log
 * - 500ms
 * -  sendBeacon
 */

interface LogEntry {
  level: 'warn' | 'error'
  module: string
  message: string
  meta?: Record<string, unknown>
  timestamp: string
}

const buffer: LogEntry[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
const FLUSH_INTERVAL = 500
const MAX_BUFFER = 20

const flush = () => {
  if (buffer.length === 0) return
  const logs = buffer.splice(0, buffer.length)
  flushTimer = null

  try {
    const body = JSON.stringify({ logs })
    fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }).catch(() => {})
  } catch {
  }
}

const enqueue = (entry: LogEntry) => {
  buffer.push(entry)
  if (buffer.length >= MAX_BUFFER) {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
    flush()
    return
  }
  if (!flushTimer) {
    flushTimer = setTimeout(flush, FLUSH_INTERVAL)
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (buffer.length > 0) {
      const body = JSON.stringify({ logs: buffer.splice(0, buffer.length) })
      navigator.sendBeacon('/api/log', new Blob([body], { type: 'application/json' }))
    }
  })
}

export const createFrontendLogger = (module: string) => ({
  debug: (...args: unknown[]) => {
    console.debug(`[${module}]`, ...args)
  },

  info: (...args: unknown[]) => {
    console.info(`[${module}]`, ...args)
  },

  warn: (message: string, meta?: Record<string, unknown>) => {
    console.warn(`[${module}]`, message, meta)
    enqueue({ level: 'warn', module, message, meta, timestamp: new Date().toISOString() })
  },

  error: (message: string, meta?: Record<string, unknown>) => {
    console.error(`[${module}]`, message, meta)
    enqueue({ level: 'error', module, message, meta, timestamp: new Date().toISOString() })
  },
})
