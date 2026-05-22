/**
 *  localStorage
 *  API  Claude  .jsonl
 */

import type { HistoryMetadata } from '../types/chat'

const HISTORY_STORAGE_KEY = 'openteam:history'
const MAX_HISTORY_RECORDS = 50

export function loadHistory(): HistoryMetadata[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function persistHistory(records: HistoryMetadata[]) {
  const trimmed = records.slice(0, MAX_HISTORY_RECORDS)
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(trimmed))
  } catch (e) {
    console.warn('[historyStorage] persist failed:', e)
  }
}

export function deleteFromHistory(sessionId: string) {
  const records = loadHistory().filter((r) => r.sessionId !== sessionId)
  persistHistory(records)
  return records
}

export function clearAllHistory() {
  persistHistory([])
}

export function upsertHistory(record: HistoryMetadata): HistoryMetadata[] {
  const history = loadHistory()
  const exists = history.some((r) => r.sessionId === record.sessionId)
  const next = exists
    ? history.map((r) => r.sessionId === record.sessionId ? record : r)
    : [record, ...history]
  persistHistory(next)
  return next
}

export function ensureInHistory(
  sessionId: string,
  defaults: Omit<HistoryMetadata, 'sessionId'>
): HistoryMetadata[] {
  const history = loadHistory()
  if (history.some((r) => r.sessionId === sessionId)) return history
  const record: HistoryMetadata = { sessionId, ...defaults }
  const next = [record, ...history]
  persistHistory(next)
  return next
}

export function updateCliSessionIdInHistory(sessionId: string, cliSessionId: string) {
  const history = loadHistory()
  if (!history.some((r) => r.sessionId === sessionId)) return history
  const next = history.map((r) =>
    r.sessionId === sessionId ? { ...r, cliSessionId } : r
  )
  persistHistory(next)
  return next
}
