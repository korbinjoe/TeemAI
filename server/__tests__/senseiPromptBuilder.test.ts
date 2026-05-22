import { describe, it, expect } from 'vitest'
import { buildFullSuitePrompt } from '../lib/senseiPromptBuilder'

describe('buildFullSuitePrompt', () => {
  it('produces legacy AGENTS-only prompt by default', () => {
    const out = buildFullSuitePrompt('A data analysis agent', 'agents-only')
    expect(out).toContain('Based on the following description, generate a high-quality AGENTS.md system prompt file for the digital worker.')
    expect(out).toContain('A data analysis agent')
    expect(out).not.toContain('MODE: FULL_SUITE')
  })

  it('emits FULL_SUITE marker when mode=full-suite', () => {
    const out = buildFullSuitePrompt('Rigorous data analyst', 'full-suite')
    expect(out.startsWith('MODE: FULL_SUITE')).toBe(true)
    expect(out).toContain('===IDENTITY===')
    expect(out).toContain('===AGENTS===')
    expect(out).toContain('===SOUL===')
    expect(out).toContain('Rigorous data analyst')
  })

  it('trims user description', () => {
    const out = buildFullSuitePrompt('  hello  \n', 'full-suite')
    expect(out).toContain('hello')
    expect(out).not.toContain('  hello  ')
  })

  it('throws on empty description', () => {
    expect(() => buildFullSuitePrompt('', 'full-suite')).toThrow()
    expect(() => buildFullSuitePrompt('   \n  ', 'agents-only')).toThrow()
  })
})
