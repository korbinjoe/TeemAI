import { describe, it, expect } from 'vitest'
import { slugify } from '../stores/AgentStore'

const AGENT_ID_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/

describe('AgentStore.slugify — must always produce ASCII id', () => {
  it('English name → kebab-case', () => {
    expect(slugify('Forge Agent')).toBe('forge-agent')
  })

  it('mixed case + multiple spaces → single hyphens', () => {
    expect(slugify('  Hello   World  ')).toBe('hello-world')
  })

  it('pure CJK name → 8-char uuid prefix, no CJK chars retained', () => {
    const out = slugify('数字工人')
    expect(out).not.toMatch(/[一-鿿]/)
    expect(out).toMatch(AGENT_ID_REGEX)
    expect(out.length).toBe(8)
  })

  it('mixed CJK-English name → only English segments retained', () => {
    const out = slugify('数字工人Forge')
    expect(out).toBe('forge')
    expect(out).toMatch(AGENT_ID_REGEX)
  })

  it('Special chars are collapsed to single hyphens', () => {
    expect(slugify('My@Agent#Name!')).toBe('my-agent-name')
  })

  it('all symbols/CJK → fallback to uuid segment, matches ASCII validation', () => {
    const out = slugify('！？——')
    expect(out).toMatch(AGENT_ID_REGEX)
  })
})
