/**
 * useMultiRepoGitStatus —  Git  Hook
 *
 *  repository  git  WS
 * - worktree  worktree Agent
 * -  repositories
 *
 * GitWatchManager  chatId  path
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { API_BASE } from '@/config/api'
import { getWebSocketClient } from '@/services/WebSocketClient'
import type { AgentActivity, WorktreeSession } from '@/types/chat'
import type { GitChangesEventPayload } from '@shared/ws/git'
import type { GitStatusData } from './useGitStatus'

export { type GitStatusData }

export interface UseMultiRepoGitStatusOptions {
  worktreeSessions: WorktreeSession[]
  agentActivity: AgentActivity | null
  repositories?: Array<{ path: string; name?: string }>
  chatId?: string
  /**
   * When false, the hook suspends all git/worktree subscriptions and fetches
   * (background, non-active mission instances do no live git work). On the
   * transition back to true it re-subscribes and fires one immediate refresh.
   */
  enabled?: boolean
}

export interface MultiRepoGitStatusAggregate {
  totalChangedFiles: number
  totalInsertions: number
  totalDeletions: number
}

export interface MultiRepoGitStatus {
  statusMap: Map<string, GitStatusData>
  aggregate: MultiRepoGitStatusAggregate
  optimisticUpdate: (repoPath: string, updater: (prev: GitStatusData) => GitStatusData) => void
}

const buildSignature = (snapshot: GitStatusData): string => {
  let h = 2166136261
  const push = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
  }
  push(snapshot.worktreePath)
  push(snapshot.branch)
  push(snapshot.baseBranch)
  push(String(snapshot.aheadCount))
  push(String(snapshot.changedFiles))
  push(String(snapshot.untrackedFiles))
  push(String(snapshot.insertions))
  push(String(snapshot.deletions))
  for (const e of snapshot.diffEntries) {
    push(e.file)
    push(e.status)
    push(String(e.staged))
    push(String(e.insertions))
    push(String(e.deletions))
  }
  return `${snapshot.diffEntries.length}:${h >>> 0}`
}

const useMultiRepoGitStatus = ({
  worktreeSessions,
  repositories = [],
  chatId,
  enabled = true,
}: UseMultiRepoGitStatusOptions): MultiRepoGitStatus => {
  const [statusMap, setStatusMap] = useState<Map<string, GitStatusData>>(new Map())
  const lastSignatures = useRef<Map<string, string>>(new Map())

  const activeSession = worktreeSessions.find((s) => s.status === 'active')

  const targetPaths = useMemo(() => {
    if (activeSession) return [activeSession.worktreePath]
    if (repositories.length > 0) return repositories.map((r) => r.path)
    return []
  }, [activeSession, repositories])

  const targetBase = activeSession?.baseBranch
  const isWorktreeMode = !!activeSession

  const applySnapshot = useCallback((repoPath: string, snapshot: GitStatusData) => {
    const sig = buildSignature(snapshot)
    if (sig === lastSignatures.current.get(repoPath)) return
    lastSignatures.current.set(repoPath, sig)
    setStatusMap((prev) => {
      const next = new Map(prev)
      next.set(repoPath, snapshot)
      return next
    })
  }, [])

  const optimisticUpdate = useCallback((repoPath: string, updater: (prev: GitStatusData) => GitStatusData) => {
    setStatusMap((prev) => {
      const current = prev.get(repoPath)
      if (!current) return prev
      const next = updater(current)
      lastSignatures.current.set(repoPath, buildSignature(next))
      const updated = new Map(prev)
      updated.set(repoPath, next)
      return updated
    })
  }, [])

  const fetchInitialSnapshots = useCallback(async (paths: string[]) => {
    await Promise.all(paths.map(async (path) => {
      try {
        if (isWorktreeMode && targetBase) {
          const params = new URLSearchParams({ path, base: targetBase })
          const [statusRes, diffRes] = await Promise.all([
            fetch(`${API_BASE}/api/worktree/status?${params}`),
            fetch(`${API_BASE}/api/worktree/diff?${params}`),
          ])
          if (!statusRes.ok || !diffRes.ok) return
          const status = await statusRes.json()
          const diff = await diffRes.json()
          const files = (diff.files || []) as GitStatusData['diffEntries']
          applySnapshot(path, {
            worktreePath: path,
            branch: status.branch,
            baseBranch: status.baseBranch,
            aheadCount: status.aheadCount,
            changedFiles: status.changedFiles,
            untrackedFiles: status.untrackedFiles,
            insertions: files.reduce((s: number, e) => s + e.insertions, 0),
            deletions: files.reduce((s: number, e) => s + e.deletions, 0),
            diffEntries: files,
          })
        } else {
          const params = new URLSearchParams({ path })
          const res = await fetch(`${API_BASE}/api/git/working-changes?${params}`)
          if (!res.ok) return
          const snapshot: GitStatusData = await res.json()
          applySnapshot(path, snapshot)
        }
      } catch (err) {
        console.warn('[useMultiRepoGitStatus] snapshot error for', path, err)
      }
    }))
  }, [isWorktreeMode, targetBase, applySnapshot])

  const subscribedPaths = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!chatId) {
      setStatusMap(new Map())
      lastSignatures.current.clear()
      return
    }

    // Backgrounded instance: the prior run's cleanup already unsubscribed every
    // path and cleared subscribedPaths, so we simply do no live git work here.
    // statusMap is intentionally retained so the change-count badge keeps its
    // last-known value until this instance becomes active again.
    if (!enabled) return

    const wsClient = getWebSocketClient()
    const cid = chatId
    const currentSet = new Set(targetPaths)
    const prevSet = subscribedPaths.current

    const newPaths = targetPaths.filter((p) => !prevSet.has(p))
    const removedPaths = [...prevSet].filter((p) => !currentSet.has(p))

    for (const path of removedPaths) {
      wsClient.send('git:unsubscribe', { chatId: cid, path })
      prevSet.delete(path)
    }

    if (removedPaths.length > 0) {
      setStatusMap((prev) => {
        const next = new Map(prev)
        for (const path of removedPaths) {
          next.delete(path)
          lastSignatures.current.delete(path)
        }
        return next
      })
    }

    for (const path of newPaths) {
      wsClient.send('git:subscribe', { chatId: cid, path })
      prevSet.add(path)
    }

    if (newPaths.length > 0) {
      fetchInitialSnapshots(newPaths)
    }

    const onGitChanges = (event: GitChangesEventPayload) => {
      if (event.chatId !== cid) return
      if (!currentSet.has(event.path)) return
      applySnapshot(event.path, event.payload as GitStatusData)
    }

    wsClient.on('git:changes', onGitChanges)

    return () => {
      wsClient.off('git:changes', onGitChanges)
      for (const path of subscribedPaths.current) {
        wsClient.send('git:unsubscribe', { chatId: cid, path })
      }
      subscribedPaths.current.clear()
    }
  }, [chatId, enabled, targetPaths, fetchInitialSnapshots, applySnapshot])

  const aggregate = useMemo<MultiRepoGitStatusAggregate>(() => {
    let totalChangedFiles = 0
    let totalInsertions = 0
    let totalDeletions = 0
    for (const status of statusMap.values()) {
      totalChangedFiles += status.changedFiles
      totalInsertions += status.insertions
      totalDeletions += status.deletions
    }
    return { totalChangedFiles, totalInsertions, totalDeletions }
  }, [statusMap])

  return { statusMap, aggregate, optimisticUpdate }
}

export default useMultiRepoGitStatus
