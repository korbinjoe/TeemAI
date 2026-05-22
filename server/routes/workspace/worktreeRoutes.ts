/**
 * Worktree HTTP API
 *  Git Worktree  CRUD
 */

import { Router } from 'express'
import { homedir } from 'os'
import { resolve } from 'path'
import { readFile, writeFile, unlink } from 'fs/promises'
import simpleGit from 'simple-git'
import { WorktreeManager, detectGitRepo, type DiffEntry } from '../../git/WorktreeManager'
import { computeWorkingChanges } from '../../git/workingChanges'
import { getGitWatchManager } from '../../git/GitWatchManager'
import { createLogger } from '../../lib/logger'
const log = createLogger('WorktreeRoutes')

const router = Router()

function isPathSafe(inputPath: string): boolean {
  const abs = resolve(inputPath)
  const home = homedir()
  return abs.startsWith(home) || abs.startsWith('/tmp')
}

/**
 *  worktree
 * worktree <repoRoot>/.worktrees/<id>
 *  detectGitRepo
 */
async function resolveRepoRoot(worktreePath: string): Promise<string | null> {
  const abs = resolve(worktreePath)
  const worktreesDirIdx = abs.lastIndexOf('/.worktrees/')
  if (worktreesDirIdx !== -1) {
    return abs.slice(0, worktreesDirIdx)
  }
  const gitInfo = await detectGitRepo(worktreePath)
  if (!gitInfo.isGit || !gitInfo.repoRoot) return null
  if (gitInfo.isWorktree) {
    try {
      const { execFileSync } = await import('child_process')
      const commonDir = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: worktreePath }).toString().trim()
      const resolvedCommon = resolve(worktreePath, commonDir)
      if (resolvedCommon.endsWith('/.git')) {
        return resolvedCommon.slice(0, -5)
      }
      return resolve(resolvedCommon, '..')
    } catch { /* ignore */ }
  }
  return gitInfo.repoRoot
}

const repoLocks = new Map<string, Promise<void>>()

async function withRepoLock<T>(repoRoot: string, fn: () => Promise<T>): Promise<T> {
  const key = resolve(repoRoot)

  while (repoLocks.has(key)) {
    await repoLocks.get(key)
  }

  let releaseLock: () => void
  const lockPromise = new Promise<void>((r) => { releaseLock = r })
  repoLocks.set(key, lockPromise)

  try {
    return await fn()
  } finally {
    repoLocks.delete(key)
    releaseLock!()
  }
}

// ================== API Route ==================

/**
 * GET /api/git/detect?path=<dirPath>
 */
router.get('/api/git/detect', async (req, res) => {
  const dirPath = req.query.path as string
  if (!dirPath) return res.status(400).json({ error: 'path is required' })
  if (!isPathSafe(dirPath)) return res.status(403).json({ error: 'path not allowed' })

  try {
    const info = await detectGitRepo(dirPath)
    res.json(info)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Detection failed' })
  }
})

/**
 * GET /api/git/working-changes?path=<repoPath>
 *  worktree  fallback
 *  git status + git diff HEAD
 */
router.get('/api/git/working-changes', async (req, res) => {
  const repoPath = req.query.path as string
  if (!repoPath) return res.status(400).json({ error: 'path is required' })
  if (!isPathSafe(repoPath)) return res.status(403).json({ error: 'path not allowed' })

  try {
    const result = await computeWorkingChanges(repoPath)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to get working changes' })
  }
})

/**
 * POST /api/worktree/create
 *  worktree
 */
router.post('/api/worktree/create', async (req, res) => {
  const { repoRoot, sessionId, baseBranch } = req.body
  if (!repoRoot || !sessionId) {
    return res.status(400).json({ error: 'repoRoot and sessionId are required' })
  }
  if (!isPathSafe(repoRoot)) return res.status(403).json({ error: 'path not allowed' })

  try {
    const result = await withRepoLock(repoRoot, async () => {
      const manager = new WorktreeManager(repoRoot)
      return manager.create({ sessionId, baseBranch })
    })
    res.json(result)
  } catch (err) {
    log.error('Create worktree error', { error: err instanceof Error ? err.message : String(err) })
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create worktree' })
  }
})

