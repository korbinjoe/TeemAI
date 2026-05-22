/**
 * GitStatusPoller - Agent  Worktree Git
 *
 */

import { WorktreeManager, type DiffEntry } from '../git/WorktreeManager'
import { createLogger } from '../lib/logger'

const log = createLogger('GitStatusPoller')

export interface GitStatusSnapshot {
  worktreePath: string
  branch: string
  baseBranch: string
  aheadCount: number
  changedFiles: number
  untrackedFiles: number
  insertions: number
  deletions: number
  diffEntries: DiffEntry[]
}

export class GitStatusPoller {
  private timer: ReturnType<typeof setInterval> | null = null
  private lastSnapshot = ''
  private manager: WorktreeManager
  private worktreePath: string
  private baseBranch: string

  constructor(repoRoot: string, worktreePath: string, baseBranch = 'main') {
    this.manager = new WorktreeManager(repoRoot)
    this.worktreePath = worktreePath
    this.baseBranch = baseBranch
  }

  start(
    onChanged: (snapshot: GitStatusSnapshot) => void,
    interval = 5000,
  ): void {
    if (this.timer) return

    this.poll(onChanged)

    this.timer = setInterval(() => {
      this.poll(onChanged)
    }, interval)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private buildSignature(snapshot: GitStatusSnapshot): string {
    let h = 2166136261
    const push = (s: string) => {
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i)
        h = Math.imul(h, 16777619)
      }
    }
    push(snapshot.worktreePath)
    push(snapshot.branch)
    push(snapshot.baseBranch)
    push(String(snapshot.aheadCount))
    push(String(snapshot.changedFiles))
    push(String(snapshot.untrackedFiles))
    push(String(snapshot.insertions))
    push(String(snapshot.deletions))
    for (const e of snapshot.diffEntries) {
      push(e.file)
      push(e.status)
      push(String(e.insertions))
      push(String(e.deletions))
    }
    return `${snapshot.diffEntries.length}:${h >>> 0}`
  }

  private async poll(onChanged: (snapshot: GitStatusSnapshot) => void): Promise<void> {
    try {
      const status = await this.manager.status(this.worktreePath)
      const needsDiff =
        status.aheadCount > 0 ||
        status.changedFiles > 0 ||
        status.untrackedFiles > 0
      const diffEntries = needsDiff
        ? await this.manager.diffWithStats(this.worktreePath, this.baseBranch)
        : []

      const snapshot: GitStatusSnapshot = {
        worktreePath: this.worktreePath,
        branch: status.branch,
        baseBranch: status.baseBranch,
        aheadCount: status.aheadCount,
        changedFiles: status.changedFiles,
        untrackedFiles: status.untrackedFiles,
        insertions: diffEntries.reduce((s, e) => s + e.insertions, 0),
        deletions: diffEntries.reduce((s, e) => s + e.deletions, 0),
        diffEntries,
      }

      const signature = this.buildSignature(snapshot)
      if (signature !== this.lastSnapshot) {
        this.lastSnapshot = signature
        onChanged(snapshot)
      }
    } catch (err) {
      log.warn('Poll error', { error: err instanceof Error ? err.message : String(err) })
    }
  }
}
