import { describe, it, expect } from 'vitest'
import { generateAgentId } from '../stores/AgentStore'

const AGENT_ID_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/
const HEX_8_REGEX = /^[a-f0-9]{8}$/

describe('generateAgentId', () => {
  it('generates 8-char hex ID', () => {
    const id = generateAgentId()
    expect(id).toMatch(HEX_8_REGEX)
  })

  it('matches avatar validation regex', () => {
    const id = generateAgentId()
    expect(id).toMatch(AGENT_ID_REGEX)
  })

  it('multiple calls generate different IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateAgentId()))
    expect(ids.size).toBe(100)
  })

  it('does not contain hyphens', () => {
    const id = generateAgentId()
    expect(id).not.toContain('-')
  })
})
