// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import TimelineView from '@/components/chat/indicators/TimelineView'
import type { Message } from '@/types/chat'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const textMessage = (content: string): Message => ({
  id: 'msg-1',
  role: 'agent',
  type: 'text',
  content,
  timestamp: 1,
})

describe('TimelineView file links', () => {
  it('opens Markdown local file links in the IDE instead of the browser', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const openedFiles: Array<{ filePath: string; line?: number }> = []
    const handleOpenFile = (event: Event) => {
      openedFiles.push((event as CustomEvent<{ filePath: string; line?: number }>).detail)
    }
    window.addEventListener('ide:open-file', handleOpenFile)

    try {
      render(
        <TimelineView
          messages={[
            textMessage('[AgentTurnCard](web/components/chat/messages/AgentTurnCard.tsx:42)'),
          ]}
        />,
      )

      fireEvent.click(screen.getByRole('link', { name: 'AgentTurnCard' }))

      expect(openSpy).not.toHaveBeenCalled()
      expect(openedFiles).toEqual([
        { filePath: 'web/components/chat/messages/AgentTurnCard.tsx', line: 42 },
      ])
    } finally {
      window.removeEventListener('ide:open-file', handleOpenFile)
    }
  })

  it('opens file URL Markdown links in the IDE', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const openedFiles: Array<{ filePath: string; line?: number }> = []
    const handleOpenFile = (event: Event) => {
      openedFiles.push((event as CustomEvent<{ filePath: string; line?: number }>).detail)
    }
    window.addEventListener('ide:open-file', handleOpenFile)

    try {
      render(
        <TimelineView
          messages={[
            textMessage('[Settings](file:///Users/me/project/Sources/SettingsWindow.swift:88)'),
          ]}
        />,
      )

      fireEvent.click(screen.getByRole('link', { name: 'Settings' }))

      expect(openSpy).not.toHaveBeenCalled()
      expect(openedFiles).toEqual([
        { filePath: '/Users/me/project/Sources/SettingsWindow.swift', line: 88 },
      ])
    } finally {
      window.removeEventListener('ide:open-file', handleOpenFile)
    }
  })

  it('keeps external Markdown links opening in the browser', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)

    render(
      <TimelineView
        messages={[
          textMessage('[Docs](https://example.com/docs)'),
        ]}
      />,
    )

    fireEvent.click(screen.getByRole('link', { name: 'Docs' }))

    expect(openSpy).toHaveBeenCalledWith('https://example.com/docs', '_blank')
  })
})
