import { describe, it, expect } from 'vitest'
import { parseFullSuiteResponse, createStreamSplitter } from '../lib/senseiResponseParser'

describe('parseFullSuiteResponse', () => {
  it('parses three sections with canonical separators', () => {
    const raw = [
      '===IDENTITY===',
      'name: Data analyst',
      'nickname: Quartz',
      'emoji: 🦉',
      '',
      '===AGENTS===',
      'You areData analyst...',
      '## Core Capabilities',
      '- SQL',
      '',
      '===SOUL===',
      '## Personality',
      'Rigorous',
    ].join('\n')

    const out = parseFullSuiteResponse(raw)
    expect(out.identity).toContain('name: Data analyst')
    expect(out.identity).toContain('nickname: Quartz')
    expect(out.agents).toContain('You areData analyst')
    expect(out.agents).toContain('## Core Capabilities')
    expect(out.soul).toContain('Rigorous')
    expect(out.partialError).toEqual([])
  })

  it('tolerates extra spaces and lowercase separators', () => {
    const raw = [
      '   ===  identity  ===   ',
      'name: A',
      '===Agents===',
      'agents body',
      '====soul====',
      '## Personality',
      'Steady',
    ].join('\n')

    const out = parseFullSuiteResponse(raw)
    expect(out.identity).toContain('name: A')
    expect(out.agents).toContain('agents body')
    expect(out.soul).toContain('Steady')
    expect(out.partialError).toEqual([])
  })

  it('marks missing soul section in partialError', () => {
    const raw = [
      '===IDENTITY===',
      'name: A',
      '===AGENTS===',
      'agents body',
    ].join('\n')

    const out = parseFullSuiteResponse(raw)
    expect(out.identity).toContain('name: A')
    expect(out.agents).toContain('agents body')
    expect(out.soul).toBeNull()
    expect(out.partialError).toEqual(['soul'])
  })

  it('falls back to JSON when separators absent', () => {
    const raw = [
      'Here is the result:',
      '{',
      '  "identity": "name: A\\nnickname: B",',
      '  "agents": "You are A...",',
      '  "soul": "## Personality\\nRigorous"',
      '}',
    ].join('\n')

    const out = parseFullSuiteResponse(raw)
    expect(out.identity).toBe('name: A\nnickname: B')
    expect(out.agents).toBe('You are A...')
    expect(out.soul).toContain('Rigorous')
    expect(out.partialError).toEqual([])
  })

  it('returns all-null with full partialError on empty input', () => {
    const out = parseFullSuiteResponse('')
    expect(out).toEqual({
      identity: null,
      agents: null,
      soul: null,
      partialError: ['identity', 'agents', 'soul'],
    })
  })

  it('returns all-null with full partialError on whitespace-only input', () => {
    const out = parseFullSuiteResponse('   \n\n  \n')
    expect(out.partialError).toEqual(['identity', 'agents', 'soul'])
    expect(out.identity).toBeNull()
  })

  it('strips wrapping code fences inside a section', () => {
    const raw = [
      '===IDENTITY===',
      '```yaml',
      'name: A',
      '```',
      '===AGENTS===',
      '```markdown',
      'agents body',
      '```',
      '===SOUL===',
      '## Personality',
      'Steady',
    ].join('\n')

    const out = parseFullSuiteResponse(raw)
    expect(out.identity).toBe('name: A')
    expect(out.agents).toBe('agents body')
  })

  it('handles JSON when only some sections are present', () => {
    const raw = '{"identity": "name: A", "agents": "You are A"}'
    const out = parseFullSuiteResponse(raw)
    expect(out.identity).toBe('name: A')
    expect(out.agents).toBe('You are A')
    expect(out.soul).toBeNull()
    expect(out.partialError).toEqual(['soul'])
  })

  it('returns all-null when both separators and JSON parsing fail', () => {
    const out = parseFullSuiteResponse('totally unstructured text without any markers')
    expect(out.identity).toBeNull()
    expect(out.agents).toBeNull()
    expect(out.soul).toBeNull()
    expect(out.partialError.length).toBe(3)
  })
})

describe('createStreamSplitter', () => {
  it('emits per-section incremental deltas in order', () => {
    const events: Array<{ section: string; text: string }> = []
    const sp = createStreamSplitter()

    sp.feed('===IDENTITY===\nname: A', (section, text) =>
      events.push({ section, text }),
    )
    sp.feed('\nnickname: B\n===AGENTS===\nagents start', (section, text) =>
      events.push({ section, text }),
    )
    sp.feed(' more agents\n===SOUL===\n## Personality\n', (section, text) =>
      events.push({ section, text }),
    )
    sp.feed('Steady', (section, text) => events.push({ section, text }))

    const sections = events.reduce<Record<string, string>>((acc, e) => {
      acc[e.section] = (acc[e.section] ?? '') + e.text
      return acc
    }, {})

    expect(sections.identity).toContain('name: A')
    expect(sections.identity).toContain('nickname: B')
    expect(sections.agents).toContain('agents start')
    expect(sections.agents).toContain('more agents')
    expect(sections.soul).toContain('## Personality')
    expect(sections.soul).toContain('Steady')
  })

  it('does not re-emit previously emitted content', () => {
    const events: Array<{ section: string; text: string }> = []
    const sp = createStreamSplitter()
    sp.feed('===IDENTITY===\nfoo', (s, t) => events.push({ section: s, text: t }))
    sp.feed('bar', (s, t) => events.push({ section: s, text: t }))
    const concat = events.filter((e) => e.section === 'identity').map((e) => e.text).join('')
    expect(concat).toBe('foobar')
  })
})
