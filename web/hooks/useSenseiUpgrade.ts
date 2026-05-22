import { useState, useCallback, useEffect, useRef } from 'react'
import { getWebSocketClient } from '../services/WebSocketClient'
import { API_BASE, authFetch } from '@/config/api'
import i18n from '@/i18n'

type UpgradeStatus = 'idle' | 'analyzing' | 'complete' | 'error'

export interface SenseiLogEntry {
  time: number
  text: string
  /** stage= content= verbose=CLI verbose */
  type: 'stage' | 'content' | 'verbose'
}

interface UseSenseiUpgradeReturn {
  launch: () => Promise<string | null>
  generate: (description: string) => Promise<void>
  cancel: () => void
  status: UpgradeStatus
  logs: SenseiLogEntry[]
  original: string
  optimized: string
  error: string | null
  apply: () => void
  dismiss: () => void
}

const useSenseiUpgrade = (
  agentId: string | undefined,
  markdown: string,
  updateMarkdown: (md: string) => void,
): UseSenseiUpgradeReturn => {
  const [status, setStatus] = useState<UpgradeStatus>('idle')
  const [logs, setLogs] = useState<SenseiLogEntry[]>([])
  const [original, setOriginal] = useState('')
  const [optimized, setOptimized] = useState('')
  const [error, setError] = useState<string | null>(null)
  const optimizedRef = useRef('')

  useEffect(() => {
    const ws = getWebSocketClient()

    const handleProgress = (data: { agentId: string; text: string; logType?: 'stage' | 'content' | 'verbose' }) => {
      const logType = data.logType ?? 'content'

      if (logType === 'content') {
        setLogs((prev) => {
          const last = prev[prev.length - 1]
          if (last && last.type === 'content') {
            return [...prev.slice(0, -1), { ...last, text: last.text + data.text }]
          }
          return [...prev, { time: Date.now(), text: data.text, type: 'content' }]
        })
      } else {
        setLogs((prev) => [...prev, { time: Date.now(), text: data.text, type: logType }])
      }
    }

    const handleComplete = (data: { agentId: string; original: string; optimized: string }) => {
      setStatus('complete')
      setOriginal(data.original)
      setOptimized(data.optimized)
      optimizedRef.current = data.optimized
    }

    const handleError = (data: { agentId: string; error: string }) => {
      setStatus('error')
      setError(data.error)
    }

    ws.on('sensei:progress', handleProgress)
    ws.on('sensei:complete', handleComplete)
    ws.on('sensei:error', handleError)

    return () => {
      ws.off('sensei:progress', handleProgress)
      ws.off('sensei:complete', handleComplete)
      ws.off('sensei:error', handleError)
    }
  }, [])

  useEffect(() => {
    if (status !== 'analyzing' || logs.length > 0) return
    const timer = setTimeout(() => {
      setStatus('error')
      setError(i18n.t('common:upgrade.noResponse'))
    }, 15000)
    return () => clearTimeout(timer)
  }, [status, logs.length])

  /**
   *  WS  analyzing
   *  toast
   *
   * @returns  null
   */
  const launch = useCallback(async (): Promise<string | null> => {
    if (!agentId) {
      return i18n.t('common:upgrade.noAgentId')
    }
    if (!markdown.trim()) {
      return i18n.t('common:upgrade.emptyMarkdown')
    }

    setStatus('analyzing')
    setLogs([])
    setOriginal('')
    setOptimized('')
    setError(null)

    try {
      const ws = getWebSocketClient()
      await ws.connect()
      ws.send('sensei:upgrade', { agentId, markdown })
      return null
    } catch (err) {
      setStatus('error')
      const reason = err instanceof Error ? err.message : String(err)
      setError(i18n.t('common:upgrade.wsConnectFailed', { reason }))
      return null
    }
  }, [agentId, markdown])

  const generateAbortRef = useRef<AbortController | null>(null)

  const generate = useCallback(async (description: string) => {
    if (!description.trim()) return

    generateAbortRef.current?.abort()
    const controller = new AbortController()
    generateAbortRef.current = controller

    setStatus('analyzing')
    setLogs([])
    setOriginal('')
    setOptimized('')
    setError(null)
    optimizedRef.current = ''

    try {
      const response = await authFetch(`${API_BASE}/api/agents/generate-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`)
      }

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const jsonStr = line.slice(6).trim()
          if (!jsonStr) continue
          try {
            const evt = JSON.parse(jsonStr) as {
              type: 'stage' | 'content' | 'complete' | 'error'
              text?: string
              content?: string
              error?: string
            }
            if (evt.type === 'stage' && evt.text) {
              setLogs((prev) => [...prev, { time: Date.now(), text: evt.text!, type: 'stage' }])
            } else if (evt.type === 'content' && evt.text) {
              setLogs((prev) => {
                const last = prev[prev.length - 1]
                if (last?.type === 'content') {
                  return [...prev.slice(0, -1), { ...last, text: last.text + evt.text }]
                }
                return [...prev, { time: Date.now(), text: evt.text!, type: 'content' }]
              })
            } else if (evt.type === 'complete' && evt.content) {
              optimizedRef.current = evt.content
              setOptimized(evt.content)
              setStatus('complete')
            } else if (evt.type === 'error') {
              setStatus('error')
              setError(evt.error ?? 'Generation failed')
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setStatus('idle')
        return
      }
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Generation failed. Please retry.')
    }
  }, [])

  const cancel = useCallback(() => {
    // Cancel HTTP generate
    generateAbortRef.current?.abort()
    generateAbortRef.current = null
    // Cancel WS upgrade
    if (agentId) {
      const ws = getWebSocketClient()
      if (ws.isConnected()) ws.send('sensei:cancel', { agentId })
    }
    setStatus('idle')
    setLogs([])
  }, [agentId])

  const apply = useCallback(() => {
    if (optimizedRef.current) {
      updateMarkdown(optimizedRef.current)
    }
    setStatus('idle')
    setLogs([])
    setOriginal('')
    setOptimized('')
  }, [updateMarkdown])

  const dismiss = useCallback(() => {
    setStatus('idle')
    setLogs([])
    setOriginal('')
    setOptimized('')
    setError(null)
  }, [])

  return {
    launch,
    generate,
    cancel,
    status,
    logs,
    original,
    optimized,
    error,
    apply,
    dismiss,
  }
}

export default useSenseiUpgrade
