import { useEffect } from 'react'
import { API_BASE, authFetch } from '@/config/api'
import type { WorkspaceInfo } from '@/components/home/types'

export const WS_EVENTS = {
  OPEN_CREATE_MODAL: 'open-create-workspace-modal',
  CREATED: 'workspace-created',
} as const

/**
 *  workspace-created
 *  EmptyTabPage / NewChatForm
 */
export const useWorkspaceCreatedRefresh = (
  setWorkspaces: React.Dispatch<React.SetStateAction<WorkspaceInfo[]>>,
  setSelectedWsId: (id: string) => void,
) => {
  useEffect(() => {
    const handler = (e: Event) => {
      const newWs = (e as CustomEvent).detail
      authFetch(`${API_BASE}/api/workspaces`)
        .then((r) => r.ok ? r.json() : [])
        .then((data: WorkspaceInfo[]) => {
          setWorkspaces(data)
          setSelectedWsId(newWs.id)
        })
        .catch((err) => console.warn('[useWorkspaceCreatedRefresh] refresh failed:', err))
    }
    window.addEventListener(WS_EVENTS.CREATED, handler)
    return () => window.removeEventListener(WS_EVENTS.CREATED, handler)
  }, [setWorkspaces, setSelectedWsId])
}
