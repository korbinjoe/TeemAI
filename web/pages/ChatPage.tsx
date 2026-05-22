/**
 * ChatPage — Chat
 *
 *  + location.state Tab  ChatTabContext
 *  ChatTabContainer  ChatInstance
 */

import { useEffect, useMemo } from 'react'
import { useParams, useLocation } from 'react-router-dom'
import { useChatTabs } from '../contexts/ChatTabContext'
import ChatTabContainer from '../components/chat/ChatTabContainer'

const ChatPage = () => {
  const { workspaceId, chatId } = useParams<{ workspaceId: string; chatId?: string }>()
  const location = useLocation()
  const { openTab } = useChatTabs()
  const locationState = location.state as { isNew?: boolean; agentId?: string; initialMessage?: string } | null
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const isNewChat = locationState?.isNew === true || searchParams.get('new') === '1'
  const initAgentId = locationState?.agentId || searchParams.get('agentId') || null
  const initialMessage = locationState?.initialMessage || searchParams.get('initialMessage') || null

  useEffect(() => {
    if (workspaceId && chatId) {
      openTab(chatId, workspaceId)
    }
  }, [chatId, workspaceId, openTab])

  return (
    <ChatTabContainer
      initialChatId={chatId}
      isNewChat={isNewChat}
      initAgentId={initAgentId}
      initialMessage={initialMessage}
    />
  )
}

export default ChatPage
