import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { buildFileManifestBlock, validateFileManifest, detectMissingManifest, shouldUseWorktree } from '../orchestration/WorkflowTaskUtils'
import { WorkflowEngine } from '../orchestration/WorkflowEngine'
import type { WorkflowDAG, FileManifest } from '../../shared/workflow-types'

const makeDag = (overrides?: Partial<WorkflowDAG>): WorkflowDAG => ({
  id: `wf-test-${Date.now()}`,
  chatId: 'chat-1',
  tasks: [],
  createdAt: new Date().toISOString(),
  createdBy: 'lead',
  ...overrides,
})

describe('buildFileManifestBlock', () => {
  it('includes MUST create section', () => {
    const block = buildFileManifestBlock({ create: ['src/a.ts', 'src/b.ts'] })
    expect(block).toContain('Files you MUST create')
    expect(block).toContain('- src/a.ts')
    expect(block).toContain('- src/b.ts')
  })

  it('includes MAY modify section when present', () => {
    const block = buildFileManifestBlock({ create: ['src/a.ts'], modify: ['package.json'] })
    expect(block).toContain('Files you MAY modify')
    expect(block).toContain('- package.json')
  })

  it('includes MUST NOT touch section when present', () => {
    const block = buildFileManifestBlock({ create: ['src/a.ts'], forbid: ['*.md', 'skills/**'] })
    expect(block).toContain('MUST NOT touch')
    expect(block).toContain('- *.md')
    expect(block).toContain('- skills/**')
  })

  it('omits optional sections when empty', () => {
    const block = buildFileManifestBlock({ create: ['src/a.ts'] })
    expect(block).not.toContain('MAY modify')
    expect(block).not.toContain('MUST NOT touch')
  })
})

describe('validateFileManifest', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'manifest-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('passes when all create files exist and are non-empty', async () => {
    writeFileSync(join(tmpDir, 'a.ts'), 'export const a = 1')
    writeFileSync(join(tmpDir, 'b.ts'), 'export const b = 2')

    const result = await validateFileManifest(tmpDir, { create: ['a.ts', 'b.ts'] })
    expect(result.passed).toBe(true)
    expect(result.missingFiles).toHaveLength(0)
    expect(result.emptyFiles).toHaveLength(0)
  })

  it('detects missing files', async () => {
    writeFileSync(join(tmpDir, 'a.ts'), 'export const a = 1')

    const result = await validateFileManifest(tmpDir, { create: ['a.ts', 'b.ts'] })
    expect(result.passed).toBe(false)
    expect(result.missingFiles).toEqual(['b.ts'])
  })

  it('detects empty files', async () => {
    writeFileSync(join(tmpDir, 'a.ts'), '')

    const result = await validateFileManifest(tmpDir, { create: ['a.ts'] })
    expect(result.passed).toBe(false)
    expect(result.emptyFiles).toEqual(['a.ts'])
  })
})

describe('detectMissingManifest', () => {
  it('returns warning when description has creation keywords but no manifest', () => {
    const warning = detectMissingManifest('implement bridge server module')
    expect(warning).toContain('no fileManifest')
  })

  it('returns undefined when manifest is present', () => {
    const warning = detectMissingManifest('implement bridge server', { create: ['a.ts'] })
    expect(warning).toBeUndefined()
  })

  it('returns undefined when no creation keywords', () => {
    const warning = detectMissingManifest('review the code changes')
    expect(warning).toBeUndefined()
  })
})

describe('shouldUseWorktree', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'wt-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns true when task has isolation: worktree', async () => {
    const dag = makeDag({
      tasks: [
        { taskId: 't1', agentId: 'eng', description: 'T1', dependsOn: [], onFailure: 'stop', isolation: 'worktree' },
      ],
    })
    const engine = new WorkflowEngine(dag, tmpDir)
    await engine.initialize()

    expect(shouldUseWorktree(engine, dag.tasks[0])).toBe(true)
    engine.destroy()
  })

  it('returns false when task has isolation: shared', async () => {
    const dag = makeDag({
      tasks: [
        { taskId: 't1', agentId: 'eng', description: 'T1', dependsOn: [], onFailure: 'stop', isolation: 'shared' },
        { taskId: 't2', agentId: 'eng', description: 'T2', dependsOn: [], onFailure: 'stop' },
      ],
    })
    const engine = new WorkflowEngine(dag, tmpDir)
    await engine.initialize()
    engine.markTaskRunning('t2')

    expect(shouldUseWorktree(engine, dag.tasks[0])).toBe(false)
    engine.destroy()
  })

  it('auto-detects worktree when another task is running', async () => {
    const dag = makeDag({
      tasks: [
        { taskId: 't1', agentId: 'eng', description: 'T1', dependsOn: [], onFailure: 'stop' },
        { taskId: 't2', agentId: 'eng', description: 'T2', dependsOn: [], onFailure: 'stop' },
      ],
    })
    const engine = new WorkflowEngine(dag, tmpDir)
    await engine.initialize()
    engine.markTaskRunning('t1')

    expect(shouldUseWorktree(engine, dag.tasks[1])).toBe(true)
    engine.destroy()
  })

  it('returns false when no other tasks are running', async () => {
    const dag = makeDag({
      tasks: [
        { taskId: 't1', agentId: 'eng', description: 'T1', dependsOn: [], onFailure: 'stop' },
      ],
    })
    const engine = new WorkflowEngine(dag, tmpDir)
    await engine.initialize()

    expect(shouldUseWorktree(engine, dag.tasks[0])).toBe(false)
    engine.destroy()
  })
})
