import { describe, it, expect } from 'vitest'

describe('AgentStore.rowToEntity provider mapping', () => {
  const makeRow = (provider: string | null) => ({
    id: 'test-1',
    name: 'Test Agent',
    description: 'desc',
    icon: '',
    system_prompt: JSON.stringify({ mode: 'append', content: '' }),
    allowed_tools: null,
    disallowed_tools: null,
    model: null,
    max_turns: null,
    skills: null,
    mcp_servers: null,
    hooks: null,
    sub_agent_names: null,
    personality: null,
    provider,
    tags: JSON.stringify([]),
    source: 'user',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  })

  it('preserves claude provider', () => {
    const row = makeRow('claude')
    expect(row.provider).toBe('claude')
  })

  it('preserves codex provider', () => {
    const row = makeRow('codex')
    expect(row.provider).toBe('codex')
  })

  it('preserves qoder provider (previously dropped by hardcoded cast)', () => {
    const row = makeRow('qoder')
    expect(row.provider).toBe('qoder')
  })

  it('handles null provider', () => {
    const row = makeRow(null)
    expect(row.provider).toBeNull()
  })
})
