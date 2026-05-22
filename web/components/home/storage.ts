import type { LastSessionConfig } from './types'
import {
  DIR_HISTORY_STORAGE_KEY,
  LAST_SESSION_KEY,
  HIDDEN_WORKSPACES_KEY,
  QUICK_ORDER_KEY,
} from './types'

// ── localStorage helpers ──

export const loadLastSession = (): LastSessionConfig | null => {
  try {
    const raw = localStorage.getItem(LAST_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed.repo && !parsed.repos) return { repos: [parsed.repo], model: parsed.model }
    return parsed
  } catch { return null }
}

export const saveLastSession = (config: LastSessionConfig) => {
  try { localStorage.setItem(LAST_SESSION_KEY, JSON.stringify(config)) } catch { /* ignore */ }
}

export const loadDirHistory = (): string[] => {
  try {
    const raw = localStorage.getItem(DIR_HISTORY_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []
  } catch { return [] }
}

export const persistDirList = (list: string[]) => {
  try { localStorage.setItem(DIR_HISTORY_STORAGE_KEY, JSON.stringify(list)) } catch { /* ignore */ }
  return list
}

export const saveDirHistory = (path: string) =>
  persistDirList([path, ...loadDirHistory().filter((x) => x !== path)].slice(0, 15))

export const loadHiddenWorkspaces = (): string[] => {
  try {
    const raw = localStorage.getItem(HIDDEN_WORKSPACES_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export const persistHiddenWorkspaces = (ids: string[]) => {
  try { localStorage.setItem(HIDDEN_WORKSPACES_KEY, JSON.stringify(ids)) } catch { /* ignore */ }
}

export const loadQuickOrder = (): string[] => {
  try {
    const raw = localStorage.getItem(QUICK_ORDER_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export const persistQuickOrder = (keys: string[]) => {
  try { localStorage.setItem(QUICK_ORDER_KEY, JSON.stringify(keys)) } catch { /* ignore */ }
}

const LAST_HOME_VISIT_KEY = 'openteam:last-home-visit'

export const loadLastHomeVisit = (): number | null => {
  try {
    const raw = localStorage.getItem(LAST_HOME_VISIT_KEY)
    return raw ? Number(raw) : null
  } catch { return null }
}

export const saveLastHomeVisit = () => {
  try { localStorage.setItem(LAST_HOME_VISIT_KEY, String(Date.now())) } catch { /* ignore */ }
}
