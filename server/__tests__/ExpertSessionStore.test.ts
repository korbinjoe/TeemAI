import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  ExpertSessionStore,
  compositeKey,
  parseAgentId,
  parseChatId,
  PENDING_TASK_TTL_MS,
} from '../ws/ExpertSessionStore'
import type { ExpertEntry, PendingTaskEntry, PendingTaskLossReason } from '../ws/ExpertSessionStore'
import type { ActivityState } from '../terminal/ActivityDeriver'

function makeEntry(overrides: Partial<ExpertEntry> = {}): ExpertEntry {
  return {
    sessionId: 'sess-1',
    acpClient: {} as any,
    agentName: 'TestAgent',
    agentIcon: '🤖',
    cwd: '/tmp',
    connectionId: 'conn-1',
    chatId: 'chat-1',
    ...overrides,
  }
}

function makeActivity(phase = 'thinking' as ActivityState['phase']): ActivityState {
  return {
    phase,
    background: false,
    toolCount: 0,
    toolCompleted: 0,
    hasText: false,
    updatedAt: Date.now(),
  }
}

describe('compositeKey / parseAgentId / parseChatId', () => {
  it('compositeKey joins three segments in correct format', () => {
    expect(compositeKey('conn-1', 'chat-1', 'agent-1')).toBe('conn-1::chat-1::agent-1')
  })

  it('parseAgentId extracts agentId (3rd segment)', () => {
    expect(parseAgentId('conn-1::chat-1::agent-1')).toBe('agent-1')
  })

  it('parseChatId extracts chatId (2nd segment)', () => {
    expect(parseChatId('conn-1::chat-1::agent-1')).toBe('chat-1')
  })

  it('parseAgentId returns original string when no separator', () => {
    expect(parseAgentId('agent-only')).toBe('agent-only')
  })

  it('parseChatId returns empty string when not three segments', () => {
    expect(parseChatId('agent-only')).toBe('')
  })
})

// ── Starting Lock ──

describe('Starting Lock', () => {
  it('markStarting / isStarting / clearStarting', () => {
    const store = new ExpertSessionStore()
    const key = compositeKey('c', 'chat-1', 'a')
    expect(store.isStarting(key)).toBe(false)
    store.markStarting(key)
    expect(store.isStarting(key)).toBe(true)
    store.clearStarting(key)
    expect(store.isStarting(key)).toBe(false)
  })
})

// ── Running Map ──

describe('Running Map（set / get / has）', () => {
  it('get returns entry after set', () => {
    const store = new ExpertSessionStore()
    const key = compositeKey('c1', 'chat-1', 'a1')
    const entry = makeEntry()
    store.set(key, entry)
    expect(store.get(key)).toBe(entry)
    expect(store.has(key)).toBe(true)
  })

  it('get returns undefined when not set', () => {
    const store = new ExpertSessionStore()
    expect(store.get('nonexistent')).toBeUndefined()
  })
})

// ── Activity ──

describe('Activity', () => {
  it('setActivity / getActivity', () => {
    const store = new ExpertSessionStore()
    const key = compositeKey('c', 'chat-1', 'a')
    const activity = makeActivity('tool_running')
    store.setActivity(key, activity)
    expect(store.getActivity(key)).toBe(activity)
  })
})

// ── Completed Map ──

describe('Completed Map', () => {
  it('setCompleted / getCompleted', () => {
    const store = new ExpertSessionStore()
    const key = compositeKey('c', 'chat-1', 'a')
    const entry = {
      sessionId: 'sess-1',
      agentName: 'TestAgent',
      agentIcon: '🤖',
      exitCode: 0,
      completedAt: new Date().toISOString(),
      connectionId: 'c',
      chatId: 'chat-1',
    }
    store.setCompleted(key, entry)
    expect(store.getCompleted(key)).toBe(entry)
  })
})

// ── Pending Task Queue ──

function makePending(task: string, overrides: Partial<PendingTaskEntry> = {}): PendingTaskEntry {
  return {
    task,
    enqueuedAt: Date.now(),
    connectionId: 'conn-1',
    ...overrides,
  }
}

