/**
 * Git Worktree
 *  Git Worktree
 */

import { execFile } from 'child_process'
import { existsSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'

export interface WorktreeInfo {
  path: string
  branch: string
  head: string
  isMain: boolean
  prunable: boolean
}

export interface WorktreeStatus {
  branch: string
  baseBranch: string
  aheadCount: number
  behindCount: number
  changedFiles: number
  untrackedFiles: number
}

export interface DiffEntry {
  file: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  insertions: number
  deletions: number
}

export interface CommitInfo {
  hash: string
  shortHash: string
  message: string
  author: string
  timestamp: number
}

export interface MergeResult {
  success: boolean
  conflicts?: string[]
  commitHash?: string
  message?: string
}

export interface CreateResult {
  path: string
  branch: string
}

export interface GitRepoInfo {
  isGit: boolean
  repoRoot?: string
  currentBranch?: string
  isWorktree?: boolean
}

const WORKTREES_DIR = '.worktrees'

function git(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const msg = stderr?.trim() || err.message
        reject(new Error(msg))
        return
      }
      resolve(stdout.trim())
    })
  })
}

export async function detectGitRepo(dirPath: string): Promise<GitRepoInfo> {
  try {
    const repoRoot = await git(['rev-parse', '--show-toplevel'], dirPath)
    const currentBranch = await git(['rev-parse', '--abbrev-ref', 'HEAD'], dirPath).catch(() => 'HEAD')

    let isWorktree = false
    try {
      const gitDir = await git(['rev-parse', '--git-dir'], dirPath)
      isWorktree = gitDir.includes('worktrees')
    } catch { /* ignore */ }

    return { isGit: true, repoRoot, currentBranch, isWorktree }
  } catch {
    return { isGit: false }
  }
}

export class WorktreeManager {
  private repoRoot: string

  constructor(repoRoot: string) {
    this.repoRoot = resolve(repoRoot)
  }

  private get worktreesDir(): string {
    return join(this.repoRoot, WORKTREES_DIR)
  }

  async create(options: {
    sessionId: string
    baseBranch?: string
  }): Promise<CreateResult> {
    const { sessionId } = options

    let baseBranch = options.baseBranch
    if (!baseBranch) {
      baseBranch = await git(['rev-parse', '--abbrev-ref', 'HEAD'], this.repoRoot).catch(() => 'main')
    }

    const shortId = sessionId.slice(0, 8)
    const branchName = `wt/${shortId}`
    const worktreePath = join(this.worktreesDir, shortId)

    if (!existsSync(this.worktreesDir)) {
      mkdirSync(this.worktreesDir, { recursive: true })
    }

    let finalBranch = branchName
    try {
      await git(['rev-parse', '--verify', branchName], this.repoRoot)
      const ts = Date.now().toString(36)
      finalBranch = `wt/${shortId}-${ts}`
    } catch {
    }

    let finalPath = worktreePath
    if (existsSync(worktreePath)) {
      const ts = Date.now().toString(36)
      finalPath = join(this.worktreesDir, `${shortId}-${ts}`)
    }

    // Create worktree
    await git(
      ['worktree', 'add', '-b', finalBranch, finalPath, baseBranch],
      this.repoRoot,
    )

    return { path: finalPath, branch: finalBranch }
  }

  async list(): Promise<WorktreeInfo[]> {
    const output = await git(['worktree', 'list', '--porcelain'], this.repoRoot)
    if (!output) return []

    const worktrees: WorktreeInfo[] = []
    let current: Partial<WorktreeInfo> = {}

    for (const line of output.split('\n')) {
      if (line.startsWith('worktree ')) {
        if (current.path) worktrees.push(current as WorktreeInfo)
        current = {
          path: line.slice('worktree '.length),
          branch: '',
          head: '',
          isMain: false,
          prunable: false,
        }
      } else if (line.startsWith('HEAD ')) {
        current.head = line.slice('HEAD '.length)
      } else if (line.startsWith('branch ')) {
        current.branch = line.slice('branch '.length).replace('refs/heads/', '')
      } else if (line === 'bare') {
        current.isMain = true
      } else if (line === 'prunable') {
        current.prunable = true
      } else if (line === '' && current.path) {
      }
    }

    if (current.path) worktrees.push(current as WorktreeInfo)

    if (worktrees.length > 0) {
      worktrees[0].isMain = true
    }

    return worktrees
  }

