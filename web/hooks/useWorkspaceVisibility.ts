import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { API_BASE, authFetch } from '@/config/api'
import type { WorkspaceLite } from './useAllChats'

const LEGACY_STORAGE_KEY = 'openteam:v2:hiddenWorkspaces'
const MIGRATION_FLAG_KEY = 'openteam:v2:hiddenWorkspaces:serverMigrated'
const DIR_STORAGE_KEY = 'openteam:v2:hiddenDirs'

const putWorkspace = async (wsId: string, body: Record<string, unknown>): Promise<void> => {
  try {
    await authFetch(`${API_BASE}/api/workspaces/${wsId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {}
}

const readHiddenDirs = (): string[] => {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(DIR_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const writeHiddenDirs = (ids: string[]) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DIR_STORAGE_KEY, JSON.stringify(ids))
  } catch {}
}

export interface WorkspaceVisibilityApi {
  hiddenIds: Set<string>
  isHidden: (wsId: string) => boolean
  toggleHide: (wsId: string) => void
}

export const useWorkspaceVisibility = (workspaces: WorkspaceLite[] = []): WorkspaceVisibilityApi => {
  const [optHiddenAt, setOptHiddenAt] = useState<Record<string, number | null>>({})
  const [hiddenDirs, setHiddenDirs] = useState<string[]>(() => readHiddenDirs())

  const wsIdSet = useMemo(() => new Set(workspaces.map((w) => w.id)), [workspaces])

  useEffect(() => {
    if (Object.keys(optHiddenAt).length === 0) return
    const byId = new Map(workspaces.map((w) => [w.id, w]))
    setOptHiddenAt((prev) => {
      let changed = false
      const next = { ...prev }
      for (const id of Object.keys(prev)) {
        const ws = byId.get(id)
        if (!ws) continue
        const want = prev[id]
        const actual = ws.hiddenAt ?? null
        if ((want === null && actual === null) || (want !== null && actual !== null)) {
          delete next[id]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [workspaces, optHiddenAt])

  // One-shot migration: push legacy localStorage hidden workspace IDs to server
  const migrationStartedRef = useRef(false)
  useEffect(() => {
    if (migrationStartedRef.current) return
    if (typeof window === 'undefined') return
    if (window.localStorage.getItem(MIGRATION_FLAG_KEY) === '1') return
    if (workspaces.length === 0) return

    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) {
      try { window.localStorage.setItem(MIGRATION_FLAG_KEY, '1') } catch {}
      return
    }

    let legacyIds: string[] = []
    try {
      const parsed = JSON.parse(raw)
      legacyIds = Array.isArray(parsed) ? parsed : []
    } catch {
      try { window.localStorage.setItem(MIGRATION_FLAG_KEY, '1') } catch {}
      return
    }

    if (legacyIds.length === 0) {
      try { window.localStorage.setItem(MIGRATION_FLAG_KEY, '1') } catch {}
      return
    }

    migrationStartedRef.current = true
    const byId = new Map(workspaces.map((w) => [w.id, w]))
    const now = Date.now()
    const pushes: Array<Promise<void>> = []
    const dirIds: string[] = []

    for (const id of legacyIds) {
      if (byId.has(id)) {
        const ws = byId.get(id)!
        if (!ws.hiddenAt) pushes.push(putWorkspace(id, { hiddenAt: now }))
      } else {
        dirIds.push(id)
      }
    }

    if (dirIds.length > 0) writeHiddenDirs(dirIds)

    void Promise.allSettled(pushes).then(() => {
      try {
        window.localStorage.setItem(MIGRATION_FLAG_KEY, '1')
        window.localStorage.removeItem(LEGACY_STORAGE_KEY)
      } catch {}
    })
  }, [workspaces])

  const hiddenIds = useMemo(() => {
    const out = new Set<string>()
    for (const ws of workspaces) {
      const override = optHiddenAt[ws.id]
      if (override === null) continue
      if (override !== undefined || ws.hiddenAt) out.add(ws.id)
    }
    for (const id of hiddenDirs) out.add(id)
    return out
  }, [workspaces, optHiddenAt, hiddenDirs])

  const isHidden = useCallback((wsId: string) => hiddenIds.has(wsId), [hiddenIds])

  const toggleHide = useCallback((key: string) => {
    if (wsIdSet.has(key)) {
      const currentlyHidden = hiddenIds.has(key)
      if (currentlyHidden) {
        setOptHiddenAt((prev) => ({ ...prev, [key]: null }))
        void putWorkspace(key, { hiddenAt: null })
      } else {
        const ts = Date.now()
        setOptHiddenAt((prev) => ({ ...prev, [key]: ts }))
        void putWorkspace(key, { hiddenAt: ts })
      }
    } else {
      setHiddenDirs((prev) => {
        const next = prev.includes(key)
          ? prev.filter((id) => id !== key)
          : [...prev, key]
        writeHiddenDirs(next)
        return next
      })
    }
  }, [wsIdSet, hiddenIds])

  return { hiddenIds, isHidden, toggleHide }
}