describe('Pending Task Queue', () => {
  it('enqueuePendingTask / hasPendingTask reflects queue state', () => {
    const store = new ExpertSessionStore()
    const key = 'k'
    expect(store.hasPendingTask(key)).toBe(false)
    store.enqueuePendingTask(key, makePending('run tests'))
    expect(store.hasPendingTask(key)).toBe(true)
  })

  it('drainPendingTasks returns entries in FIFO order and clears the queue', () => {
    const store = new ExpertSessionStore()
    const key = 'k'
    store.enqueuePendingTask(key, makePending('first'))
    store.enqueuePendingTask(key, makePending('second'))
    store.enqueuePendingTask(key, makePending('third'))

    const drained = store.drainPendingTasks(key)
    expect(drained.map(e => e.task)).toEqual(['first', 'second', 'third'])
    expect(store.hasPendingTask(key)).toBe(false)
  })

  it('drainPendingTasks returns empty array when no entries', () => {
    const store = new ExpertSessionStore()
    expect(store.drainPendingTasks('no-key')).toEqual([])
  })

  it('drain does not fire loss listener', () => {
    const store = new ExpertSessionStore()
    const key = 'k'
    const losses: Array<{ reason: PendingTaskLossReason; task: string }> = []
    store.onPendingTaskLoss((entry, _key, reason) => losses.push({ reason, task: entry.task }))

    store.enqueuePendingTask(key, makePending('a'))
    store.drainPendingTasks(key)
    expect(losses).toEqual([])
  })

  it('forgetPendingTasks drops queue silently (no loss listener fire)', () => {
    const store = new ExpertSessionStore()
    const key = 'k'
    const losses: PendingTaskEntry[] = []
    store.onPendingTaskLoss((entry) => losses.push(entry))

    store.enqueuePendingTask(key, makePending('a'))
    store.forgetPendingTasks(key)
    expect(store.hasPendingTask(key)).toBe(false)
    expect(losses).toEqual([])
  })

  it('TTL expiry fires loss listener with reason="ttl"', () => {
    vi.useFakeTimers()
    try {
      const store = new ExpertSessionStore()
      const key = 'k'
      const losses: Array<{ reason: PendingTaskLossReason; task: string }> = []
      store.onPendingTaskLoss((entry, _key, reason) => losses.push({ reason, task: entry.task }))

      store.enqueuePendingTask(key, makePending('a'))
      store.enqueuePendingTask(key, makePending('b'))

      vi.advanceTimersByTime(PENDING_TASK_TTL_MS - 1)
      expect(losses).toEqual([])
      vi.advanceTimersByTime(1)

      expect(losses).toEqual([
        { reason: 'ttl', task: 'a' },
        { reason: 'ttl', task: 'b' },
      ])
      expect(store.hasPendingTask(key)).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('TTL timer is not refreshed by subsequent enqueues', () => {
    vi.useFakeTimers()
    try {
      const store = new ExpertSessionStore()
      const key = 'k'
      const losses: PendingTaskEntry[] = []
      store.onPendingTaskLoss((entry) => losses.push(entry))

      store.enqueuePendingTask(key, makePending('first'))
      vi.advanceTimersByTime(PENDING_TASK_TTL_MS - 1000)
      store.enqueuePendingTask(key, makePending('second'))
      vi.advanceTimersByTime(1000)

      expect(losses.map(e => e.task)).toEqual(['first', 'second'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('cleanup fires loss listener with reason="cleanup"', () => {
    const store = new ExpertSessionStore()
    const key = compositeKey('c', 'chat-1', 'a')
    const losses: Array<{ reason: PendingTaskLossReason; task: string }> = []
    store.onPendingTaskLoss((entry, _key, reason) => losses.push({ reason, task: entry.task }))

    store.set(key, makeEntry())
    store.enqueuePendingTask(key, makePending('todo'))

    store.cleanup(key)
    expect(losses).toEqual([{ reason: 'cleanup', task: 'todo' }])
  })

  it('cleanupWithStop fires loss listener with reason="stop"', () => {
    const store = new ExpertSessionStore()
    const key = compositeKey('conn-1', 'chat-1', 'agent-1')
    const losses: Array<{ reason: PendingTaskLossReason; task: string }> = []
    store.onPendingTaskLoss((entry, _key, reason) => losses.push({ reason, task: entry.task }))

    store.set(key, makeEntry({ connectionId: 'conn-1', chatId: 'chat-1' }))
    store.enqueuePendingTask(key, makePending('queued'))

    store.cleanupWithStop(key, 'conn-1')
    expect(losses).toEqual([{ reason: 'stop', task: 'queued' }])
  })

  it('onPendingTaskLoss returns unsubscribe function', () => {
    const store = new ExpertSessionStore()
    const key = 'k'
    const losses: PendingTaskEntry[] = []
    const unsubscribe = store.onPendingTaskLoss((entry) => losses.push(entry))

    unsubscribe()

    store.enqueuePendingTask(key, makePending('a'))
    store.set(key, makeEntry())
    store.cleanup(key)
    expect(losses).toEqual([])
  })
})

// ── Meta ──

describe('Meta', () => {
  it('setMeta / getMeta', () => {
    const store = new ExpertSessionStore()
    store.setMeta('key1', 'executionLogId', 'log-123')
    expect(store.getMeta('key1', 'executionLogId')).toBe('log-123')
  })
})

// ── cleanup ──

describe('cleanup', () => {
  it('returns cleaned up entry and activity, clears all associated status', () => {
    const store = new ExpertSessionStore()
    const key = compositeKey('c', 'chat-1', 'a')
    const entry = makeEntry()
    const activity = makeActivity()
    store.set(key, entry)
    store.setActivity(key, activity)
    store.markStarting(key)
    store.enqueuePendingTask(key, {
      task: 'todo',
      enqueuedAt: Date.now(),
      connectionId: 'c',
    })

    const result = store.cleanup(key)
    expect(result.entry).toBe(entry)
    expect(result.activity).toBe(activity)
    expect(store.has(key)).toBe(false)
    expect(store.isStarting(key)).toBe(false)
    expect(store.hasPendingTask(key)).toBe(false)
    expect(store.getActivity(key)).toBeUndefined()
  })

  it('cleanup non-existent key does not error, returns empty entry', () => {
    const store = new ExpertSessionStore()
    const result = store.cleanup('nonexistent')
    expect(result.entry).toBeUndefined()
    expect(result.activity).toBeUndefined()
  })
})

// ── cleanupWithStop ──

describe('cleanupWithStop', () => {
  it('Back entry，Write completed', () => {
    const store = new ExpertSessionStore()
    const key = compositeKey('conn-1', 'chat-1', 'agent-1')
    const entry = makeEntry({ connectionId: 'conn-1', chatId: 'chat-1' })
    store.set(key, entry)

    const cleaned = store.cleanupWithStop(key, 'conn-1')
    expect(cleaned).toBe(entry)
    expect(store.has(key)).toBe(false)
    expect(store.getCompleted(key)).toBeDefined()
    expect(store.getCompleted(key)?.exitCode).toBe(-1)
  })

  it('returns undefined when key does not exist', () => {
    const store = new ExpertSessionStore()
    expect(store.cleanupWithStop('no-key', 'c')).toBeUndefined()
  })
})

// ── collectByConnection ──

describe('collectByConnection', () => {
  it('only returns entries for specified connectionId', () => {
    const store = new ExpertSessionStore()
    store.set(compositeKey('conn-1', 'chat-1', 'agent-1'), makeEntry({ connectionId: 'conn-1' }))
    store.set(compositeKey('conn-1', 'chat-1', 'agent-2'), makeEntry({ connectionId: 'conn-1' }))
    store.set(compositeKey('conn-2', 'chat-1', 'agent-1'), makeEntry({ connectionId: 'conn-2' }))

    const result = store.collectByConnection('conn-1')
    expect(result).toHaveLength(2)
    expect(result.every(({ expert }) => expert.connectionId === 'conn-1')).toBe(true)
  })
})

// ── findBySessionId ──

describe('findBySessionId', () => {
  it('exact lookup by sessionId', () => {
    const store = new ExpertSessionStore()
    const key = compositeKey('c', 'chat-1', 'a')
    store.set(key, makeEntry({ sessionId: 'sess-xyz' }))
    const found = store.findBySessionId('sess-xyz')
    expect(found?.key).toBe(key)
  })

  it('returns undefined when not found', () => {
    const store = new ExpertSessionStore()
    expect(store.findBySessionId('no-session')).toBeUndefined()
  })
})

// ── findRunning ──

describe('findRunning', () => {
  it('with connectionId + chatId uses exact three-segment key lookup', () => {
    const store = new ExpertSessionStore()
    const entry = makeEntry({ connectionId: 'c1', chatId: 'chat-1' })
    store.set(compositeKey('c1', 'chat-1', 'a1'), entry)
    expect(store.findRunning('a1', 'c1', 'chat-1')).toBe(entry)
    expect(store.findRunning('a1', 'c1', 'chat-2')).toBeUndefined()
  })

  it('with connectionId without chatId uses fuzzy traversal', () => {
    const store = new ExpertSessionStore()
    const entry = makeEntry({ connectionId: 'c1', chatId: 'chat-1' })
    store.set(compositeKey('c1', 'chat-1', 'a1'), entry)
    expect(store.findRunning('a1', 'c1')).toBe(entry)
    expect(store.findRunning('a1', 'c2')).toBeUndefined()
  })

  it('without connectionId uses global lookup', () => {
    const store = new ExpertSessionStore()
    const entry = makeEntry()
    store.set(compositeKey('c1', 'chat-1', 'a1'), entry)
    expect(store.findRunning('a1')).toBe(entry)
    expect(store.findRunning('nonexistent')).toBeUndefined()
  })
})

// ── migrateKey ──

describe('migrateKey', () => {
  it('migrates entry from oldKey to newKey', () => {
    const store = new ExpertSessionStore()
    const oldKey = compositeKey('old-conn', 'chat-1', 'agent-1')
    const newKey = compositeKey('new-conn', 'chat-1', 'agent-1')
    const entry = makeEntry({ connectionId: 'old-conn' })
    store.set(oldKey, entry)

    store.migrateKey(oldKey, newKey, 'new-conn')

    expect(store.has(oldKey)).toBe(false)
    expect(store.has(newKey)).toBe(true)
    expect(store.get(newKey)?.connectionId).toBe('new-conn')
  })

  it('also migrates lastActivity', () => {
    const store = new ExpertSessionStore()
    const oldKey = compositeKey('o', 'chat-1', 'a')
    const newKey = compositeKey('n', 'chat-1', 'a')
    const activity = makeActivity()
    store.set(oldKey, makeEntry())
    store.setActivity(oldKey, activity)
    store.migrateKey(oldKey, newKey, 'n')
    expect(store.getActivity(newKey)).toBe(activity)
    expect(store.getActivity(oldKey)).toBeUndefined()
  })
})

// ── getExpertListForConnection ──

describe('getExpertListForConnection', () => {
  it('filters running + completed by connectionId', () => {
    const store = new ExpertSessionStore()
    const k1 = compositeKey('c1', 'chat-1', 'agent-1')
    const k2 = compositeKey('c2', 'chat-1', 'agent-2')
    store.set(k1, makeEntry({ connectionId: 'c1', chatId: 'chat-1' }))
    store.set(k2, makeEntry({ connectionId: 'c2', chatId: 'chat-1' }))

    const list = store.getExpertListForConnection('c1')
    expect(list).toHaveLength(1)
    expect(list[0].agentId).toBe('agent-1')
    expect(list[0].status).toBe('running')
  })

  it('filters by chatId (agents in different chats on same connection not visible to each other)', () => {
    const store = new ExpertSessionStore()
    store.set(compositeKey('c1', 'chat-1', 'a1'), makeEntry({ connectionId: 'c1', chatId: 'chat-1' }))
    store.set(compositeKey('c1', 'chat-2', 'a2'), makeEntry({ connectionId: 'c1', chatId: 'chat-2' }))

    const list1 = store.getExpertListForConnection('c1', 'chat-1')
    expect(list1).toHaveLength(1)
    expect(list1[0].agentId).toBe('a1')

    const list2 = store.getExpertListForConnection('c1', 'chat-2')
    expect(list2).toHaveLength(1)
    expect(list2[0].agentId).toBe('a2')
  })

  it('stopped entries shown as completed', () => {
    const store = new ExpertSessionStore()
    const key = compositeKey('c1', 'chat-1', 'a1')
    store.set(key, makeEntry({ connectionId: 'c1', chatId: 'chat-1' }))
    store.cleanupWithStop(key, 'c1')

    const list = store.getExpertListForConnection('c1')
    expect(list).toHaveLength(1)
    expect(list[0].status).toBe('completed')
    expect(list[0].exitCode).toBe(-1)
  })
})

// ── collectByChatId ──

describe('collectByChatId', () => {
  it('returns only entries matching the chatId', () => {
    const store = new ExpertSessionStore()
    store.set(compositeKey('c1', 'chat-1', 'a'), makeEntry({ chatId: 'chat-1' }))
    store.set(compositeKey('c1', 'chat-2', 'b'), makeEntry({ chatId: 'chat-2' }))
    store.set(compositeKey('c2', 'chat-1', 'c'), makeEntry({ chatId: 'chat-1' }))

    const result = store.collectByChatId('chat-1')
    expect(result).toHaveLength(2)
    expect(result.map(r => parseAgentId(r.key)).sort()).toEqual(['a', 'c'])
  })

  it('returns empty when no entries match', () => {
    const store = new ExpertSessionStore()
    store.set(compositeKey('c1', 'chat-1', 'a'), makeEntry({ chatId: 'chat-1' }))
    expect(store.collectByChatId('chat-99')).toEqual([])
  })
})

// ── cleanupConnection ──

describe('cleanupConnection', () => {
  it('removes running and completed entries for a connectionId', () => {
    const store = new ExpertSessionStore()
    const k1 = compositeKey('conn-1', 'chat-1', 'a')
    const k2 = compositeKey('conn-1', 'chat-2', 'b')
    const k3 = compositeKey('conn-2', 'chat-1', 'c')

    store.set(k1, makeEntry({ connectionId: 'conn-1' }))
    store.set(k2, makeEntry({ connectionId: 'conn-1' }))
    store.set(k3, makeEntry({ connectionId: 'conn-2' }))

    store.setCompleted(k1, {
      sessionId: 'sess-1', agentName: 'A', agentIcon: 'A',
      exitCode: 0, completedAt: new Date().toISOString(),
      connectionId: 'conn-1', chatId: 'chat-1',
    })

    store.cleanupConnection('conn-1')

    expect(store.has(k1)).toBe(false)
    expect(store.has(k2)).toBe(false)
    expect(store.has(k3)).toBe(true)
    expect(store.getCompleted(k1)).toBeUndefined()
  })
})

// ── findKeyByAgentId ──

describe('findKeyByAgentId', () => {
  it('prioritizes running entry over completed', () => {
    const store = new ExpertSessionStore()
    const runKey = compositeKey('c1', 'chat-1', 'agent-a')
    store.set(runKey, makeEntry())
    store.setCompleted(compositeKey('c2', 'chat-1', 'agent-a'), {
      sessionId: 'sess-old', agentName: 'A', agentIcon: 'A',
      exitCode: 0, completedAt: new Date().toISOString(),
      connectionId: 'c2', chatId: 'chat-1',
    })

    expect(store.findKeyByAgentId('agent-a')).toBe(runKey)
  })

  it('falls back to completed entry key when no running entry', () => {
    const store = new ExpertSessionStore()
    const compKey = compositeKey('c1', 'chat-1', 'agent-b')
    store.setCompleted(compKey, {
      sessionId: 'sess-1', agentName: 'B', agentIcon: 'B',
      exitCode: 0, completedAt: new Date().toISOString(),
      connectionId: 'c1', chatId: 'chat-1',
    })

    expect(store.findKeyByAgentId('agent-b')).toBe(compKey)
  })

  it('returns undefined when agent not found anywhere', () => {
    const store = new ExpertSessionStore()
    expect(store.findKeyByAgentId('ghost')).toBeUndefined()
  })
})

// ── Second set() overwrites: critical for re-assignment ──

describe('second set() overwrite behavior', () => {
  it('second set() on same key replaces entry without error', () => {
    const store = new ExpertSessionStore()
    const key = compositeKey('conn-1', 'chat-1', 'agent-a')
    const first = makeEntry({ sessionId: 'sess-first' })
    const second = makeEntry({ sessionId: 'sess-second' })

    store.set(key, first)
    store.set(key, second)

    expect(store.get(key)?.sessionId).toBe('sess-second')
    expect(store.collectByConnection('conn-1')).toHaveLength(1)
  })
})

// ── Concurrency: markStarting prevents duplicate ──

describe('concurrency: markStarting lock prevents duplicate start', () => {
  it('two concurrent starts — second caller sees isStarting=true', () => {
    const store = new ExpertSessionStore()
    const key = compositeKey('conn-1', 'chat-1', 'agent-a')

    store.markStarting(key)
    expect(store.isStarting(key)).toBe(true)

    // Second "start" attempt should see the lock
    const shouldSkip = store.isStarting(key)
    expect(shouldSkip).toBe(true)

    // After first start completes
    store.clearStarting(key)
    expect(store.isStarting(key)).toBe(false)
  })
})

// ── clearCompleted ──

describe('clearCompleted', () => {
  it('deletes completed records by connectionId', () => {
    const store = new ExpertSessionStore()
    const k1 = compositeKey('c1', 'chat-1', 'a1')
    const k2 = compositeKey('c2', 'chat-1', 'a2')
    store.set(k1, makeEntry({ connectionId: 'c1', chatId: 'chat-1' }))
    store.cleanupWithStop(k1, 'c1')
    store.set(k2, makeEntry({ connectionId: 'c2', chatId: 'chat-1' }))
    store.cleanupWithStop(k2, 'c2')

    const count = store.clearCompleted('c1')
    expect(count).toBe(1)
    expect(store.getCompleted(k2)).toBeDefined()
  })

  it('returns number of deleted records', () => {
    const store = new ExpertSessionStore()
    expect(store.clearCompleted('no-conn')).toBe(0)
  })
})
