/**
 * GitWatchManager —
 *
 * 1. subscribe 2  + unsubscribe 1  → watcher
 * 2. ChatA  →  path  ChatB  path  ChatC
 * 3. debounce300ms  →
 * 4. cleanup subscriber  → watcher
 * 5. unsubscribeAllFordisconnect  chatId
 * 6. node_modules
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { execFileSync } from 'child_process'
import { GitWatchManager, type GitChangeEvent } from '../git/GitWatchManager'

const initRepo = (dir: string) => {
  execFileSync('git', ['init', '-b', 'main'], { cwd: dir, stdio: 'ignore' })
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'test'], { cwd: dir })
  writeFileSync(join(dir, 'README.md'), 'init')
  execFileSync('git', ['add', '.'], { cwd: dir })
  execFileSync('git', ['commit', '-m', 'init'], { cwd: dir, stdio: 'ignore' })
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('GitWatchManager', () => {
  let manager: GitWatchManager
  let repoA: string
  let repoB: string

  beforeEach(() => {
    manager = new GitWatchManager(50)
    repoA = mkdtempSync(join(tmpdir(), 'gwm-a-'))
    repoB = mkdtempSync(join(tmpdir(), 'gwm-b-'))
    initRepo(repoA)
    initRepo(repoB)
  })

  afterEach(async () => {
    await manager.dispose()
    rmSync(repoA, { recursive: true, force: true })
    rmSync(repoB, { recursive: true, force: true })
  })

  it('Reference counting：subscribe 2 times + unsubscribe 1 times → watcher still alive', () => {
    manager.subscribe('ChatA', repoA)
    manager.subscribe('ChatB', repoA)
    expect(manager.getRefCount(repoA)).toBe(2)

    manager.unsubscribe('ChatA', repoA)
    expect(manager.getRefCount(repoA)).toBe(1)
  })

  it('all unsubscribed → watcher closes (cleared when refCount reaches 0)', () => {
    manager.subscribe('ChatA', repoA)
    manager.unsubscribe('ChatA', repoA)
    expect(manager.getRefCount(repoA)).toBe(0)
  })

  it('keeps an idle watcher briefly and reuses it when switching back quickly', async () => {
    manager.subscribe('ChatA', repoA)
    expect(manager.getWatchedPathCount()).toBe(1)

    manager.unsubscribe('ChatA', repoA)
    expect(manager.getRefCount(repoA)).toBe(0)
    expect(manager.getWatchedPathCount()).toBe(1)

    await wait(20)
    manager.subscribe('ChatB', repoA)
    expect(manager.getRefCount(repoA)).toBe(1)
    expect(manager.getWatchedPathCount()).toBe(1)

    await wait(80)
    expect(manager.getWatchedPathCount()).toBe(1)
  })

  it('closes an idle watcher after the reuse window expires', async () => {
    manager.subscribe('ChatA', repoA)
    manager.unsubscribe('ChatA', repoA)

    await wait(100)

    expect(manager.getRefCount(repoA)).toBe(0)
    expect(manager.getWatchedPathCount()).toBe(0)
  })

  it('Idempotent subscription：same chat + same path duplicate subscriptions do not double-count', () => {
    manager.subscribe('ChatA', repoA)
    manager.subscribe('ChatA', repoA)
    expect(manager.getRefCount(repoA)).toBe(1)
  })

  it('isolation + chatId routing: multiple subs on same path all receive, different paths do not', async () => {
    const events: GitChangeEvent[] = []
    manager.on('changes', (e: GitChangeEvent) => events.push(e))

    manager.subscribe('ChatA', repoA)
    manager.subscribe('ChatB', repoA)
    manager.subscribe('ChatC', repoB)

    await wait(300)

    writeFileSync(join(repoA, 'foo.txt'), 'hello')

    await wait(1500)

    const repoAResolved = resolve(repoA)
    const aEvents = events.filter((e) => e.path === repoAResolved)
    const bEvents = events.filter((e) => e.path === resolve(repoB))

    const aChats = new Set(aEvents.map((e) => e.chatId))
    expect(aChats.has('ChatA')).toBe(true)
    expect(aChats.has('ChatB')).toBe(true)
    expect(bEvents.length).toBe(0)
  })

  it('unsubscribeAllFor: cleans up all paths by chatId', () => {
    manager.subscribe('ChatA', repoA)
    manager.subscribe('ChatA', repoB)
    manager.subscribe('ChatB', repoA)

    expect(manager.getRefCount(repoA)).toBe(2)
    expect(manager.getRefCount(repoB)).toBe(1)

    manager.unsubscribeAllFor('ChatA')

    expect(manager.getRefCount(repoA)).toBe(1)
    expect(manager.getRefCount(repoB)).toBe(0)
  })

  it('debounce: multiple file events within short time aggregated to one push', async () => {
    const onChange = vi.fn()
    manager.on('changes', onChange)
    manager.subscribe('ChatA', repoA)
    await wait(300)

    for (let i = 0; i < 5; i++) {
      writeFileSync(join(repoA, `f${i}.txt`), String(i))
      await wait(20)
    }

    await wait(1500)

    expect(onChange.mock.calls.length).toBeLessThanOrEqual(2)
  })

  it('node_modules exclusion: related path changes do not trigger push', async () => {
    mkdirSync(join(repoA, 'node_modules', 'foo'), { recursive: true })
    writeFileSync(join(repoA, 'node_modules', 'foo', 'placeholder.txt'), 'init')

    const onChange = vi.fn()
    manager.on('changes', onChange)
    manager.subscribe('ChatA', repoA)
    await wait(400)

    writeFileSync(join(repoA, 'node_modules', 'foo', 'index.js'), 'changed')
    await wait(1200)

    expect(onChange).not.toHaveBeenCalled()
  })

  it('payload fields complete: includes branch / diffEntries / aheadCount etc', async () => {
    const events: GitChangeEvent[] = []
    manager.on('changes', (e: GitChangeEvent) => events.push(e))
    manager.subscribe('ChatA', repoA)
    await wait(300)

    writeFileSync(join(repoA, 'new.md'), 'new file')
    await wait(1500)

    expect(events.length).toBeGreaterThan(0)
    const last = events[events.length - 1]
    expect(last.payload.branch).toBe('main')
    expect(typeof last.payload.aheadCount).toBe('number')
    expect(Array.isArray(last.payload.diffEntries)).toBe(true)
    expect(last.payload.diffEntries.some((e) => e.file === 'new.md')).toBe(true)
  })
})
