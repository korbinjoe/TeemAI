import { describe, it, expect } from 'vitest'
import { isAllowedCwd } from '../lib/validateCwd'
import { homedir } from 'os'

describe('isAllowedCwd', () => {
  it('allows cwd within process.cwd()', () => {
    expect(isAllowedCwd(process.cwd())).toBe(true)
    expect(isAllowedCwd(process.cwd() + '/subdir')).toBe(true)
  })

  it('allows cwd within homedir', () => {
    expect(isAllowedCwd(homedir())).toBe(true)
    expect(isAllowedCwd(homedir() + '/.openteam')).toBe(true)
  })

  it('rejects cwd outside allowed roots', () => {
    expect(isAllowedCwd('/tmp/evil')).toBe(false)
    expect(isAllowedCwd('/etc/passwd')).toBe(false)
  })

  it('rejects path traversal to system directories', () => {
    expect(isAllowedCwd('/var/root/../tmp')).toBe(false)
  })
})
