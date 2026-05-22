/**
 * TUI WebSocket hook
 *  Node ws  server Web
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import WebSocket from 'ws'

type MessageHandler = (payload: any) => void

export const useWebSocket = (url: string) => {
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const handlersRef = useRef<Map<string, MessageHandler[]>>(new Map())

  useEffect(() => {
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.on('open', () => {
      setConnected(true)
    })

    ws.on('message', (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString())
        const { type, payload } = message

        const handlers = handlersRef.current.get(type) || []
        for (const handler of handlers) {
          handler(payload)
        }

        const allHandlers = handlersRef.current.get('*') || []
        for (const handler of allHandlers) {
          handler(message)
        }
      } catch {
        // ignore parse errors
      }
    })

    ws.on('close', () => {
      setConnected(false)
    })

    ws.on('error', () => {
      setConnected(false)
    })

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [url])

  const send = useCallback((type: string, payload?: any) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify({ type, payload }))
  }, [])

  const on = useCallback((type: string, handler: MessageHandler) => {
    const handlers = handlersRef.current
    if (!handlers.has(type)) {
      handlers.set(type, [])
    }
    handlers.get(type)!.push(handler)

    return () => {
      const list = handlers.get(type)
      if (list) {
        const idx = list.indexOf(handler)
        if (idx > -1) list.splice(idx, 1)
      }
    }
  }, [])

  return { connected, send, on }
}
