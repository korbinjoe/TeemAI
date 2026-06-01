import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkflowScheduler } from '../orchestration/WorkflowScheduler'
import type { ConflictAnalysis } from '../git/WorktreeManager'

const mockMergeWithConflictMarkers = vi.fn<[], Promise<ConflictAnalysis>>()

vi.mock('../git/WorktreeManager', () => {
  const MockWorktreeManager = function() {
    return { mergeWithConflictMarkers: mockMergeWithConflictMarkers }
  }
  return { WorktreeManager: MockWorktreeManager }
})

vi.mock('child_process', () => ({
  execFile: vi.fn((_cmd: string, _args: string[], _opts: unknown, cb: (err: Error | null, stdout: string) => void) => {
    cb(null, 'mock diff output')
  }),
}))

vi.mock('util', async (importOriginal) => {
  const original = await importOriginal<typeof import('util')>()
  return {
    ...original,
    promisify: () => async () => ({ stdout: 'mock diff output' }),
  }
})

import { ConflictResolver } from '../git/ConflictResolver'

function mockScheduler(): WorkflowScheduler {
  return {
    notifyLead: vi.fn(),
  } as unknown as WorkflowScheduler
}

describe('ConflictResolver', () => {
  let scheduler: WorkflowScheduler
  let broadcast: ReturnType<typeof vi.fn>
  let resolver: ConflictResolver

  const baseReq = {
    chatId: 'chat-1',
    worktreePath: '/tmp/wt/abc',
    repoRoot: '/tmp/repo',
    targetBranch: 'main',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    scheduler = mockScheduler()
    broadcast = vi.fn()
    resolver = new ConflictResolver(scheduler, broadcast)
  })

  it('dispatches Lead for text file conflicts', async () => {
    mockMergeWithConflictMarkers.mockResolvedValue({
      conflictingFiles: ['src/auth.ts', 'src/middleware.ts'],
      binaryConflicts: [],
      baseBranch: 'main',
      featureBranch: 'wt/abc',
      tooManyConflicts: false,
    })

    const result = await resolver.resolve(baseReq)

    expect(result.autoResolving).toBe(true)
    expect(scheduler.notifyLead).toHaveBeenCalledWith('chat-1', expect.stringContaining('[Merge conflict detected]'))
    expect(scheduler.notifyLead).toHaveBeenCalledWith('chat-1', expect.stringContaining('src/auth.ts'))
    expect(broadcast).toHaveBeenCalledWith('chat-1', expect.objectContaining({
      type: 'worktree:conflict-auto-resolving',
    }))
  })

  it('escalates immediately for binary-only conflicts', async () => {
    mockMergeWithConflictMarkers.mockResolvedValue({
      conflictingFiles: [],
      binaryConflicts: ['assets/logo.png'],
      baseBranch: 'main',
      featureBranch: 'wt/abc',
      tooManyConflicts: false,
    })

    const result = await resolver.resolve(baseReq)

    expect(result.autoResolving).toBe(false)
    expect(result.escalationReason).toBe('binary_conflicts_only')
    expect(scheduler.notifyLead).not.toHaveBeenCalled()
  })

  it('escalates immediately for >10 conflicting files', async () => {
    mockMergeWithConflictMarkers.mockResolvedValue({
      conflictingFiles: Array.from({ length: 12 }, (_, i) => `src/file${i}.ts`),
      binaryConflicts: [],
      baseBranch: 'main',
      featureBranch: 'wt/abc',
      tooManyConflicts: true,
    })

    const result = await resolver.resolve(baseReq)

    expect(result.autoResolving).toBe(false)
    expect(result.escalationReason).toBe('too_many_conflicts')
    expect(scheduler.notifyLead).not.toHaveBeenCalled()
  })

  it('dispatches for text conflicts and notes binary conflicts in prompt', async () => {
    mockMergeWithConflictMarkers.mockResolvedValue({
      conflictingFiles: ['src/auth.ts'],
      binaryConflicts: ['assets/logo.png'],
      baseBranch: 'main',
      featureBranch: 'wt/abc',
      tooManyConflicts: false,
    })

    const result = await resolver.resolve(baseReq)

    expect(result.autoResolving).toBe(true)
    expect(scheduler.notifyLead).toHaveBeenCalledWith('chat-1', expect.stringContaining('Binary file conflicts'))
    expect(scheduler.notifyLead).toHaveBeenCalledWith('chat-1', expect.stringContaining('assets/logo.png'))
  })

  it('returns no_text_conflicts when merge has no conflicts at all', async () => {
    mockMergeWithConflictMarkers.mockResolvedValue({
      conflictingFiles: [],
      binaryConflicts: [],
      baseBranch: 'main',
      featureBranch: 'wt/abc',
      tooManyConflicts: false,
    })

    const result = await resolver.resolve(baseReq)

    expect(result.autoResolving).toBe(false)
    expect(result.escalationReason).toBe('no_text_conflicts')
    expect(scheduler.notifyLead).not.toHaveBeenCalled()
  })
})
