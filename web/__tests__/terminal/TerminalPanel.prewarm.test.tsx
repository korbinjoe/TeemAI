// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const wsMock = vi.hoisted(() => {
  const handlers = new Map<string, Set<(payload: any) => void>>()
  return {
    handlers,
    send: vi.fn(),
    isConnected: vi.fn(() => true),
    on: vi.fn((type: string, handler: (payload: any) => void) => {
      const set = handlers.get(type) ?? new Set()
      set.add(handler)
      handlers.set(type, set)
    }),
    off: vi.fn((type: string, handler: (payload: any) => void) => {
      handlers.get(type)?.delete(handler)
    }),
  }
})

const terminalMock = vi.hoisted(() => ({
  tryOpen: vi.fn(() => Promise.resolve()),
  reactivate: vi.fn(),
  leadInstance: {
    isDisposed: false,
    isOpened: false,
    isOpening: false,
    reactivate: vi.fn(),
  },
}))

vi.mock('../../services/WebSocketClient', () => ({
  getWebSocketClient: () => wsMock,
}))

vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'dark' }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../../components/terminal/useTerminalInstances', async () => {
  const React = await vi.importActual<typeof import('react')>('react')
  return {
    useTerminalInstances: () => {
      const terminalsRef = React.useRef(new Map([['lead', terminalMock.leadInstance as any]]))
      const pendingPrepareRef = React.useRef(new Map())
      return {
        terminalsRef,
        pendingPrepareRef,
        getOrCreateInstance: vi.fn((agentId: string) => {
          if (!terminalsRef.current.has(agentId)) {
            terminalsRef.current.set(agentId, terminalMock.leadInstance as any)
          }
          return terminalsRef.current.get(agentId)
        }),
        tryOpen: terminalMock.tryOpen,
        disposeTerminal: vi.fn(),
        getContainerRefCallback: vi.fn(() => vi.fn()),
      }
    },
  }
})

import TerminalPanel from '../../components/terminal/TerminalPanel'

const emitWs = (type: string, payload: any) => {
  for (const handler of wsMock.handlers.get(type) ?? []) {
    handler(payload)
  }
}

describe('TerminalPanel prewarm visibility', () => {
  beforeEach(() => {
    wsMock.handlers.clear()
    wsMock.send.mockClear()
    wsMock.isConnected.mockReturnValue(true)
    terminalMock.tryOpen.mockClear()
    terminalMock.reactivate.mockClear()
    terminalMock.leadInstance.isDisposed = false
    terminalMock.leadInstance.isOpened = false
    terminalMock.leadInstance.isOpening = false
    terminalMock.leadInstance.reactivate.mockClear()
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('opens buffered prewarmed terminal when the panel becomes visible', () => {
    const { rerender } = render(
      <TerminalPanel chatId="chat-1" connected inTerminalView prewarmOnly />,
    )

    act(() => {
      emitWs('agent:list', {
        chatId: 'chat-1',
        agents: [
          {
            agentId: 'lead',
            sessionId: 'cli-1',
            agentName: 'Lead',
            agentIcon: '',
            status: 'running',
          },
        ],
      })
    })

    expect(terminalMock.tryOpen).not.toHaveBeenCalled()

    rerender(
      <TerminalPanel chatId="chat-1" connected inTerminalView prewarmOnly={false} />,
    )

    expect(terminalMock.tryOpen).toHaveBeenCalledWith('lead')
  })
})
