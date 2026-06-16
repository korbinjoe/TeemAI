// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const workspaceState = vi.hoisted(() => ({
  workspaceId: 'workspace-1',
  activeChatId: 'mission-a',
}))

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ state: null }),
}))

vi.mock('../../contexts/WorkspaceContext', () => ({
  useWorkspace: () => workspaceState,
}))

vi.mock('@/config/api', () => ({
  API_BASE: '',
  authFetch: vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ name: 'Workspace', repositories: [] }),
  })),
}))

vi.mock('../../components/chat/ChatInstance', () => ({
  default: ({ chatId, isActive }: { chatId: string; isActive: boolean }) => (
    <section data-testid={`chat-${chatId}`} data-active={isActive ? 'true' : 'false'} />
  ),
}))

vi.mock('../../components/workspace/WorkspaceHome', () => ({
  default: () => <div data-testid="workspace-home" />,
}))

import ChatPane from '../../components/workspace/ChatPane'

describe('ChatPane mission cache visibility', () => {
  afterEach(() => {
    workspaceState.workspaceId = 'workspace-1'
    workspaceState.activeChatId = 'mission-a'
    cleanup()
    vi.clearAllMocks()
  })

  it('keeps cached missions mounted but removes inactive panes from paint', () => {
    const { rerender, getByTestId } = render(<ChatPane />)
    const first = getByTestId('chat-mission-a')
    expect(first.dataset.active).toBe('true')
    expect(first.parentElement?.style.display).toBe('flex')

    workspaceState.activeChatId = 'mission-b'
    rerender(<ChatPane />)

    const inactive = getByTestId('chat-mission-a')
    const active = getByTestId('chat-mission-b')
    expect(inactive.dataset.active).toBe('false')
    expect(inactive.parentElement?.style.display).toBe('none')
    expect(inactive.parentElement?.getAttribute('aria-hidden')).toBe('true')
    expect(active.dataset.active).toBe('true')
    expect(active.parentElement?.style.display).toBe('flex')
  })
})
