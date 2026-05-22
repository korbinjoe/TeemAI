// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'

vi.mock('@/services/WebSocketClient', () => ({
  getWebSocketClient: () => ({
    send: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  }),
}))

vi.mock('lucide-react', () => ({
  ShieldCheck: () => React.createElement('span', null, 'shield'),
  X: () => React.createElement('span', null, 'x'),
}))

import PermissionModal from '../../components/chat/modals/PermissionModal'
import type { PermissionRequest } from '../../components/chat/modals/PermissionModal'

const req: PermissionRequest = {
  agentId: 'a1',
  chatId: 'c1',
  sessionId: 's1',
  requestId: 'r1',
  toolCall: { toolCallId: 'tc1', title: 'Write to file.ts' },
  options: [
    { optionId: 'opt1', name: 'Allow Once', kind: 'allow_once' },
    { optionId: 'opt2', name: 'Allow Always', kind: 'allow_always' },
    { optionId: 'opt3', name: 'Reject', kind: 'reject_once' },
  ],
}

describe('PermissionModal', () => {
  const onResolved = vi.fn()

  afterEach(() => {
    cleanup()
    onResolved.mockReset()
  })

  it('does not render when request is null', () => {
    const { container } = render(<PermissionModal request={null} onResolved={onResolved} />)
    expect(container.innerHTML).toBe('')
  })

  it('shows toolCall title', () => {
    render(<PermissionModal request={req} onResolved={onResolved} />)
    expect(screen.getByText('Write to file.ts')).toBeTruthy()
  })

  it('renders all option buttons', () => {
    render(<PermissionModal request={req} onResolved={onResolved} />)
    expect(screen.getByRole('button', { name: 'Allow Once' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Allow Always' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeTruthy()
  })

  it('clicking option calls onResolved', () => {
    render(<PermissionModal request={req} onResolved={onResolved} />)
    fireEvent.click(screen.getByRole('button', { name: 'Allow Once' }))
    expect(onResolved).toHaveBeenCalledWith('r1')
  })

  it('Escape key triggers cancelled', () => {
    render(<PermissionModal request={req} onResolved={onResolved} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onResolved).toHaveBeenCalledWith('r1')
  })
})
