/**
 * RightPanel —  wrapper
 *
 *  WebIDEPanel expert  cwd  workspace
 */

import { useState, useEffect, useMemo, lazy, Suspense } from 'react'
import { getWebSocketClient } from '@/services/WebSocketClient'
import type { GitStatusData } from '@/hooks/useGitStatus'
import type { MultiRepoGitStatus } from '@/hooks/useMultiRepoGitStatus'

const WebIDEPanel = lazy(() => import('./WebIDEPanel'))

interface ExpertRunModeInfo {
  agentId: string
  cwd?: string
}

export interface WorkspaceRoot {
  path: string
  name: string
}

export interface RightPanelProps {
  chatId?: string
  gitStatus?: GitStatusData | null
  multiGitStatus?: Map<string, GitStatusData>
  onMultiOptimisticUpdate?: MultiRepoGitStatus['optimisticUpdate']
  agentActive?: boolean
  connected?: boolean
  workingDirectory?: string
  repositories?: Array<{ path: string; name: string }>
  worktreePath?: string
  changesTabRequest?: number
}

const FALLBACK_STYLE: React.CSSProperties = {
  height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: 'rgb(var(--text-muted))', fontSize: 12,
}

const RightPanel = ({ chatId, gitStatus, multiGitStatus, onMultiOptimisticUpdate, agentActive = false, workingDirectory, repositories, worktreePath, changesTabRequest }: RightPanelProps) => {
  const [expertCwd, setExpertCwd] = useState<string | undefined>()
  const wsClient = getWebSocketClient()
  const needsExpertCwd = !workingDirectory && !worktreePath && (!repositories || repositories.length === 0)

  useEffect(() => {
    if (!needsExpertCwd) return

    let cleanup: (() => void) | undefined
    const timer = window.setTimeout(() => {
      const checkRunModes = (payload: { chatId?: string; agents: ExpertRunModeInfo[] }) => {
        if (chatId && payload.chatId !== chatId) return
        const streamJsonExpert = payload.agents.find(e => e.cwd)
        if (streamJsonExpert?.cwd) setExpertCwd(streamJsonExpert.cwd)
      }

      const handleStarted = (payload: ExpertRunModeInfo & { chatId?: string }) => {
        if (chatId && payload.chatId !== chatId) return
        if (payload.cwd) setExpertCwd(payload.cwd)
      }

      wsClient.on('agent:list', checkRunModes)
      wsClient.on('agent:list-updated', checkRunModes)
      wsClient.on('agent:started', handleStarted)

      if (wsClient.isConnected()) {
        wsClient.send('agent:list', { chatId })
      }

      cleanup = () => {
        wsClient.off('agent:list', checkRunModes)
        wsClient.off('agent:list-updated', checkRunModes)
        wsClient.off('agent:started', handleStarted)
      }
    }, 750)

    return () => {
      window.clearTimeout(timer)
      cleanup?.()
    }
  }, [wsClient, chatId, needsExpertCwd])

  const ideRootPath = workingDirectory || expertCwd || worktreePath

  const roots = useMemo<WorkspaceRoot[]>(() => {
    if (repositories && repositories.length > 0) {
      return repositories.map(r => ({ path: r.path, name: r.name }))
    }
    if (ideRootPath) {
      return [{ path: ideRootPath, name: ideRootPath.split('/').pop() || ideRootPath }]
    }
    return []
  }, [repositories, ideRootPath])

  if (roots.length === 0) {
    return <div style={FALLBACK_STYLE}>IDE Loading…</div>
  }

  return (
    <Suspense fallback={<div style={FALLBACK_STYLE}>IDE Loading…</div>}>
      <WebIDEPanel
        chatId={chatId}
        roots={roots}
        gitStatus={gitStatus}
        multiGitStatus={multiGitStatus}
        onMultiOptimisticUpdate={onMultiOptimisticUpdate}
        agentActive={agentActive}
        worktreePath={worktreePath}
        changesTabRequest={changesTabRequest}
      />
    </Suspense>
  )
}

RightPanel.displayName = 'RightPanel'

export default RightPanel
