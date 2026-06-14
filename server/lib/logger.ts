/**
 * Logger —  winston
 *
 *   import { createLogger } from '../lib/logger'
 *   const log = createLogger('StreamJson')
 *   log.info('Agent spawned', { sessionId })
 *   log.error('spawn failed', { error: err.message })
 *
 *   - Console
 *   - ~/.teemai/logs/server-YYYY-MM-DD.log
 *   - ~/.teemai/logs/error-YYYY-MM-DD.log error
 *
 *   - LOG_LEVEL debug/info/warn/error info
 */

import { createLogger as winstonCreateLogger, format, transports, Logger } from 'winston'
import { join } from 'path'
import { mkdirSync, readdirSync, statSync, unlinkSync } from 'fs'
import { TEEMAI_HOME } from '../config/paths'

const LOG_DIR = join(TEEMAI_HOME, 'logs')
const MAX_AGE_DAYS = 14
const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB

try {
  mkdirSync(LOG_DIR, { recursive: true })
} catch {
}

const cleanupOldLogs = () => {
  try {
    const cutoff = Date.now() - MAX_AGE_DAYS * 86400_000
    for (const file of readdirSync(LOG_DIR)) {
      if (!file.endsWith('.log')) continue
      const filePath = join(LOG_DIR, file)
      try {
        const stat = statSync(filePath)
        if (stat.mtimeMs < cutoff) {
          unlinkSync(filePath)
        }
      } catch {
      }
    }
  } catch {
  }
}

setTimeout(cleanupOldLogs, 5000)

const getDateStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const logFormat = format.printf(({ timestamp, level, module, message, ...meta }) => {
  const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : ''
  return `[${timestamp}] [${level.toUpperCase()}] [${module}] ${message}${metaStr}`
})

const createFileTransport = (prefix: string, level?: string) =>
  new transports.File({
    filename: join(LOG_DIR, `${prefix}-${getDateStr()}.log`),
    level,
    maxsize: MAX_FILE_SIZE,
    format: format.combine(
      format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      logFormat,
    ),
  })

const cliMuteFilter = format((info) => (process.env.TEEMAI_CLI ? false : info))

const consoleTransport = new transports.Console({
  format: format.combine(
    cliMuteFilter(),
    format.timestamp({ format: 'HH:mm:ss.SSS' }),
    format.colorize({ level: true }),
    logFormat,
  ),
})
// Each module calls createLogger() and attaches to this shared transport.
consoleTransport.setMaxListeners(0)

// ── Logger Cache ──

const loggerCache = new Map<string, Logger>()

/**
 *  Logger
 *
 * @param module  'StreamJson''WebSocket''SessionRegistry'
 * @returns winston Logger
 *
 * @example
 * const log = createLogger('StreamJson')
 * log.info('Agent spawned', { sessionId, cmd })
 * log.warn('fs.watch fallback', { reason: 'macOS unreliable' })
 * log.error('spawn failed', { error: err.message })
 * log.debug('output chunk', { bytes: 1024 })
 */
export const createLogger = (module: string): Logger => {
  const cached = loggerCache.get(module)
  if (cached) return cached

  const logger = winstonCreateLogger({
    level: process.env.LOG_LEVEL || 'info',
    defaultMeta: { module },
    transports: [
      consoleTransport,
      createFileTransport('server'),
      createFileTransport('error', 'error'),
    ],
  })

  loggerCache.set(module, logger)
  return logger
}

export const getLogDir = () => LOG_DIR