/**
 * GET /api/worktree/list?repo=<repoRoot>
 *  worktree
 */
router.get('/api/worktree/list', async (req, res) => {
  const repoRoot = req.query.repo as string
  if (!repoRoot) return res.status(400).json({ error: 'repo is required' })
  if (!isPathSafe(repoRoot)) return res.status(403).json({ error: 'path not allowed' })

  try {
    const manager = new WorktreeManager(repoRoot)
    const worktrees = await manager.list()
    res.json({ worktrees })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to list worktrees' })
  }
})

/**
 * GET /api/worktree/status?path=<worktreePath>
 *  worktree
 */
router.get('/api/worktree/status', async (req, res) => {
  const worktreePath = req.query.path as string
  if (!worktreePath) return res.status(400).json({ error: 'path is required' })
  if (!isPathSafe(worktreePath)) return res.status(403).json({ error: 'path not allowed' })

  try {
    const repoRoot = await resolveRepoRoot(worktreePath)
    if (!repoRoot) {
      return res.status(400).json({ error: 'Cannot resolve repository root' })
    }
    const manager = new WorktreeManager(repoRoot)
    const status = await manager.status(worktreePath)
    res.json(status)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to get status' })
  }
})

/**
 * GET /api/worktree/diff?path=<worktreePath>&base=<baseBranch>
 */
router.get('/api/worktree/diff', async (req, res) => {
  const worktreePath = req.query.path as string
  const baseBranch = (req.query.base as string) || 'main'
  if (!worktreePath) return res.status(400).json({ error: 'path is required' })
  if (!isPathSafe(worktreePath)) return res.status(403).json({ error: 'path not allowed' })

  try {
    const repoRoot = await resolveRepoRoot(worktreePath)
    if (!repoRoot) {
      return res.status(400).json({ error: 'Cannot resolve repository root' })
    }
    const manager = new WorktreeManager(repoRoot)
    const files = await manager.diff(worktreePath, baseBranch)
    res.json({ files })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to get diff' })
  }
})

/**
 * POST /api/worktree/diff-batch
 *  worktree  diff
 *  repoRoot + worktree  branch resolveRepoRoot  rev-parse
 *  --name-status  --numstat
 */
router.post('/api/worktree/diff-batch', async (req, res) => {
  const { repos, withStats } = req.body as {
    repos: Array<{
      repoRoot: string
      base?: string
      worktrees: Array<{ path: string; branch: string }>
    }>
    withStats?: boolean
  }
  if (!Array.isArray(repos) || repos.length === 0) {
    return res.status(400).json({ error: 'repos is required' })
  }

  const results: Array<{ path: string; files: DiffEntry[] }> = []

  const concurrencyLimit = withStats ? 3 : repos.length

  const processRepo = async (repo: typeof repos[number]) => {
    if (!repo.repoRoot || !isPathSafe(repo.repoRoot)) return
    const baseBranch = repo.base || 'main'
    const manager = new WorktreeManager(repo.repoRoot)

    const diffs = await Promise.all(
      repo.worktrees.map(async (wt) => {
        if (!wt.path || !isPathSafe(wt.path)) {
          return { path: wt.path, files: [] as DiffEntry[] }
        }
        try {
          const files = withStats
            ? await manager.diffWithStats(wt.path, baseBranch)
            : await manager.diffFast(wt.path, baseBranch, wt.branch)
          return { path: wt.path, files }
        } catch {
          return { path: wt.path, files: [] as DiffEntry[] }
        }
      }),
    )
    results.push(...diffs)
  }

  for (let i = 0; i < repos.length; i += concurrencyLimit) {
    await Promise.all(repos.slice(i, i + concurrencyLimit).map(processRepo))
  }

  res.json({ results })
})

/**
 * GET /api/worktree/commits?path=<worktreePath>&base=<baseBranch>
 *  worktree  base  commit
 */
