import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { getWebSocketClient } from '../services/WebSocketClient'
import { authFetch } from '@/config/api'
import type { Notification } from '../types/cron'

interface NotificationContextValue {
  notifications: Notification[]
  unreadCount: number
  loading: boolean
  lastNewNotification: Notification | null
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
  removeNotification: (id: string) => Promise<void>
  refresh: () => Promise<void>
}

const NotificationContext = createContext<NotificationContextValue | null>(null)

const API_BASE = '/api/notifications'

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [lastNewNotification, setLastNewNotification] = useState<Notification | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await authFetch(API_BASE)
      if (res.ok) {
        const data: Notification[] = await res.json()
        data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        setNotifications(data)
        setUnreadCount(data.filter((n) => !n.read).length)
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  const markRead = useCallback(async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    )
    setUnreadCount((c) => Math.max(0, c - 1))
    try {
      const res = await authFetch(`${API_BASE}/${id}/read`, { method: 'POST' })
      if (!res.ok) throw new Error()
    } catch {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: false } : n)),
      )
      setUnreadCount((c) => c + 1)
    }
  }, [])

  const markAllRead = useCallback(async () => {
    const prevNotifications = notifications
    const prevCount = unreadCount
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    setUnreadCount(0)
    try {
      const res = await authFetch(`${API_BASE}/read-all`, { method: 'POST' })
      if (!res.ok) throw new Error()
    } catch {
      setNotifications(prevNotifications)
      setUnreadCount(prevCount)
    }
  }, [notifications, unreadCount])

  const removeNotification = useCallback(async (id: string) => {
    let removedItem: Notification | undefined
    setNotifications((prev) => {
      removedItem = prev.find((n) => n.id === id)
      if (removedItem && !removedItem.read) setUnreadCount((c) => Math.max(0, c - 1))
      return prev.filter((n) => n.id !== id)
    })
    try {
      const res = await authFetch(`${API_BASE}/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
    } catch {
      if (removedItem) {
        const item = removedItem
        setNotifications((prev) => {
          const restored = [...prev, item]
          restored.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          return restored
        })
        if (!item.read) setUnreadCount((c) => c + 1)
      }
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    const ws = getWebSocketClient()

    const handleInit = (data: { unreadCount: number }) => {
      setUnreadCount(data.unreadCount)
    }

    const handleNew = (notification: Notification) => {
      setNotifications((prev) => [notification, ...prev])
      setUnreadCount((c) => c + 1)
      setLastNewNotification(notification)
    }

    const handleRead = (data: { id: string }) => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === data.id ? { ...n, read: true } : n)),
      )
      setUnreadCount((c) => Math.max(0, c - 1))
    }

    const handleReadAll = () => {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
      setUnreadCount(0)
    }

    ws.on('notification:init', handleInit)
    ws.on('notification:new', handleNew)
    ws.on('notification:read', handleRead)
    ws.on('notification:read-all', handleReadAll)

    return () => {
      ws.off('notification:init', handleInit)
      ws.off('notification:new', handleNew)
      ws.off('notification:read', handleRead)
      ws.off('notification:read-all', handleReadAll)
    }
  }, [])

  return (
    <NotificationContext.Provider value={{
      notifications, unreadCount, loading, lastNewNotification,
      markRead, markAllRead, removeNotification, refresh,
    }}>
      {children}
    </NotificationContext.Provider>
  )
}

export const useNotification = (): NotificationContextValue => {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotification must be used within NotificationProvider')
  return ctx
}
