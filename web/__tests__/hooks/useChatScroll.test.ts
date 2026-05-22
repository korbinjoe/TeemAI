// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { VirtuosoHandle } from 'react-virtuoso'
import { useChatScroll } from '../../hooks/useChatScroll'
import type { Message } from '../../types/chat'

const msg = (id: string, role: 'user' | 'agent' = 'user'): Message =>
  ({ id, role, type: 'text', content: '', timestamp: Date.now() } as Message)

const mountVirtuoso = (result: { current: ReturnType<typeof useChatScroll> }) => {
  const handle = { scrollToIndex: vi.fn() } as unknown as VirtuosoHandle
  ;(result.current.virtuosoRef as { current: VirtuosoHandle | null }).current = handle
  return handle
}

describe('useChatScroll', () => {
  it('initial newMessageCount is 0', () => {
    const { result } = renderHook(() => useChatScroll([]))
    expect(result.current.newMessageCount).toBe(0)
  })

  it('handleScrollToBottom resets badge and calls virtuoso.scrollToIndex', () => {
    const { result, rerender } = renderHook(
      ({ msgs }) => useChatScroll(msgs),
      { initialProps: { msgs: [msg('user-1', 'user')] } },
    )
    const handle = mountVirtuoso(result)

    act(() => result.current.onAtBottomChange(false))
    rerender({ msgs: [msg('user-1', 'user'), msg('agent-2', 'agent')] })
    expect(result.current.newMessageCount).toBe(1)

    act(() => result.current.handleScrollToBottom())
    expect(result.current.newMessageCount).toBe(0)
    expect(handle.scrollToIndex).toHaveBeenCalledWith({ index: 'LAST', behavior: 'auto', align: 'end' })
  })

  it('at bottom + new message → followOutput returns auto, badge not incremented', () => {
    const { result, rerender } = renderHook(
      ({ msgs }) => useChatScroll(msgs),
      { initialProps: { msgs: [msg('1', 'user')] } },
    )
    mountVirtuoso(result)
    // Default wasAtBottomRef=true
    expect(result.current.followOutput()).toBe('auto')

    rerender({ msgs: [msg('1', 'user'), msg('2', 'agent')] })
    expect(result.current.newMessageCount).toBe(0)
  })

  it('away from bottom + agent pushes new message → badge+1, followOutput returns false', () => {
    const { result, rerender } = renderHook(
      ({ msgs }) => useChatScroll(msgs),
      { initialProps: { msgs: [msg('1', 'user')] } },
    )
    mountVirtuoso(result)
    act(() => result.current.onAtBottomChange(false))
    expect(result.current.followOutput()).toBe(false)

    rerender({ msgs: [msg('1', 'user'), msg('2', 'agent')] })
    expect(result.current.newMessageCount).toBe(1)
  })

  it('user away from bottom → scrolls back to bottom → next new message no longer increments badge', () => {
    const { result, rerender } = renderHook(
      ({ msgs }) => useChatScroll(msgs),
      { initialProps: { msgs: [msg('1', 'user')] } },
    )
    mountVirtuoso(result)
    act(() => result.current.onAtBottomChange(false))
    rerender({ msgs: [msg('1', 'user'), msg('2', 'agent')] })
    expect(result.current.newMessageCount).toBe(1)

    act(() => result.current.onAtBottomChange(true))
    expect(result.current.newMessageCount).toBe(0)

    rerender({ msgs: [msg('1', 'user'), msg('2', 'agent'), msg('3', 'agent')] })
    expect(result.current.newMessageCount).toBe(0)
  })

  it('away from bottom + actively sending user message → forced to bottom, badge not incremented', () => {
    const { result, rerender } = renderHook(
      ({ msgs }) => useChatScroll(msgs),
      { initialProps: { msgs: [msg('agent-1', 'agent')] } },
    )
    const handle = mountVirtuoso(result)
    act(() => result.current.onAtBottomChange(false))

    rerender({ msgs: [msg('agent-1', 'agent'), msg('user-2', 'user')] })

    expect(handle.scrollToIndex).toHaveBeenCalledWith({ index: 'LAST', behavior: 'auto', align: 'end' })
    expect(result.current.newMessageCount).toBe(0)
    expect(result.current.followOutput()).toBe('auto')
  })

  it('away from bottom + delta (length unchanged) → badge unchanged, scrollToIndex not called', () => {
    const first = msg('1', 'agent')
    const { result, rerender } = renderHook(
      ({ msgs }) => useChatScroll(msgs),
      { initialProps: { msgs: [first] } },
    )
    const handle = mountVirtuoso(result)
    act(() => result.current.onAtBottomChange(false))

    rerender({ msgs: [{ ...first, content: 'updated' }] })

    expect(result.current.newMessageCount).toBe(0)
    expect(handle.scrollToIndex).not.toHaveBeenCalled()
  })
})