router.get('/api/worktree/commits', async (req, res) => {
  const worktreePath = req.query.path as string
  const baseBranch = (req.query.base as string) || 'main'
  if (!worktreePath) return res.status(400).json({ error: 'path is required' })
  if (!isPathSafe(worktreePath)) return res.status(403).json({ error: 'path not allowed' })

  try {
    const repoRoot = await resolveRepoRoot(worktreePath)
    if (!repoRoot) return res.status(400).json({ error: 'Cannot resolve repository root' })
    const manager = new WorktreeManager(repoRoot)
    const commits = await manager.commits(worktreePath, baseBranch)
    res.json({ commits })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to get commits' })
  }
})

/**
 * GET /api/worktree/file-diff?path=<worktreePath>&file=<filePath>&base=<baseBranch>
 *  unified diff
 */
router.get('/api/worktree/file-diff', async (req, res) => {
  const worktreePath = req.query.path as string
  const filePath = req.query.file as string
  const baseBranch = (req.query.base as string) || 'main'
  if (!worktreePath || !filePath) return res.status(400).json({ error: 'path and file are required' })
  if (!isPathSafe(worktreePath)) return res.status(403).json({ error: 'path not allowed' })

  try {
    const repoRoot = await resolveRepoRoot(worktreePath)
    if (!repoRoot) return res.status(400).json({ error: 'Cannot resolve repository root' })
    const manager = new WorktreeManager(repoRoot)
    const diff = await manager.fileDiff(worktreePath, filePath, baseBranch)
    res.json({ diff })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to get file diff' })
  }
})

/**
 * GET /api/worktree/file-content?path=<worktreePath>&file=<filePath>
 *  worktree
 */
router.get('/api/worktree/file-content', async (req, res) => {
  const worktreePath = req.query.path as string
  const filePath = req.query.file as string
  if (!worktreePath || !filePath) return res.status(400).json({ error: 'path and file are required' })
  if (!isPathSafe(worktreePath)) return res.status(403).json({ error: 'path not allowed' })

  const fullPath = resolve(worktreePath, filePath)
  if (!fullPath.startsWith(resolve(worktreePath))) {
    return res.status(403).json({ error: 'path traversal not allowed' })
  }

  try {
    const content = await readFile(fullPath, 'utf-8')
    res.json({ content, filePath })
  } catch {
    res.status(404).json({ error: 'File not found' })
  }
})

/**
 * GET /api/worktree/file-base-content?path=<worktreePath>&file=<filePath>&base=<baseBranch>
 *  base diff  original
 */
router.get('/api/worktree/file-base-content', async (req, res) => {
  const worktreePath = req.query.path as string
  const filePath = req.query.file as string
  const baseBranch = (req.query.base as string) || 'main'
  if (!worktreePath || !filePath) return res.status(400).json({ error: 'path and file are required' })
  if (!isPathSafe(worktreePath)) return res.status(403).json({ error: 'path not allowed' })

  try {
    const { execFile: execFileAsync } = await import('child_process')
    const content = await new Promise<string>((resolveP, rejectP) => {
      execFileAsync('git', ['show', `${baseBranch}:${filePath}`], { cwd: resolve(worktreePath), maxBuffer: 5 * 1024 * 1024 }, (err, stdout) => {
        if (err) rejectP(err)
        else resolveP(stdout)
      })
    })
    res.json({ content, filePath })
  } catch {
    res.json({ content: '', filePath })
  }
})

/**
 * POST /api/worktree/save-file
 *  worktree
 */
router.post('/api/worktree/save-file', async (req, res) => {
  const { worktreePath, filePath, content } = req.body
  if (!worktreePath || !filePath || content === undefined) {
    return res.status(400).json({ error: 'worktreePath, filePath and content are required' })
  }
  if (!isPathSafe(worktreePath)) return res.status(403).json({ error: 'path not allowed' })

  const fullPath = resolve(worktreePath, filePath)
  if (!fullPath.startsWith(resolve(worktreePath))) {
    return res.status(403).json({ error: 'path traversal not allowed' })
  }

  try {
    await writeFile(fullPath, content, 'utf-8')
    getGitWatchManager()?.notifyChange(resolve(worktreePath))
    res.json({ success: true, filePath })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Save failed' })
  }
})

