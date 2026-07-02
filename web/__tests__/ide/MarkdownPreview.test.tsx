// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import MarkdownPreview from '@/components/ide/MarkdownPreview'

vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'dark' }) }))

afterEach(cleanup)

describe('MarkdownPreview search highlight', () => {
  it('wraps keyword matches in <mark> within rendered text', () => {
    const { container } = render(
      <MarkdownPreview content="Hello World, hello again" fontSizePx={14} highlightKeyword="hello" />,
    )
    const marks = container.querySelectorAll('mark.search-highlight-match')
    expect(marks.length).toBe(2)
    expect(Array.from(marks).map(m => m.textContent)).toEqual(['Hello', 'hello'])
  })

  it('does not highlight inside code spans/blocks', () => {
    const { container } = render(
      <MarkdownPreview content={'text foo\n\n`foo` and\n\n```\nfoo\n```'} fontSizePx={14} highlightKeyword="foo" />,
    )
    const marks = container.querySelectorAll('mark.search-highlight-match')
    expect(marks.length).toBe(1)
    expect(marks[0].textContent).toBe('foo')
  })

  it('marks the first match as the active match', () => {
    const { container } = render(
      <MarkdownPreview content="Hello World, hello again" fontSizePx={14} highlightKeyword="hello" />,
    )
    const active = container.querySelectorAll('mark.search-highlight-active')
    expect(active.length).toBe(1)
    expect(active[0].textContent).toBe('Hello')
  })

  it('renders no marks when keyword is absent', () => {
    const { container } = render(
      <MarkdownPreview content="nothing to see" fontSizePx={14} />,
    )
    expect(container.querySelectorAll('mark.search-highlight-match').length).toBe(0)
  })

  it('routes mermaid fenced blocks to the diagram renderer without a <pre> wrapper', () => {
    const { container } = render(
      <MarkdownPreview content={'```mermaid\ngraph TD; A-->B\n```'} fontSizePx={14} />,
    )
    // MermaidBlock shows a loading placeholder before async render resolves.
    expect(container.querySelector('.mermaid-loading')).not.toBeNull()
    expect(container.querySelector('pre')).toBeNull()
  })

  it('keeps non-mermaid code blocks as plain <pre><code>', () => {
    const { container } = render(
      <MarkdownPreview content={'```ts\nconst a = 1\n```'} fontSizePx={14} />,
    )
    expect(container.querySelector('pre code')).not.toBeNull()
    expect(container.querySelector('.mermaid-loading')).toBeNull()
  })
})
