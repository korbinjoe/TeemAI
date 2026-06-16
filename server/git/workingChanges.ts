/**
 * Working Changes
 *
 *  git status
 * 1. HTTP  /api/git/working-changes
 * 2. GitWatchManager  payload
 *
 *  `git status -b --porcelain=v2`
 *  3  simple-git status + rev-list + diffSummary
 * insertions/deletions  `git diff --cached --numstat`staged
 *  `git diff --numstat`unstaged
 */

import { execFile } from 'child_process'
import { resolve, join } from 'path'
import { readFile, stat } from 'fs/promises'

export interface WorkingChangeEntry {
  file: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  staged: boolean
  insertions: number
  deletions: number
}

export interface WorkingChanges {
  worktreePath: string
  branch: string
  baseBranch: string
  aheadCount: number
  changedFiles: number
  untrackedFiles: number
  insertions: number
  deletions: number
  diffEntries: WorkingChangeEntry[]
}

const gitExec = (args: string[], cwd: string): Promise<string> =>
  new Promise((res, rej) => {
    execFile('git', ['-c', 'core.quotePath=false', ...args], { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) rej(err)
      else res(stdout)
    })
  })

const MAX_UNTRACKED_LINE_COUNT_FILES = 50
const MAX_UNTRACKED_LINE_COUNT_BYTES = 256 * 1024
const UNTRACKED_LINE_COUNT_CONCURRENCY = 8

const mapXY = (xy: string, pos: 0 | 1): WorkingChangeEntry['status'] => {
  const c = xy[pos]
  if (c === 'R') return 'renamed'
  if (c === 'A') return 'added'
  if (c === 'D') return 'deleted'
  return 'modified'
}

export async function computeWorkingChanges(repoPath: string): Promise<WorkingChanges> {
  const cwd = resolve(repoPath)

  const [statusRaw, stagedNumstat, unstagedNumstat] = await Promise.all([
    gitExec(['status', '-b', '--porcelain=v2', '-uall'], cwd),
    gitExec(['diff', '--cached', '--numstat'], cwd).catch(() => ''),
    gitExec(['diff', '--numstat'], cwd).catch(() => ''),
  ])

  // ── Parse status v2 Output ──
  let branch = 'unknown'
  let aheadCount = 0
  let hasUpstream = false
  const diffEntries: WorkingChangeEntry[] = []
  let untrackedFiles = 0

  for (const line of statusRaw.split('\n')) {
    if (!line) continue

    if (line.startsWith('# branch.head ')) {
      branch = line.slice('# branch.head '.length)
    } else if (line.startsWith('# branch.upstream ')) {
      hasUpstream = true
    } else if (line.startsWith('# branch.ab ')) {
      // Format: # branch.ab +N -M
      const match = line.match(/\+(\d+)\s+-(\d+)/)
      if (match) aheadCount = parseInt(match[1], 10)
    } else if (line.startsWith('1 ') || line.startsWith('2 ')) {
      // 1 XY sub mH mI mW hH hI path
      // 2 XY sub mH mI mW hH hI Xscore path\torigPath
      const isRename = line[0] === '2'
      const xy = line.slice(2, 4)

      let filePath: string
      if (isRename) {
        // Format: 2 XY ... Rscore newPath\toldPath
        const parts = line.split('\t')
        const lastSpace = parts[0].lastIndexOf(' ')
        filePath = parts[0].slice(lastSpace + 1)
      } else {
        // Format: 1 XY ... path
        const lastSpace = line.lastIndexOf(' ')
        filePath = line.slice(lastSpace + 1)
      }

      if (xy[0] !== '.') {
        diffEntries.push({
          file: filePath,
          status: mapXY(xy, 0),
          staged: true,
          insertions: 0,
          deletions: 0,
        })
      }
      if (xy[1] !== '.') {
        diffEntries.push({
          file: filePath,
          status: mapXY(xy, 1),
          staged: false,
          insertions: 0,
          deletions: 0,
        })
      }
    } else if (line.startsWith('? ')) {
      // untracked
      untrackedFiles++
      diffEntries.push({
        file: line.slice(2),
        status: 'added',
        staged: false,
        insertions: 0,
        deletions: 0,
      })
    }
  }

  if (aheadCount === 0 && !hasUpstream && branch !== '(detached)') {
    try {
      const count = await gitExec(['rev-list', '--count', 'HEAD', '--not', '--remotes'], cwd)
      aheadCount = parseInt(count.trim(), 10) || 0
    } catch { /* initial commit or no remotes */ }
  }

  const applyNumstat = (raw: string, staged: boolean) => {
    for (const line of raw.split('\n')) {
      if (!line) continue
      const parts = line.split('\t')
      if (parts.length < 3) continue
      const ins = parts[0] === '-' ? 0 : parseInt(parts[0], 10)
      const del = parts[1] === '-' ? 0 : parseInt(parts[1], 10)
      const file = parts[2]
      const entry = diffEntries.find((e) => e.file === file && e.staged === staged)
      if (entry) {
        entry.insertions = ins
        entry.deletions = del
      }
    }
  }
  applyNumstat(stagedNumstat, true)
  applyNumstat(unstagedNumstat, false)

  const untrackedEntries = diffEntries.filter(e => e.insertions === 0 && e.deletions === 0 && e.status === 'added' && !e.staged)
  if (untrackedEntries.length > 0) {
    const entriesToMeasure = untrackedEntries.slice(0, MAX_UNTRACKED_LINE_COUNT_FILES)
    let cursor = 0
    const workers = Array.from({ length: Math.min(UNTRACKED_LINE_COUNT_CONCURRENCY, entriesToMeasure.length) }, async () => {
      for (;;) {
        const entry = entriesToMeasure[cursor++]
        if (!entry) return
        try {
          const absPath = join(cwd, entry.file)
          const fileStat = await stat(absPath)
          if (fileStat.size > MAX_UNTRACKED_LINE_COUNT_BYTES) continue
          const content = await readFile(absPath, 'utf-8')
          entry.insertions = content.split('\n').length
        } catch { /* binary, directory, deleted, or unreadable */ }
      }
    })
    await Promise.all(workers)
  }

  const filtered = diffEntries.filter(
    (e) => !(e.status === 'modified' && e.insertions === 0 && e.deletions === 0),
  )
  const changedFiles = filtered.length

  return {
    worktreePath: cwd,
    branch,
    baseBranch: branch,
    aheadCount,
    changedFiles,
    untrackedFiles,
    insertions: diffEntries.reduce((s, e) => s + e.insertions, 0),
    deletions: diffEntries.reduce((s, e) => s + e.deletions, 0),
    diffEntries: filtered,
  }
}
