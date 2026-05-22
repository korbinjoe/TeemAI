import { useState, useEffect } from 'react'

export type NotchState = 'compact' | 'expanded' | 'hidden'

export const useNotchState = () => {
  const [state, setState] = useState<NotchState>('compact')

  useEffect(() => {
    const unsub = window.notchBridge?.onStateChange((newState) => {
      setState(newState)
    })
    return () => unsub?.()
  }, [])

  const expand = () => window.notchBridge?.notchAction('expand')
  const compact = () => window.notchBridge?.notchAction('compact')

  return { state, expand, compact }
}
