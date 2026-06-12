import { readFileSync, writeFileSync, existsSync, statSync, readdirSync, mkdirSync } from 'fs'
import { join } from 'path'
import { TEEMAI_HOME } from '../../../shared/teemai-home'
import { createLogger } from '../../lib/logger'

const log = createLogger('EvolutionTrigger')

const CHECK_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000
const LAST_RUN_FILE = join(TEEMAI_HOME, '.evolution-last-run')
const AGENTS_DIR = join(TEEMAI_HOME, 'agents')

const CORRECTION_THRESHOLD = 3
const CORRECTION_WINDOW_DAYS = 7
const LOW_SAT_MIN_SESSIONS = 5
const LOW_SAT_WINDOW_DAYS = 14
const STALE_PROMPT_MIN_SESSIONS = 5
const STALE_PROMPT_AGE_DAYS = 30

export interface SatisfactionRecord {
  chatId: string
  date: string
  mss: number
  turns: number
  corrections: number
  escalations: number
  iterations: number
  acceptances: number
  commits: number
  rating: string
}

export interface TriggerResult {
  agentId: string
  type: 'repeated_corrections' | 'low_satisfaction' | 'stale_prompt'
  severity: 'high' | 'medium' | 'low'
  evidence: Record<string, unknown>
}

interface TriggerFile {
  generatedAt: string
  triggers: TriggerResult[]
}

const HEADER_RE = /^## (\S+) — (\d{4}-\d{2}-\d{2} \d{2}:\d{2})/
const DATA_RE = /^MSS:\s*([\d.-]+)\s*\|\s*Turns:\s*(\d+)\s*\|\s*Corrections:\s*(\d+)\s*\|\s*Escalations:\s*(\d+)\s*\|\s*Iterations:\s*(\d+)\s*\|\s*Acceptances:\s*(\d+)\s*\|\s*Commits:\s*(\d+)\s*\|\s*Rating:\s*(\S+)/

export const parseSatisfactionFile = (filePath: string): SatisfactionRecord[] => {
  if (!existsSync(filePath)) return []

  const content = readFileSync(filePath, 'utf-8')
  const lines = content.split('\n')
  const records: SatisfactionRecord[] = []

  let currentChatId = ''
  let currentDate = ''

  for (const line of lines) {
    const headerMatch = line.match(HEADER_RE)
    if (headerMatch) {
      currentChatId = headerMatch[1]
      currentDate = headerMatch[2]
      continue
    }

    const dataMatch = line.match(DATA_RE)
    if (dataMatch && currentChatId) {
      records.push({
        chatId: currentChatId,
        date: currentDate,
        mss: parseFloat(dataMatch[1]),
        turns: parseInt(dataMatch[2], 10),
        corrections: parseInt(dataMatch[3], 10),
        escalations: parseInt(dataMatch[4], 10),
        iterations: parseInt(dataMatch[5], 10),
        acceptances: parseInt(dataMatch[6], 10),
        commits: parseInt(dataMatch[7], 10),
        rating: dataMatch[8],
      })
      currentChatId = ''
    }
  }

  return records
}

const withinDays = (dateStr: string, days: number): boolean => {
  const d = new Date(dateStr.replace(' ', 'T') + ':00')
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  return d.getTime() >= cutoff
}

