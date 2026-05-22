import { useState } from 'react'
import type { ExpertPermissionRequestPayload } from '@shared/ws-types'

export const usePermissionEvents = (chatIdRef: React.RefObject<string | undefined>) => {
  const [permissionRequests, setPermissionRequests] = useState<ExpertPermissionRequestPayload[]>([])

  const isCurrentChat = (payload?: { chatId?: string }) =>
    !!payload?.chatId && !!chatIdRef.current && payload.chatId === chatIdRef.current

  const handleExpertPermissionRequest = (payload: ExpertPermissionRequestPayload) => {
    if (!isCurrentChat(payload)) return
    if (!payload?.requestId || !payload?.toolCall) return
    setPermissionRequests((prev) => {
      if (prev.some((r) => r.requestId === payload.requestId)) return prev
      return [...prev, payload]
    })
  }

  const handleChatPermissionResolved = (payload: { chatId: string; requestId: string }) => {
    if (!isCurrentChat(payload)) return
    if (!payload?.requestId) return
    setPermissionRequests((prev) => prev.filter((r) => r.requestId !== payload.requestId))
  }

  const dismissPermissionRequest = (requestId: string) => {
    setPermissionRequests((prev) => prev.filter((r) => r.requestId !== requestId))
  }

  return { permissionRequests, handleExpertPermissionRequest, handleChatPermissionResolved, dismissPermissionRequest }
}
