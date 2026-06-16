import { describe, it, expect } from 'vitest'
import { canonicalAgentId } from '../utils'

const registry = (...ids: string[]) => ({
  get: (id: string) => ids.includes(id) ? { id } : undefined,
})

const agentRegistryLike = (...ids: string[]) => ({
  get: (id: string) => ids.includes(id.replace(/:\d+$/, '')) ? { id } : undefined,
  list: () => ids.map((id) => ({ id })),
})

describe('canonicalAgentId', () => {
  it('strips auto suffix', () => {
    expect(canonicalAgentId('lead:auto')).toBe('lead')
  })

  it('strips numeric instance suffix', () => {
    expect(canonicalAgentId('code-reviewer:3')).toBe('code-reviewer')
  })

  it('returns canonical id when registry recognizes the stripped id', () => {
    expect(canonicalAgentId('fullstack-engineer:2', registry('fullstack-engineer'))).toBe('fullstack-engineer')
  })

  it('preserves registered ids that contain a colon', () => {
    expect(canonicalAgentId('team:lead', registry('team:lead'))).toBe('team:lead')
  })

  it('rejects unknown ids when registry is provided', () => {
    expect(canonicalAgentId('unknown-agent:2', registry('lead'))).toBeNull()
  })

  it('uses registry.list for exact matching when registry.get accepts instance ids', () => {
    expect(canonicalAgentId('lead:2', agentRegistryLike('lead'))).toBe('lead')
  })
})