  async status(worktreePath: string): Promise<WorktreeStatus> {
    const absPath = resolve(worktreePath)

    const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD'], absPath).catch(() => 'unknown')

    let baseBranch = 'main'
    try {
      await git(['rev-parse', '--verify', 'main'], this.repoRoot)
    } catch {
      try {
        await git(['rev-parse', '--verify', 'master'], this.repoRoot)
        baseBranch = 'master'
      } catch { /* Use main */ }
    }

    let aheadCount = 0
    let behindCount = 0
    try {
      const counts = await git(
        ['rev-list', '--left-right', '--count', `${baseBranch}...${branch}`],
        absPath,
      )
      const [behind, ahead] = counts.split('\t').map(Number)
      aheadCount = ahead || 0
      behindCount = behind || 0
    } catch { /* ignore */ }

    let changedFiles = 0
    let untrackedFiles = 0
    try {
      const statusOutput = await git(['status', '--porcelain'], absPath)
      if (statusOutput) {
        for (const line of statusOutput.split('\n')) {
          if (!line) continue
          if (line.startsWith('??')) {
            untrackedFiles++
          } else {
            changedFiles++
          }
        }
      }
    } catch { /* ignore */ }

    return { branch, baseBranch, aheadCount, behindCount, changedFiles, untrackedFiles }
  }

  async diff(worktreePath: string, baseBranch: string): Promise<DiffEntry[]> {
    const absPath = resolve(worktreePath)

    const [branch, untracked] = await Promise.all([
      git(['rev-parse', '--abbrev-ref', 'HEAD'], absPath),
      git(['ls-files', '--others', '--exclude-standard'], absPath).catch(() => ''),
    ])

    return this.diffWithBranch(absPath, baseBranch, branch, untracked)
  }

  /**
   *  diff —  branch rev-parse
   *  --name-status  --numstat 10 +
   */
  async diffFast(worktreePath: string, baseBranch: string, branch: string): Promise<DiffEntry[]> {
    const absPath = resolve(worktreePath)

    const untracked = await git(
      ['ls-files', '--others', '--exclude-standard'], absPath,
    ).catch(() => '')

    return this.diffWithBranch(absPath, baseBranch, branch, untracked)
  }

  private async diffWithBranch(
    absPath: string, baseBranch: string, branch: string, untracked: string,
  ): Promise<DiffEntry[]> {
    let output: string
    try {
      output = await git(
        ['diff', '--name-status', `${baseBranch}...${branch}`],
        absPath,
      )
    } catch {
      return []
    }

    const entries: DiffEntry[] = []
    const statusMap: Record<string, DiffEntry['status']> = {
      A: 'added', M: 'modified', D: 'deleted', R: 'renamed',
    }

    if (output) {
      for (const line of output.split('\n')) {
        if (!line) continue
        const parts = line.split('\t')
        if (parts.length < 2) continue

        const gitStatus = parts[0][0] // R100 → R
        const status = statusMap[gitStatus] || 'modified'
        const file = status === 'renamed' && parts.length >= 3
          ? `${parts[1]} => ${parts[2]}`
          : parts[parts.length - 1]

        entries.push({ file, status, insertions: 0, deletions: 0 })
      }
    }

    if (untracked) {
      for (const file of untracked.split('\n')) {
        if (!file) continue
        entries.push({ file, status: 'added', insertions: 0, deletions: 0 })
      }
    }

    return entries
  }

  async merge(options: {
    worktreePath: string
    targetBranch: string
  }): Promise<MergeResult> {
    const absPath = resolve(options.worktreePath)
    const { targetBranch } = options

    const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD'], absPath)

    try {
      await git(['merge', '--no-commit', '--no-ff', branch], this.repoRoot)
      await git(['merge', '--abort'], this.repoRoot)
    } catch {
      try { await git(['merge', '--abort'], this.repoRoot) } catch { /* ignore */ }

      const conflicts: string[] = []
      try {
        const unmerged = await git(['diff', '--name-only', '--diff-filter=U'], this.repoRoot)
        if (unmerged) conflicts.push(...unmerged.split('\n').filter(Boolean))
      } catch { /* ignore */ }

      return {
        success: false,
        conflicts: conflicts.length > 0 ? conflicts : ['Merge conflicts exist, please resolve manually in terminal'],
        message: 'MergeExistsConflict',
      }
    }

    try {
      const shortBranch = branch.replace('wt/', '')
      await git(
        ['merge', '--no-ff', branch, '-m', `Merge worktree session ${shortBranch}`],
        this.repoRoot,
      )

      const commitHash = await git(['rev-parse', 'HEAD'], this.repoRoot)

      return { success: true, commitHash, message: 'MergeSuccess' }
    } catch (err) {
      try { await git(['merge', '--abort'], this.repoRoot) } catch { /* ignore */ }
      return {
        success: false,
        message: err instanceof Error ? err.message : 'MergeFailed',
      }
    }
  }