/**
 * POST /api/worktree/merge
 *  worktree
 */
router.post('/api/worktree/merge', async (req, res) => {
  const { worktreePath, targetBranch } = req.body
  if (!worktreePath) return res.status(400).json({ error: 'worktreePath is required' })
  if (!isPathSafe(worktreePath)) return res.status(403).json({ error: 'path not allowed' })

  try {
    const repoRoot = await resolveRepoRoot(worktreePath)
    if (!repoRoot) {
      return res.status(400).json({ error: 'Cannot resolve repository root' })
    }

    const result = await withRepoLock(repoRoot, async () => {
      const manager = new WorktreeManager(repoRoot)
      return manager.merge({
        worktreePath,
        targetBranch: targetBranch || 'main',
      })
    })
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to merge' })
  }
})

/**
 * POST /api/worktree/delete
 *  worktree
 */
router.post('/api/worktree/delete', async (req, res) => {
  const { worktreePath, force } = req.body
  if (!worktreePath) return res.status(400).json({ error: 'worktreePath is required' })
  if (!isPathSafe(worktreePath)) return res.status(403).json({ error: 'path not allowed' })

  try {
    const repoRoot = await resolveRepoRoot(worktreePath)
    if (!repoRoot) {
      return res.status(400).json({ error: 'Cannot resolve repository root' })
    }

    await withRepoLock(repoRoot, async () => {
      const manager = new WorktreeManager(repoRoot)
      await manager.remove(worktreePath, { force: !!force })
    })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to delete worktree' })
  }
})

/**
 * POST /api/worktree/clean
 *  worktree
 */
router.post('/api/worktree/clean', async (req, res) => {
  const { repoRoot } = req.body
  if (!repoRoot) return res.status(400).json({ error: 'repoRoot is required' })
  if (!isPathSafe(repoRoot)) return res.status(403).json({ error: 'path not allowed' })

  try {
    const result = await withRepoLock(repoRoot, async () => {
      const manager = new WorktreeManager(repoRoot)
      const worktrees = await manager.list()
      const toClean = worktrees.filter((wt) => !wt.isMain)

      let cleaned = 0
      for (const wt of toClean) {
        try {
          await manager.remove(wt.path, { force: true })
          cleaned++
        } catch (err) {
          log.warn('Failed to remove worktree', { path: wt.path, error: err instanceof Error ? err.message : String(err) })
        }
      }
      return { cleaned, total: toClean.length }
    })
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to clean worktrees' })
  }
})

// ================== Git Actions API（simple-git） ==================

router.post('/api/git/stage', async (req, res) => {
  const { path: repoPath, files } = req.body as { path: string; files: string[] }
  if (!repoPath) return res.status(400).json({ error: 'path is required' })
  if (!isPathSafe(repoPath)) return res.status(403).json({ error: 'path not allowed' })

  try {
    const git = simpleGit(resolve(repoPath))
    if (!files || files.length === 0) {
      await git.add('-A')
    } else {
      await git.add(files)
    }
    getGitWatchManager()?.notifyChange(repoPath)
    res.json({ success: true, staged: files?.length || -1 })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Stage failed' })
  }
})

/**
 * POST /api/git/unstage
 * git reset HEAD
 */
router.post('/api/git/unstage', async (req, res) => {
  const { path: repoPath, files } = req.body as { path: string; files: string[] }
  if (!repoPath || !files?.length) return res.status(400).json({ error: 'path and files are required' })
  if (!isPathSafe(repoPath)) return res.status(403).json({ error: 'path not allowed' })

  try {
    const git = simpleGit(resolve(repoPath))
    await git.reset(['HEAD', '--', ...files])
    getGitWatchManager()?.notifyChange(repoPath)
    res.json({ success: true, unstaged: files.length })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unstage failed' })
  }
})

