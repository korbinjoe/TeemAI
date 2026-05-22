import { useState, useEffect, useCallback } from 'react'
import { getWebSocketClient, type WsReceiveEventMap } from '../services/WebSocketClient'
import { authFetch } from '@/config/api'

export type PreflightData = WsReceiveEventMap['system:preflight']
export type PreflightItem = PreflightData['items'][number]

export const usePreflight = () => {
  const [data, setData] = useState<PreflightData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const ws = getWebSocketClient()
    const handler = (d: PreflightData) => {
      setData(d)
      setLoading(false)
    }
    ws.on('system:preflight', handler)

    authFetch('/api/preflight')
      .then((r) => r.json())
      .then((d: PreflightData) => {
        if (d.items?.length) {
          setData(d)
          setLoading(false)
        }
      })

    return () => { ws.off('system:preflight', handler) }
  }, [])

  const recheck = useCallback(() => {
    setLoading(true)
    authFetch('/api/preflight')
      .then((r) => r.json())
      .then((d: PreflightData) => {
        setData(d)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  return { data, loading, recheck }
}
