/**
 * useTerminalWsEvents —  WS
 *
 * -  pendingChunks / flushRaf / enqueueWrite  rAF
 * - handleExpertData  inst.write() / inst.resetAndWriteSnapshot()
 * -  TerminalInstance
 * - seq  snapshotApplied Map
 * - open  activeKey effect
 */

import { useEffect, useRef } from 'react'
import type { WebSocketClient } from '../../services/WebSocketClient'
import type { TerminalInstance } from './TerminalInstance'

interface ExpertInfo {
  agentId: string
  sessionId: string
  agentName: string
  agentIcon: string
  status: 'running' | 'completed'
  exitCode?: number
  completedAt?: string
}

interface UseTerminalWsEventsOptions {
  wsClient: WebSocketClient
  chatId?: string
  terminalsRef: React.RefObject<Map<string, TerminalInstance> | null>
  expertsRef: React.MutableRefObject<ExpertInfo[]>
  activeKey: string
  getOrCreateInstance: (agentId: string) => TerminalInstance
  tryOpen: (agentId: string) => Promise<void>
  disposeTerminal: (agentId: string) => void
  setExperts: React.Dispatch<React.SetStateAction<ExpertInfo[]>>
  setActiveKey: React.Dispatch<React.SetStateAction<string>>
}

export const useTerminalWsEvents = ({
  wsClient,
  chatId,
  terminalsRef,
  expertsRef,
  activeKey,
  getOrCreateInstance,
  tryOpen,
  disposeTerminal,
  setExperts,
  setActiveKey,
}: UseTerminalWsEventsOptions) => {
  const activeKeyRef = useRef(activeKey)
  activeKeyRef.current = activeKey
  const chatIdRef = useRef(chatId)
  chatIdRef.current = chatId
  /**  effect  chatId cleanup  chatId  */
  const prevChatIdRef = useRef(chatId)

  useEffect(() => {
    prevChatIdRef.current = chatId

    const isCurrentChatEvent = (payload?: { chatId?: string }) => {
      if (!payload?.chatId) return false
      if (!chatIdRef.current) return false
      return payload.chatId === chatIdRef.current
    }

    const lastSeqByAgent = new Map<string, { sessionId: string; seq: number }>()

    const handleExpertData = (payload: { agentId: string; chatId?: string; sessionId?: string; seq?: number; snapshot?: boolean; data: string; ptySize?: { cols: number; rows: number } }) => {
      if (!isCurrentChatEvent(payload)) {
        console.warn('[DIAG] expert:data DROPPED by isCurrentChatEvent', { agentId: payload.agentId, payloadChatId: payload.chatId, currentChatId: chatIdRef.current })
        return
      }
      const currentExperts = expertsRef.current ?? []
      const currentExpert = currentExperts.find((e) => e.agentId === payload.agentId)
      if (!currentExpert || !payload.sessionId) {
        console.warn('[DIAG] expert:data DROPPED: expert not found or no sessionId', { agentId: payload.agentId, hasExpert: !!currentExpert, hasSessionId: !!payload.sessionId, expertIds: currentExperts.map(e => e.agentId) })
        return
      }
      if (!currentExpert.sessionId) {
        setExperts(prev => prev.map(e =>
          e.agentId === payload.agentId ? { ...e, sessionId: payload.sessionId! } : e
        ))
        expertsRef.current = (expertsRef.current ?? []).map(e =>
          e.agentId === payload.agentId ? { ...e, sessionId: payload.sessionId! } : e
        )
      } else if (currentExpert.sessionId !== payload.sessionId) {
        console.warn('[DIAG] expert:data DROPPED: sessionId mismatch', { agentId: payload.agentId, expected: currentExpert.sessionId, got: payload.sessionId })
        return
      }

      const sessionId = payload.sessionId
      if (payload.seq != null) {
        const last = lastSeqByAgent.get(payload.agentId)
        if (last && last.sessionId === sessionId && payload.seq <= last.seq) {
          return
        }
        lastSeqByAgent.set(payload.agentId, { sessionId, seq: payload.seq })
      }

      const current = terminalsRef.current?.get(payload.agentId)
      const inst = (!current || current.isDisposed)
        ? getOrCreateInstance(payload.agentId)
        : current

      if (payload.ptySize) {
        inst.syncSize(payload.ptySize.cols, payload.ptySize.rows)
      }

      if (payload.snapshot) {
        inst.resetAndWriteSnapshot(payload.data)
      } else {
        inst.write(payload.data)
      }
    }

    const handleExpertStarted = (payload: ExpertInfo & { chatId?: string }) => {
      if (!isCurrentChatEvent(payload)) return

      disposeTerminal(payload.agentId)
      const remaining = (expertsRef.current ?? []).filter(e => e.agentId !== payload.agentId)
      setExperts(prev => prev.filter(e => e.agentId !== payload.agentId))
      expertsRef.current = remaining
      if (activeKeyRef.current === payload.agentId) {
        setActiveKey(remaining.length > 0 ? remaining[0].agentId : '')
      }
    }

    const handleExpertExit = (payload: { agentId: string; chatId?: string; exitCode?: number }) => {
      if (!isCurrentChatEvent(payload)) return
      const inst = terminalsRef.current?.get(payload.agentId)
      if (inst) {
        const msg = payload.exitCode !== undefined
          ? `\r\n\x1b[33m[Agent terminated with exit code: ${payload.exitCode}]\x1b[0m\r\n`
          : '\r\n\x1b[33m[Agent terminated]\x1b[0m\r\n'
        inst.write(msg)
      }
      setExperts(prev => prev.map(e =>
        e.agentId === payload.agentId
          ? { ...e, status: 'completed' as const, exitCode: payload.exitCode, completedAt: new Date().toISOString() }
          : e
      ))
    }

    const handleExpertStopped = (payload: { agentId: string; chatId?: string; exitCode?: number }) => {
      if (!isCurrentChatEvent(payload)) return
      const inst = terminalsRef.current?.get(payload.agentId)
      if (inst) inst.write('\r\n\x1b[33m[Agent stopped manually]\x1b[0m\r\n')
      setExperts(prev => prev.map(e =>
        e.agentId === payload.agentId
          ? { ...e, status: 'completed' as const, exitCode: payload.exitCode ?? -1, completedAt: new Date().toISOString() }
          : e
      ))
    }

    const handleExpertResumeFailed = (payload: { agentId: string; chatId?: string; sessionId?: string; reason?: string; message?: string }) => {
      if (!isCurrentChatEvent(payload)) return
      let shouldRemove = false
      let nextActiveKey: string | null = null
      setExperts(prev => {
        const target = prev.find(e => e.agentId === payload.agentId)
        if (!target) return prev

        if (payload.sessionId && target.sessionId && payload.sessionId !== target.sessionId) {
          return prev
        }

        shouldRemove = true
        const filtered = prev.filter(e => e.agentId !== payload.agentId)
        if (filtered.length > 0 && !filtered.some(e => e.agentId === activeKeyRef.current)) {
          nextActiveKey = filtered[0].agentId
        }
        return filtered
      })

      if (shouldRemove) {
        disposeTerminal(payload.agentId)
        if (nextActiveKey) setActiveKey(nextActiveKey)
      }
    }

    const handleExpertError = (payload: { agentId?: string; chatId?: string; error?: string }) => {
      if (!isCurrentChatEvent(payload)) return
      if (!payload?.agentId) return
      disposeTerminal(payload.agentId)
      let nextActiveKeyOnError: string | null = null
      setExperts(prev => {
        const filtered = prev.filter(e => e.agentId !== payload.agentId)
        if (filtered.length > 0 && !filtered.some(e => e.agentId === activeKeyRef.current)) {
          nextActiveKeyOnError = filtered[0].agentId
        }
        return filtered
      })
      if (nextActiveKeyOnError) setActiveKey(nextActiveKeyOnError)
    }

    const handleExpertStartFailed = (payload: { agentId: string; chatId?: string; exitCode?: number; message?: string }) => {
      if (!isCurrentChatEvent(payload)) return
      if (!payload?.agentId) return
      disposeTerminal(payload.agentId)
      let nextActiveKeyOnFail: string | null = null
      setExperts(prev => {
        const filtered = prev.filter(e => e.agentId !== payload.agentId)
        if (filtered.length > 0 && !filtered.some(e => e.agentId === activeKeyRef.current)) {
          nextActiveKeyOnFail = filtered[0].agentId
        }
        return filtered
      })
      if (nextActiveKeyOnFail) setActiveKey(nextActiveKeyOnFail)
    }

    const handleReconnected = () => {
      const cid = chatIdRef.current
      terminalsRef.current?.forEach((inst, agentId) => {
        if (inst.isOpened && !inst.isDisposed) {
          inst.write('\r\n\x1b[33m[Connection restored]\x1b[0m\r\n')
          inst.reactivate()
          if (cid) {
            wsClient.send('expert:resize', { chatId: cid, agentId, cols: inst.cols, rows: inst.rows })
          }
        }
      })
    }

    wsClient.on('expert:data', handleExpertData)
    wsClient.on('expert:started', handleExpertStarted)
    wsClient.on('expert:exit', handleExpertExit)
    wsClient.on('expert:stopped', handleExpertStopped)
    wsClient.on('expert:resume-failed', handleExpertResumeFailed)
    wsClient.on('expert:error', handleExpertError)
    wsClient.on('expert:start-failed', handleExpertStartFailed)
    wsClient.on('reconnected', handleReconnected)

    return () => {
      wsClient.off('expert:data', handleExpertData)
      wsClient.off('expert:started', handleExpertStarted)
      wsClient.off('expert:exit', handleExpertExit)
      wsClient.off('expert:stopped', handleExpertStopped)
      wsClient.off('expert:resume-failed', handleExpertResumeFailed)
      wsClient.off('expert:error', handleExpertError)
      wsClient.off('expert:start-failed', handleExpertStartFailed)
      wsClient.off('reconnected', handleReconnected)
      const nextChatId = chatIdRef.current
      if (nextChatId !== prevChatIdRef.current) {
        terminalsRef.current?.forEach((_, id) => disposeTerminal(id))
        setExperts([])
        setActiveKey('')
      }
    }
  }, [wsClient, chatId, getOrCreateInstance, tryOpen, disposeTerminal, terminalsRef, expertsRef, setExperts, setActiveKey])
}
