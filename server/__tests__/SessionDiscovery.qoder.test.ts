import { describe, it, expect } from 'vitest'
import { createSessionDiscovery } from '../terminal/SessionDiscovery'

describe('createSessionDiscovery — qoder provider', () => {
  it('creates a session discovery instance for qoder without throwing', () => {
    const discovery = createSessionDiscovery('qoder', 'test-session-id')
    expect(discovery).toBeDefined()
    expect(discovery.isFound()).toBe(false)
    expect(typeof discovery.watch).toBe('function')
    expect(typeof discovery.stop).toBe('function')
  })

  it('stops cleanly before any watch is started', () => {
    const discovery = createSessionDiscovery('qoder', 'test-session-id')
    expect(() => discovery.stop()).not.toThrow()
  })
})
