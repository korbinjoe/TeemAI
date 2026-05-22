/**
 * @deprecated  useMultiRepoGitStatus  hook
 *
 * useGitStatus - Worktree /  Git  Hook
 *
 * 1.  GET
 * 2. WS  git:subscribe fs.watch  git:changes
 * 3.  /  git:unsubscribe watcher
 *
 *   -  chatIdchatId !== currentChatId
 *   -  unsub  sub
 *
 *   -  setInterval 5s worktree /
 *   -  agentActivity
 *   -  worktreeSessions / agentActivity / repositories
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { API_BASE, authFetch } from '@/config/api'
import { getWebSocketClient } from '@/services/WebSocketClient'
import type { AgentActivity, WorktreeSession } from '@/types/chat'
import type { GitChangesEventPayload } from '@shared/ws/git'

export interface GitStatusData {
  worktreePath: string
  branch: string
  baseBranch: string
  aheadCount: number
  changedFiles: number
  untrackedFiles: number
  insertions: number
  deletions: number
  diffEntries: Array<{
    file: string
    status: 'added' | 'modified' | 'deleted' | 'renamed'
    staged: boolean
    insertions: number
    deletions: number
  }>
}

interface UseGitStatusOptions {
  worktreeSessions: WorktreeSession[]
  agentActivity: AgentActivity | null
  repositories?: Array<{ path: string; name?: string }>
  chatId?: string
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

const useGitStatus = ({
  worktreeSessions,
  repositories = [],
  chatId,
}: UseGitStatusOptions): { gitStatus: GitStatusData | null; optimisticUpdate: (updater: (prev: GitStatusData) => GitStatusData) => void } => {
  const [gitStatus, setGitStatus] = useState<GitStatusData | null>(null)
  const lastSnapshotRef = useRef('')

  const activeSession = worktreeSessions.find((s) => s.status === 'active')
  const fallbackRepo = !activeSession && repositories.length > 0 ? repositories[0] : null

  const targetPath = activeSession?.worktreePath ?? fallbackRepo?.path ?? null
  const targetBase = activeSession?.baseBranch
  const isWorktreeMode = !!activeSession

  const applySnapshot = useCallback((snapshot: GitStatusData) => {
    const signature = buildSignature(snapshot)
    if (signature !== lastSnapshotRef.current) {
      lastSnapshotRef.current = signature
      setGitStatus(snapshot)
    }
  }, [])

  const optimisticUpdate = useCallback((updater: (prev: GitStatusData) => GitStatusData) => {
    setGitStatus(prev => {
      if (!prev) return prev
      const next = updater(prev)
      lastSnapshotRef.current = buildSignature(next)
      return next
    })
  }, [])

  const fetchInitialSnapshot = useCallback(async () => {
    if (!targetPath) return
    try {
      if (isWorktreeMode && targetBase) {
        const params = new URLSearchParams({ path: targetPath, base: targetBase })
        const [statusRes, diffRes] = await Promise.all([
          authFetch(`${API_BASE}/api/worktree/status?${params}`),
          authFetch(`${API_BASE}/api/worktree/diff?${params}`),
        ])
        if (!statusRes.ok || !diffRes.ok) return
        const status = await statusRes.json()
        const diff = await diffRes.json()
        const files = (diff.files || []) as GitStatusData['diffEntries']
        applySnapshot({
          worktreePath: targetPath,
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
        const params = new URLSearchParams({ path: targetPath })
        const res = await authFetch(`${API_BASE}/api/git/working-changes?${params}`)
        if (!res.ok) return
        const snapshot: GitStatusData = await res.json()
        applySnapshot(snapshot)
      }
    } catch (err) {
      console.warn('[useGitStatus] initial snapshot error:', err)
    }
  }, [targetPath, targetBase, isWorktreeMode, applySnapshot])

  useEffect(() => {
    if (!targetPath || !chatId) {
      setGitStatus(null)
      lastSnapshotRef.current = ''
      return
    }

    const wsClient = getWebSocketClient()
    const path = targetPath
    const cid = chatId

    fetchInitialSnapshot()

    const onGitChanges = (event: GitChangesEventPayload) => {
      if (event.chatId !== cid) return
      if (event.path !== path) return
      applySnapshot(event.payload as GitStatusData)
    }

    wsClient.on('git:changes', onGitChanges)
    wsClient.send('git:subscribe', { chatId: cid, path })

    return () => {
      wsClient.off('git:changes', onGitChanges)
      wsClient.send('git:unsubscribe', { chatId: cid, path })
    }
  }, [targetPath, chatId, fetchInitialSnapshot, applySnapshot])

  return { gitStatus, optimisticUpdate }
}

export default useGitStatus