  async remove(worktreePath: string, options?: {
    force?: boolean
    deleteBranch?: boolean
  }): Promise<void> {
    const absPath = resolve(worktreePath)
    const force = options?.force ?? false
    const deleteBranch = options?.deleteBranch ?? true

    let branch: string | null = null
    if (deleteBranch) {
      try {
        branch = await git(['rev-parse', '--abbrev-ref', 'HEAD'], absPath)
      } catch { /* worktree may already be invalid */ }
    }

    // Delete worktree
    const args = ['worktree', 'remove', absPath]
    if (force) args.push('--force')
    await git(args, this.repoRoot)

    if (deleteBranch && branch && branch !== 'HEAD') {
      try {
        await git(['branch', '-D', branch], this.repoRoot)
      } catch { /* branch may not exist */ }
    }
  }

  async commits(worktreePath: string, baseBranch: string): Promise<CommitInfo[]> {
    const absPath = resolve(worktreePath)
    const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD'], absPath)

    let output: string
    try {
      output = await git(
        ['log', `${baseBranch}..${branch}`, '--format=%H%n%h%n%s%n%an%n%at%n---'],
        absPath,
      )
    } catch {
      return []
    }

    if (!output.trim()) return []

    const commits: CommitInfo[] = []
    const blocks = output.split('---\n').filter(Boolean)
    for (const block of blocks) {
      const lines = block.trim().split('\n')
      if (lines.length < 5) continue
      commits.push({
        hash: lines[0],
        shortHash: lines[1],
        message: lines[2],
        author: lines[3],
        timestamp: parseInt(lines[4], 10) * 1000,
      })
    }
    return commits
  }

  async fileDiff(worktreePath: string, filePath: string, baseBranch: string): Promise<string> {
    const absPath = resolve(worktreePath)
    const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD'], absPath)
    try {
      return await git(['diff', `${baseBranch}...${branch}`, '--', filePath], absPath)
    } catch {
      return ''
    }
  }

  async diffWithStats(worktreePath: string, baseBranch: string): Promise<DiffEntry[]> {
    const absPath = resolve(worktreePath)
    const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD'], absPath).catch(() => 'HEAD')

    const [numstatOutput, untracked] = await Promise.all([
      git(['diff', '--numstat', `${baseBranch}...${branch}`], absPath).catch(() => ''),
      git(['ls-files', '--others', '--exclude-standard'], absPath).catch(() => ''),
    ])

    const nameStatusOutput = await git(
      ['diff', '--name-status', `${baseBranch}...${branch}`], absPath,
    ).catch(() => '')

    const statusMap: Record<string, DiffEntry['status']> = {}
    if (nameStatusOutput) {
      for (const line of nameStatusOutput.split('\n')) {
        if (!line) continue
        const parts = line.split('\t')
        if (parts.length < 2) continue
        const gitStatus = parts[0][0]
        const file = parts[parts.length - 1]
        const map: Record<string, DiffEntry['status']> = { A: 'added', M: 'modified', D: 'deleted', R: 'renamed' }
        statusMap[file] = map[gitStatus] || 'modified'
      }
    }

    const entries: DiffEntry[] = []
    if (numstatOutput) {
      for (const line of numstatOutput.split('\n')) {
        if (!line) continue
        const parts = line.split('\t')
        if (parts.length < 3) continue
        const insertions = parts[0] === '-' ? 0 : parseInt(parts[0], 10)
        const deletions = parts[1] === '-' ? 0 : parseInt(parts[1], 10)
        const file = parts[2]
        entries.push({
          file,
          status: statusMap[file] || 'modified',
          insertions,
          deletions,
        })
      }
    }

    if (untracked) {
      for (const file of untracked.split('\n')) {
        if (!file) continue
        entries.push({ file, status: 'added', insertions: 0, deletions: 0 })
      }
    }

    return entries
  }

  async prune(): Promise<void> {
    await git(['worktree', 'prune'], this.repoRoot)
  }
}
