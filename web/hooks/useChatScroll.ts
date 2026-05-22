import { useEffect, useRef, useState, useCallback } from 'react'
import type { VirtuosoHandle } from 'react-virtuoso'
import type { Message } from '../types/chat'

/**
 * react-virtuoso
 *
 * - DOM  Virtuoso  hook  + newMessageCount badge
 * - Virtuoso  atBottomStateChange  DOM  hookonAtBottomChange
 * -  wasAtBottomRef
 *   - Virtuoso followOutput
 *   -  + badge+1
 *   -  + delta
 * -  user  wasAtBottomRef
 *
 *  ChatBody
 * - virtuosoRef <Virtuoso ref={...} />
 * - onAtBottomChange atBottomStateChange
 * - followOutput 'auto' | false
 */
export const useChatScroll = (messages: Message[]) => {
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const wasAtBottomRef = useRef(true)
  const prevMsgLenRef = useRef(0)
  const [newMessageCount, setNewMessageCount] = useState(0)

  const onAtBottomChange = useCallback((atBottom: boolean) => {
    wasAtBottomRef.current = atBottom
    if (atBottom) setNewMessageCount((c) => (c === 0 ? c : 0))
  }, [])

  const followOutput = useCallback(() => {
    return wasAtBottomRef.current ? ('auto' as const) : false
  }, [])

  useEffect(() => {
    const isNewMessage = messages.length > prevMsgLenRef.current
    prevMsgLenRef.current = messages.length

    const lastMsg = messages[messages.length - 1]
    const isUserSent = isNewMessage && lastMsg?.role === 'user'

    if (isUserSent) {
      wasAtBottomRef.current = true
      virtuosoRef.current?.scrollToIndex({ index: 'LAST', behavior: 'auto', align: 'end' })
      return
    }

    if (!wasAtBottomRef.current && isNewMessage) {
      setNewMessageCount((c) => c + 1)
    }
  }, [messages])

  const handleScrollToBottom = useCallback(() => {
    wasAtBottomRef.current = true
    setNewMessageCount(0)
    virtuosoRef.current?.scrollToIndex({ index: 'LAST', behavior: 'auto', align: 'end' })
  }, [])

  return {
    virtuosoRef,
    onAtBottomChange,
    followOutput,
    newMessageCount,
    handleScrollToBottom,
  }
}
