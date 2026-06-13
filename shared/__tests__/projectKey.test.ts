import { describe, it, expect } from 'vitest'
import { cwdToCliProjectKey } from '../projectKey'

describe('cwdToCliProjectKey', () => {
  it('replaces slashes with dashes for normal absolute path', () => {
    expect(cwdToCliProjectKey('/Users/a/b/c')).toBe('-Users-a-b-c')
  })

  it('replaces dots in path segment (real Claude Code rule)', () => {
    expect(cwdToCliProjectKey('/path/my.app')).toBe('-path-my-app')
  })

  it('replaces multiple dots in single segment', () => {
    expect(cwdToCliProjectKey('/p/x.y.z/repo')).toBe('-p-x-y-z-repo')
  })

  it('handles leading slash only', () => {
    expect(cwdToCliProjectKey('/')).toBe('-')
  })

  it('handles empty string', () => {
    expect(cwdToCliProjectKey('')).toBe('')
  })

  it('handles single char', () => {
    expect(cwdToCliProjectKey('a')).toBe('a')
  })

  it('preserves non-ASCII characters (current behavior frozen)', () => {
    expect(cwdToCliProjectKey('/Users/Chinese/repo')).toBe('-Users-Chinese-repo')
  })

  it('preserves spaces (current behavior frozen)', () => {
    expect(cwdToCliProjectKey('/Users/has space/repo')).toBe('-Users-has space-repo')
  })

  it('handles dot-only filename like .config', () => {
    expect(cwdToCliProjectKey('/home/.config/test')).toBe('-home--config-test')
  })

  it('handles trailing slash', () => {
    expect(cwdToCliProjectKey('/a/b/')).toBe('-a-b-')
  })

  it('handles deep nesting', () => {
    expect(cwdToCliProjectKey('/a/b/c/d/e/f')).toBe('-a-b-c-d-e-f')
  })
})