router.post('/api/git/discard', async (req, res) => {
  const { path: repoPath, files } = req.body as { path: string; files: string[] }
  if (!repoPath || !files?.length) return res.status(400).json({ error: 'path and files are required' })
  if (!isPathSafe(repoPath)) return res.status(403).json({ error: 'path not allowed' })

  try {
    const cwd = resolve(repoPath)
    const git = simpleGit(cwd)
    const status = await git.status()

    const tracked: string[] = []
    const untracked: string[] = []
    for (const f of files) {
      if (status.not_added.includes(f)) {
        untracked.push(f)
      } else {
        tracked.push(f)
      }
    }

    if (tracked.length > 0) {
      await git.checkout(['--', ...tracked])
    }
    for (const f of untracked) {
      await unlink(resolve(cwd, f)).catch(() => {})
    }

    getGitWatchManager()?.notifyChange(repoPath)
    res.json({ success: true, discarded: files.length })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Discard failed' })
  }
})

router.post('/api/git/commit', async (req, res) => {
  const { path: repoPath, message } = req.body as { path: string; message: string }
  if (!repoPath || !message) return res.status(400).json({ error: 'path and message are required' })
  if (!isPathSafe(repoPath)) return res.status(403).json({ error: 'path not allowed' })

  try {
    const git = simpleGit(resolve(repoPath))
    const status = await git.status()
    if (status.staged.length === 0) {
      return res.status(400).json({ error: 'Nothing staged to commit' })
    }
    const result = await git.commit(message)
    getGitWatchManager()?.notifyChange(repoPath)
    res.json({
      success: true,
      commitHash: result.commit || '',
      message,
    })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Commit failed' })
  }
})

router.post('/api/git/push', async (req, res) => {
  const { path: repoPath } = req.body as { path: string }
  if (!repoPath) return res.status(400).json({ error: 'path is required' })
  if (!isPathSafe(repoPath)) return res.status(403).json({ error: 'path not allowed' })

  try {
    const git = simpleGit(resolve(repoPath))
    const status = await git.status()
    const branch = status.current

    try {
      await git.revparse(['--abbrev-ref', '--symbolic-full-name', '@{u}'])
      await git.push()
    } catch {
      await git.push(['-u', 'origin', branch || 'HEAD'])
    }

    getGitWatchManager()?.notifyChange(repoPath)
    res.json({ success: true, pushed: true })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Push failed' })
  }
})

/**
 * GET /api/git/log
 *  commit  parent  Git Graph
 */
router.get('/api/git/log', async (req, res) => {
  const repoPath = req.query.path as string
  const limit = parseInt(req.query.limit as string, 10) || 20
  if (!repoPath) return res.status(400).json({ error: 'path is required' })
  if (!isPathSafe(repoPath)) return res.status(403).json({ error: 'path not allowed' })

  try {
    const git = simpleGit(resolve(repoPath))
    const logResult = await git.log({
      maxCount: limit,
      '--all': null,
      format: { hash: '%h', message: '%s', author: '%an', date: '%aI', refs: '%D', parents: '%p' },
    } as Parameters<typeof git.log>[0])

    const entries = logResult.all.map((entry) => ({
      hash: (entry as Record<string, string>).hash,
      message: (entry as Record<string, string>).message,
      author: (entry as Record<string, string>).author,
      date: (entry as Record<string, string>).date,
      refs: (entry as Record<string, string>).refs ? (entry as Record<string, string>).refs.split(', ').filter(Boolean) : [],
      parents: (entry as Record<string, string>).parents ? (entry as Record<string, string>).parents.split(' ').filter(Boolean) : [],
    }))

    res.json({ entries })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to get log' })
  }
})

router.post('/api/git/fetch', async (req, res) => {
  const { path: repoPath } = req.body as { path: string }
  if (!repoPath) return res.status(400).json({ error: 'path is required' })
  if (!isPathSafe(repoPath)) return res.status(403).json({ error: 'path not allowed' })

  try {
    const git = simpleGit(resolve(repoPath))
    await git.fetch(['--prune'])
    res.json({ success: true, fetched: true })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Fetch failed' })
  }
})

