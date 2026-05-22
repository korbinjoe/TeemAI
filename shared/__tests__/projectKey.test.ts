import { describe, it, expect } from 'vitest'
import { cwdToClaudeProjectKey } from '../projectKey'

describe('cwdToClaudeProjectKey', () => {
  it('replaces slashes with dashes for normal absolute path', () => {
    expect(cwdToClaudeProjectKey('/Users/a/b/c')).toBe('-Users-a-b-c')
  })

  it('replaces dots in path segment (real Claude Code rule)', () => {
    expect(cwdToClaudeProjectKey('/path/my.app')).toBe('-path-my-app')
  })

  it('replaces multiple dots in single segment', () => {
    expect(cwdToClaudeProjectKey('/p/x.y.z/repo')).toBe('-p-x-y-z-repo')
  })

  it('handles leading slash only', () => {
    expect(cwdToClaudeProjectKey('/')).toBe('-')
  })

  it('handles empty string', () => {
    expect(cwdToClaudeProjectKey('')).toBe('')
  })

  it('handles single char', () => {
    expect(cwdToClaudeProjectKey('a')).toBe('a')
  })

  it('preserves non-ASCII characters (current behavior frozen)', () => {
    expect(cwdToClaudeProjectKey('/Users/Chinese/repo')).toBe('-Users-Chinese-repo')
  })

  it('preserves spaces (current behavior frozen)', () => {
    expect(cwdToClaudeProjectKey('/Users/has space/repo')).toBe('-Users-has space-repo')
  })

  it('handles dot-only filename like .config', () => {
    expect(cwdToClaudeProjectKey('/home/.config/test')).toBe('-home--config-test')
  })

  it('handles trailing slash', () => {
    expect(cwdToClaudeProjectKey('/a/b/')).toBe('-a-b-')
  })
})
