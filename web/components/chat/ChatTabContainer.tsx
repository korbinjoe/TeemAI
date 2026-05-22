/**
 * ChatTabContainer —  ChatInstance
 *
 *  ChatInstance  display:none
 *  ChatTabBar
 */

import { useState, useEffect, useCallback } from 'react'
import { useChatTabs } from '../../contexts/ChatTabContext'
import ChatTabBar from '../nav/ChatTabBar'
import ChatInstance from './ChatInstance'
import EmptyTabPage from './EmptyTabPage'
import DevPanel from '../dev/DevPanel'

interface ChatTabContainerProps {
  initialChatId?: string
  isNewChat?: boolean
  initAgentId?: string | null
  initialMessage?: string | null
}

const CONTAINER_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
}

const ChatTabContainer = ({ initialChatId, isNewChat, initAgentId, initialMessage }: ChatTabContainerProps) => {
  const { tabs, activeTabId, activateTab, closeTab } = useChatTabs()

  const [mountedTabs, setMountedTabs] = useState<Set<string>>(
    () => new Set(activeTabId ? [activeTabId] : []),
  )

  useEffect(() => {
    if (activeTabId && !mountedTabs.has(activeTabId)) {
      setMountedTabs((prev) => new Set([...prev, activeTabId]))
    }
  }, [activeTabId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return

      const num = parseInt(e.key)
      if (num >= 1 && num <= 9 && tabs.length >= 2) {
        e.preventDefault()
        const idx = num - 1
        const tab = tabs[idx]
        if (tab) activateTab(tab.chatId)
        return
      }

      if (e.key.toLowerCase() === 'w' && activeTabId && tabs.length >= 1) {
        e.preventDefault()
        closeTab(activeTabId)
        return
      }

      if (e.shiftKey && tabs.length >= 2 && activeTabId) {
        const currentIdx = tabs.findIndex((t) => t.chatId === activeTabId)
        if (currentIdx === -1) return
        if (e.key === '[') {
          e.preventDefault()
          const prevIdx = (currentIdx - 1 + tabs.length) % tabs.length
          activateTab(tabs[prevIdx].chatId)
        } else if (e.key === ']') {
          e.preventDefault()
          const nextIdx = (currentIdx + 1) % tabs.length
          activateTab(tabs[nextIdx].chatId)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [tabs, activeTabId, activateTab, closeTab])

  const [devPanelOpen, setDevPanelOpen] = useState(false)

  useEffect(() => {
    const handleToggle = () => setDevPanelOpen((v) => !v)
    window.addEventListener('devpanel:toggle', handleToggle)
    return () => window.removeEventListener('devpanel:toggle', handleToggle)
  }, [])

  const handleCloseDevPanel = useCallback(() => setDevPanelOpen(false), [])

  const activeTab = tabs.find((t) => t.chatId === activeTabId)

  useEffect(() => {
    const tabIds = new Set(tabs.map((t) => t.chatId))
    setMountedTabs((prev) => {
      const next = new Set([...prev].filter((id) => tabIds.has(id)))
      return next.size !== prev.size ? next : prev
    })
  }, [tabs])

  return (
    <div style={CONTAINER_STYLE}>
      <ChatTabBar />
      <div style={{ flex: 1, position: 'relative', minHeight: 0, overflow: 'hidden' }}>
        {tabs.length === 0 ? (
          <EmptyTabPage />
        ) : (
          tabs.map((tab) => {
            const isActive = tab.chatId === activeTabId
            const isMounted = mountedTabs.has(tab.chatId)
            const isInitial = tab.chatId === initialChatId
            return (
              <div
                key={tab.chatId}
                style={{
                  display: isActive ? 'flex' : 'none',
                  flexDirection: 'column',
                  height: '100%',
                  overflow: 'hidden',
                }}
              >
                {isMounted && (
                  <ChatInstance
                    chatId={tab.chatId}
                    workspaceId={tab.workspaceId}
                    isActive={isActive}
                    isNewChat={isInitial ? isNewChat : false}
                    initAgentId={isInitial ? initAgentId : null}
                    initialMessage={isInitial ? initialMessage : null}
                  />
                )}
              </div>
            )
          })
        )}
      </div>

      {activeTabId && devPanelOpen && (
        <DevPanel
          chatId={activeTabId}
          chatTitle={activeTab?.title}
          isOpen={devPanelOpen}
          onClose={handleCloseDevPanel}
        />
      )}
    </div>
  )
}

export default ChatTabContainer
