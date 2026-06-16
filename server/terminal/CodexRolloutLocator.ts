/**
 * CodexRolloutLocator -  threadId  Codex rollout
 *
 * Codex  JSONL
 *   ~/.codex/sessions/YYYY/MM/DD/rollout-<ISO-timestamp>-<threadId>.jsonl
 *
 * threadId  cliSessionIdUUID spawn
 * exec  vs  7  +
 */

import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const sessionsRoot = (): string => join(homedir(), '.codex', 'sessions')
const HIT_CACHE_TTL_MS = 5 * 60_000
const MISS_CACHE_TTL_MS = 2_000
const PATH_CACHE_MAX = 500
const rolloutPathCache = new Map<string, { path: string | null; checkedAt: number }>()

const findRolloutInDir = (dir: string, threadId: string): string | null => {
  if (!existsSync(dir)) return null
  try {
    const files = readdirSync(dir)
    const match = files.find((f) => f.startsWith('rollout-') && f.endsWith(`-${threadId}.jsonl`))
    return match ? join(dir, match) : null
  } catch {
    return null
  }
}

/**
 *  threadId  Codex rollout  null
 */
export const locateCodexRollout = (threadId: string): string | null => {
  if (!threadId) return null
  const cached = rolloutPathCache.get(threadId)
  if (cached) {
    const ttl = cached.path ? HIT_CACHE_TTL_MS : MISS_CACHE_TTL_MS
    if (Date.now() - cached.checkedAt < ttl && (!cached.path || existsSync(cached.path))) {
      return cached.path
    }
    rolloutPathCache.delete(threadId)
  }

  const remember = (path: string | null): string | null => {
    rolloutPathCache.set(threadId, { path, checkedAt: Date.now() })
    if (rolloutPathCache.size > PATH_CACHE_MAX) {
      const oldest = rolloutPathCache.keys().next().value
      if (oldest) rolloutPathCache.delete(oldest)
    }
    return path
  }

  const root = sessionsRoot()
  if (!existsSync(root)) return remember(null)

  const now = Date.now()
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const d = new Date(now - dayOffset * 86_400_000)
    const yyyy = String(d.getUTCFullYear())
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(d.getUTCDate()).padStart(2, '0')
    const found = findRolloutInDir(join(root, yyyy, mm, dd), threadId)
    if (found) return remember(found)
  }

  try {
    for (const year of readdirSync(root)) {
      const yearDir = join(root, year)
      try {
        for (const month of readdirSync(yearDir)) {
          const monthDir = join(yearDir, month)
          try {
            for (const day of readdirSync(monthDir)) {
              const found = findRolloutInDir(join(monthDir, day), threadId)
              if (found) return remember(found)
            }
          } catch { /* skip */ }
        }
      } catch { /* skip */ }
    }
  } catch {
    /* sessions dir Exception */
  }
  return remember(null)
}