export const evaluateTriggers = (
  agentRecords: Array<{ agentId: string; records: SatisfactionRecord[]; soulMtime: Date | null }>,
): TriggerResult[] => {
  const triggers: TriggerResult[] = []

  for (const { agentId, records, soulMtime } of agentRecords) {
    const recentCorrections = records
      .filter(r => withinDays(r.date, CORRECTION_WINDOW_DAYS) && r.corrections > 0)

    if (recentCorrections.length >= CORRECTION_THRESHOLD) {
      triggers.push({
        agentId,
        type: 'repeated_corrections',
        severity: 'high',
        evidence: {
          sessionsWithCorrections: recentCorrections.length,
          periodDays: CORRECTION_WINDOW_DAYS,
          examples: recentCorrections.map(r => r.chatId),
        },
      })
    }

    const recentForSat = records.filter(r => withinDays(r.date, LOW_SAT_WINDOW_DAYS))
    if (recentForSat.length >= LOW_SAT_MIN_SESSIONS) {
      const avgMss = recentForSat.reduce((sum, r) => sum + r.mss, 0) / recentForSat.length
      if (avgMss < 0) {
        const worst = [...recentForSat].sort((a, b) => a.mss - b.mss).slice(0, 3)
        triggers.push({
          agentId,
          type: 'low_satisfaction',
          severity: 'high',
          evidence: {
            avgMss: Math.round(avgMss * 10) / 10,
            sessionCount: recentForSat.length,
            worstSessions: worst.map(r => ({ chatId: r.chatId, mss: r.mss })),
          },
        })
      }
    }

    const recentForStale = records.filter(r => withinDays(r.date, STALE_PROMPT_AGE_DAYS))
    if (recentForStale.length >= STALE_PROMPT_MIN_SESSIONS && soulMtime) {
      const staleThreshold = Date.now() - STALE_PROMPT_AGE_DAYS * 24 * 60 * 60 * 1000
      if (soulMtime.getTime() < staleThreshold) {
        triggers.push({
          agentId,
          type: 'stale_prompt',
          severity: 'medium',
          evidence: {
            lastModified: soulMtime.toISOString(),
            sessionsSince: recentForStale.length,
          },
        })
      }
    }
  }

  return triggers
}

const writeTriggerFile = (triggers: TriggerResult[]): void => {
  if (triggers.length === 0) return

  const senseiDir = join(AGENTS_DIR, 'sensei')
  mkdirSync(senseiDir, { recursive: true })

  const output: TriggerFile = {
    generatedAt: new Date().toISOString(),
    triggers,
  }

  const filePath = join(senseiDir, 'evolution-triggers.json')
  writeFileSync(filePath, JSON.stringify(output, null, 2), 'utf-8')
  log.info('Wrote evolution triggers', { count: triggers.length, path: filePath })
}

const getLastRunTime = (): number => {
  try {
    if (existsSync(LAST_RUN_FILE)) {
      const ts = readFileSync(LAST_RUN_FILE, 'utf-8').trim()
      return new Date(ts).getTime()
    }
  } catch {
    // ignore
  }
  return 0
}

const updateLastRunTime = (): void => {
  try {
    writeFileSync(LAST_RUN_FILE, new Date().toISOString(), 'utf-8')
  } catch (err) {
    log.warn('Failed to update last-run timestamp', { error: err instanceof Error ? err.message : String(err) })
  }
}

const getSoulMtime = (agentId: string): Date | null => {
  const soulPath = join(AGENTS_DIR, agentId, 'SOUL.md')
  try {
    if (existsSync(soulPath)) {
      return statSync(soulPath).mtime
    }
  } catch {
    // ignore
  }
  return null
}

export const checkAndRun = (): void => {
  const lastRun = getLastRunTime()
  const elapsed = Date.now() - lastRun

  if (elapsed < CHECK_INTERVAL_MS) {
    log.debug('Skipping evolution trigger check — too recent', {
      lastRunAgo: `${Math.round(elapsed / 3600000)}h`,
    })
    return
  }

  log.info('Running evolution trigger check')

  try {
    if (!existsSync(AGENTS_DIR)) {
      log.debug('No agents directory, skipping')
      updateLastRunTime()
      return
    }

    const agentDirs = readdirSync(AGENTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.'))
      .map(d => d.name)

    const agentRecords = agentDirs
      .map(agentId => {
        const satPath = join(AGENTS_DIR, agentId, 'memory', 'satisfaction.md')
        const records = parseSatisfactionFile(satPath)
        const soulMtime = getSoulMtime(agentId)
        return { agentId, records, soulMtime }
      })
      .filter(a => a.records.length > 0)

    const triggers = evaluateTriggers(agentRecords)

    if (triggers.length > 0) {
      writeTriggerFile(triggers)
      log.info('Evolution triggers fired', {
        count: triggers.length,
        agents: triggers.map(t => `${t.agentId}:${t.type}`),
      })
    } else {
      log.info('No evolution triggers fired')
    }

    updateLastRunTime()
  } catch (err) {
    log.error('Evolution trigger check failed', { error: err instanceof Error ? err.message : String(err) })
    updateLastRunTime()
  }
}

export const startPeriodicCheck = (): void => {
  checkAndRun()
  setInterval(checkAndRun, CHECK_INTERVAL_MS)
}
