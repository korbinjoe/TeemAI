// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const workspaceState = vi.hoisted(() => ({
  workspaceId: 'workspace-1',
  activeChatId: 'mission-a',
}))

const routerState = vi.hoisted(() => ({
  locationState: null as { isNew?: boolean; agentId?: string } | null,
}))

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ state: routerState.locationState }),
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
  default: ({ chatId, isActive, isNewChat, resumeWarm }: { chatId: string; isActive: boolean; isNewChat?: boolean; resumeWarm?: boolean }) => (
    <section
      data-testid={`chat-${chatId}`}
      data-active={isActive ? 'true' : 'false'}
      data-new={isNewChat ? 'true' : 'false'}
      data-resume-warm={resumeWarm ? 'true' : 'false'}
    />
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
    routerState.locationState = null
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

  it('clears a cached new-mission marker when reopened through normal navigation', () => {
    routerState.locationState = { isNew: true, agentId: 'agent-a' }
    const { rerender, getByTestId } = render(<ChatPane />)

    expect(getByTestId('chat-mission-a').dataset.new).toBe('true')

    routerState.locationState = null
    workspaceState.activeChatId = 'mission-b'
    rerender(<ChatPane />)

    workspaceState.activeChatId = 'mission-a'
    rerender(<ChatPane />)

    const reopened = getByTestId('chat-mission-a')
    expect(reopened.dataset.active).toBe('true')
    expect(reopened.dataset.new).toBe('false')
    expect(reopened.dataset.resumeWarm).toBe('true')
  })

  it('bounds fully mounted mission panes to active plus three recent missions', () => {
    const { rerender, queryByTestId, getByTestId } = render(<ChatPane />)

    for (const chatId of ['mission-b', 'mission-c', 'mission-d', 'mission-e']) {
      workspaceState.activeChatId = chatId
      rerender(<ChatPane />)
    }

    expect(queryByTestId('chat-mission-a')).toBeNull()
    for (const chatId of ['mission-b', 'mission-c', 'mission-d', 'mission-e']) {
      expect(getByTestId(`chat-${chatId}`)).toBeTruthy()
    }
    expect(getByTestId('chat-mission-e').dataset.active).toBe('true')
  })
})
