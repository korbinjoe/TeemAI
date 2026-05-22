/**
 * useWhiteboard — chat  React
 *
 *  1. chatId  snapshot cold start
 *  2.  WS 'whiteboard:entry-added' / 'whiteboard:entry-archived'
 *      active  HTTP
 *  3.  append / archive / supersede  UI
 *
 *  mailbox / expert  chat
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { getWebSocketClient } from '@/services/WebSocketClient'
import { whiteboardService } from '@/services/whiteboardService'
import type {
  WhiteboardEntry,
  WhiteboardSnapshot,
  WhiteboardEntryInput,
} from '@shared/whiteboard-types'

interface UseWhiteboardResult {
  loading: boolean
  error: string | null
  goal: WhiteboardEntry | null
  active: WhiteboardEntry[]
  archivedCount: number
  updatedAt: string
  refresh: () => Promise<void>
  append: (input: WhiteboardEntryInput) => Promise<WhiteboardEntry>
  supersede: (entryId: string, input: WhiteboardEntryInput) => Promise<WhiteboardEntry>
  archive: (entryId: string, by: string) => Promise<void>
}

const EMPTY_SNAPSHOT: WhiteboardSnapshot = {
  chatId: '',
  goal: null,
  active: [],
  archivedCount: 0,
  updatedAt: '',
}

export const useWhiteboard = (chatId: string | undefined): UseWhiteboardResult => {
  const [snapshot, setSnapshot] = useState<WhiteboardSnapshot>(EMPTY_SNAPSHOT)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reqSeqRef = useRef(0)

  const refresh = useCallback(async () => {
    if (!chatId) {
      setSnapshot(EMPTY_SNAPSHOT)
      return
    }
    const seq = ++reqSeqRef.current
    setLoading(true)
    setError(null)
    try {
      const snap = await whiteboardService.getSnapshot(chatId)
      if (reqSeqRef.current === seq) setSnapshot(snap)
    } catch (e) {
      if (reqSeqRef.current === seq) {
        setError(e instanceof Error ? e.message : String(e))
        setSnapshot(EMPTY_SNAPSHOT)
      }
    } finally {
      if (reqSeqRef.current === seq) setLoading(false)
    }
  }, [chatId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!chatId) return
    const wsClient = getWebSocketClient()

    const handleAdded = (payload: { chatId: string; entry: WhiteboardEntry; supersededId?: string }) => {
      if (payload.chatId !== chatId) return
      setSnapshot((prev) => {
        const filtered = payload.supersededId
          ? prev.active.filter((e) => e.id !== payload.supersededId)
          : prev.active
        if (payload.entry.type === 'goal') {
          return {
            ...prev,
            goal: payload.entry,
            active: filtered.filter((e) => e.id !== payload.entry.id),
            updatedAt: payload.entry.timestamp,
          }
        }
        const exists = filtered.some((e) => e.id === payload.entry.id)
        return {
          ...prev,
          active: exists ? filtered : [...filtered, payload.entry],
          updatedAt: payload.entry.timestamp,
        }
      })
    }

    const handleArchived = (payload: { chatId: string; entryId: string; archivedCount: number }) => {
      if (payload.chatId !== chatId) return
      setSnapshot((prev) => ({
        ...prev,
        goal: prev.goal?.id === payload.entryId ? null : prev.goal,
        active: prev.active.filter((e) => e.id !== payload.entryId),
        archivedCount: payload.archivedCount,
        updatedAt: new Date().toISOString(),
      }))
    }

    wsClient.on('whiteboard:entry-added', handleAdded)
    wsClient.on('whiteboard:entry-archived', handleArchived)
    return () => {
      wsClient.off('whiteboard:entry-added', handleAdded)
      wsClient.off('whiteboard:entry-archived', handleArchived)
    }
  }, [chatId])

  const append = useCallback(async (input: WhiteboardEntryInput) => {
    if (!chatId) throw new Error('whiteboard.append: missing chatId')
    const { entry } = await whiteboardService.appendEntry(chatId, input)
    return entry
  }, [chatId])

  const supersede = useCallback(async (entryId: string, input: WhiteboardEntryInput) => {
    if (!chatId) throw new Error('whiteboard.supersede: missing chatId')
    const { entry } = await whiteboardService.supersede(chatId, entryId, input)
    return entry
  }, [chatId])

  const archive = useCallback(async (entryId: string, by: string) => {
    if (!chatId) throw new Error('whiteboard.archive: missing chatId')
    await whiteboardService.archive(chatId, entryId, by)
  }, [chatId])

  return {
    loading,
    error,
    goal: snapshot.goal,
    active: snapshot.active,
    archivedCount: snapshot.archivedCount,
    updatedAt: snapshot.updatedAt,
    refresh,
    append,
    supersede,
    archive,
  }
}