router.get('/api/git/branches', async (req, res) => {
  const repoPath = req.query.path as string
  if (!repoPath) return res.status(400).json({ error: 'path is required' })
  if (!isPathSafe(repoPath)) return res.status(403).json({ error: 'path not allowed' })

  try {
    const git = simpleGit(resolve(repoPath))
    const branchResult = await git.branch(['-a', '--sort=-committerdate'])
    const current = branchResult.current

    const branches: Array<{ name: string; isCurrent: boolean; isRemote: boolean; lastCommit?: string }> = []

    const localNames = new Set<string>()
    for (const key of Object.keys(branchResult.branches)) {
      if (!key.startsWith('remotes/')) localNames.add(key)
    }

    for (const [key, info] of Object.entries(branchResult.branches)) {
      const isRemote = key.startsWith('remotes/')
      let name = key
      if (isRemote) {
        name = key.replace(/^remotes\/origin\//, '')
        if (name === 'HEAD') continue
      }

      if (isRemote && localNames.has(name)) continue

      branches.push({
        name,
        isCurrent: info.current,
        isRemote,
        lastCommit: info.commit,
      })
    }

    res.json({ current, branches })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to list branches' })
  }
})

router.post('/api/git/checkout', async (req, res) => {
  const { path: repoPath, branch, create } = req.body as { path: string; branch: string; create?: boolean }
  if (!repoPath || !branch) return res.status(400).json({ error: 'path and branch are required' })
  if (!isPathSafe(repoPath)) return res.status(403).json({ error: 'path not allowed' })

  try {
    const git = simpleGit(resolve(repoPath))

    const status = await git.status()
    if (status.files.length > 0) {
      return res.status(400).json({ error: 'There are uncommitted changes, please commit or stash before switching branches' })
    }

    if (create) {
      await git.checkoutBranch(branch, 'HEAD')
    } else {
      // Try checkout LocalBranch
      try {
        await git.checkout(branch)
      } catch {
        await git.checkout(['-b', branch, `origin/${branch}`])
      }
    }

    getGitWatchManager()?.notifyChange(repoPath)
    res.json({ success: true, branch })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Checkout failed' })
  }
})

/**
 * POST /api/git/generate-commit-message
 *  diff  AI  commit message
 */
const COMMIT_MSG_MODEL = 'claude-sonnet-4-6'
const COMMIT_MSG_PROXY = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'

const DEFAULT_COMMIT_PROMPT = `Based on the current Git staged changes, generate a commit message following Conventional Commits format (feat/fix/docs/style/refactor/perf/test/chore). Include functional and structural changes. Output only the message content without explanation. Use sub-list (-) format for multiple changes.`

router.post('/api/git/generate-commit-message', async (req, res) => {
  const { path: repoPath, customPrompt } = req.body as { path: string; customPrompt?: string }
  if (!repoPath) return res.status(400).json({ error: 'path is required' })
  if (!isPathSafe(repoPath)) return res.status(403).json({ error: 'path not allowed' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' })
  }

  try {
    const git = simpleGit(resolve(repoPath))
    const diff = await git.diff(['--cached'])

    if (!diff.trim()) {
      return res.status(400).json({ error: 'No staged changes' })
    }

    const instruction = customPrompt?.trim() || DEFAULT_COMMIT_PROMPT
    const prompt = `${instruction}

\`\`\`diff
${diff.slice(0, 8000)}
\`\`\``

    const apiRes = await fetch(`${COMMIT_MSG_PROXY}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: COMMIT_MSG_MODEL,
        max_tokens: 100,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(15_000),
    })

    if (!apiRes.ok) {
      const errBody = await apiRes.text().catch(() => '')
      log.warn('Commit message generation API error', { status: apiRes.status, body: errBody })
      return res.status(500).json({ error: `AI generation failed (${apiRes.status})` })
    }

    const json = await apiRes.json()
    const message = json?.content?.[0]?.text?.trim()
    if (!message) {
      return res.status(500).json({ error: 'Empty response from AI' })
    }

    res.json({ message })
  } catch (err) {
    log.error('Generate commit message failed', { error: err instanceof Error ? err.message : String(err) })
    res.status(500).json({ error: err instanceof Error ? err.message : 'Generation failed' })
  }
})

export default router
