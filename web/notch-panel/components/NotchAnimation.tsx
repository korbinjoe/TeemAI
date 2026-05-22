import { useState, useEffect, useCallback, type ReactNode } from 'react'
import type { NotchState } from '../hooks/useNotchState'

interface NotchAnimationProps {
  state: NotchState
  children: ReactNode
}

const NOTIFICATION_DURATION = 3000

/**
 * DIP 32px
 * widget
 */
const NOTCH_HEIGHT = 32

export const NotchAnimation = ({ state, children }: NotchAnimationProps) => {
  const [notification, setNotification] = useState<{ agentName: string; message: string } | null>(null)
  const [showNotification, setShowNotification] = useState(false)

  useEffect(() => {
    const unsub = window.notchBridge?.onNotification((data) => {
      setNotification(data)
      setShowNotification(true)
    })
    return () => unsub?.()
  }, [])

  useEffect(() => {
    if (!showNotification) return
    const timer = setTimeout(() => {
      setShowNotification(false)
      setNotification(null)
    }, NOTIFICATION_DURATION)
    return () => clearTimeout(timer)
  }, [showNotification])

  const handleNotificationClick = () => {
    setShowNotification(false)
    setNotification(null)
    window.notchBridge?.notchAction('expand')
  }

  /**
   * compact forward widget  click
   * expanded  NotchManager  ignoreMouseEvents(false)
   */
  const handleMouseEnter = useCallback(() => {
    if (state === 'compact') {
      window.notchBridge?.setIgnoreMouseEvents(false)
    }
  }, [state])

  const handleMouseLeave = useCallback(() => {
    if (state === 'compact') {
      window.notchBridge?.setIgnoreMouseEvents(true, { forward: true })
    }
  }, [state])

  const isCompact = state === 'compact' && !showNotification
  const isExpanded = state === 'expanded'
  const isNotifying = state === 'compact' && showNotification

  return (
    <div className="flex flex-col items-center w-full" style={{ paddingTop: NOTCH_HEIGHT }}>
      <div
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`
          bg-black overflow-hidden cursor-pointer
          transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
          ${isCompact ? 'w-[200px] h-[10px] rounded-b-[10px]' : ''}
          ${isNotifying ? 'w-[280px] h-10 rounded-b-[14px]' : ''}
          ${isExpanded ? 'w-[340px] min-h-[120px] max-h-[350px] rounded-b-[20px]' : ''}
        `}
        style={{
          margin: '0 auto',
          willChange: 'width, height',
        }}
      >
        {isCompact && children}

        {isNotifying && notification && (
          <div
            className="flex items-center gap-2 h-10 px-4 cursor-pointer"
            onClick={handleNotificationClick}
          >
            <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0 animate-pulse" />
            <span className="text-white/80 text-xs font-medium truncate">
              {notification.agentName}
            </span>
            <span className="text-white/40 text-xs truncate flex-1">
              {notification.message}
            </span>
          </div>
        )}

        {isExpanded && children}
      </div>
    </div>
  )
}
