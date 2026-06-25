import { Router } from 'express'
import { readdirSync, statSync, existsSync, mkdirSync } from 'fs'
import { join, basename, isAbsolute, relative } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
const CHECK_IGNORE_CHUNK_SIZE = 200

/**
 *  git check-ignore  .gitignore
 *  Set null fallback
 */
const getGitIgnoredNames = async (dirPath: string, entryNames: string[]): Promise<Set<string> | null> => {
  if (entryNames.length === 0) return new Set()
  const ignored = new Set<string>()
  try {
    for (let i = 0; i < entryNames.length; i += CHECK_IGNORE_CHUNK_SIZE) {
      const fullPaths = entryNames.slice(i, i + CHECK_IGNORE_CHUNK_SIZE).map(name => join(dirPath, name))
      try {
        const { stdout } = await execFileAsync('git', ['check-ignore', '--', ...fullPaths], {
          cwd: dirPath,
          timeout: 5000,
        })
        for (const line of stdout.trim().split('\n')) {
          if (!line) continue
          ignored.add(basename(line))
        }
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 1) {
          continue
        }
        throw err
      }
    }
    return ignored
  } catch (err: unknown) {
    // Not in git repo or git not installed → fallback
    return null
  }
}

const router = Router()

router.get('/api/home-dir', (_req, res) => {
  res.json({ home: process.env.HOME || '/' })
})

router.get('/api/list-dirs', (req, res) => {
  const parent = (req.query.path as string) || process.env.HOME || '/'
  try {
    const entries = readdirSync(parent, { withFileTypes: true })
    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => ({ name: e.name, path: join(parent, e.name) }))
      .sort((a, b) => a.name.localeCompare(b.name))
    res.json({ parent, dirs })
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Cannot read directory' })
  }
})

router.get('/api/search-dirs', (req, res) => {
  const rawQuery = ((req.query.q as string) || '').trim()
  const queryLower = rawQuery.toLowerCase()
  const root = (req.query.root as string) || process.env.HOME || '/'
  const maxDepth = Math.min(Number(req.query.depth) || 3, 5)
  const limit = 30

  if (!rawQuery) return res.json({ results: [] })

  if (rawQuery.startsWith('/')) {
    const targetPath = rawQuery
    if (existsSync(targetPath)) {
      try {
        const stat = statSync(targetPath)
        if (stat.isDirectory()) {
          const entries = readdirSync(targetPath, { withFileTypes: true })
          const dirs = entries
            .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
            .map((e) => ({ name: e.name, path: join(targetPath, e.name) }))
            .sort((a, b) => a.name.localeCompare(b.name))
            .slice(0, limit)
          return res.json({ results: dirs, navigatedTo: targetPath })
        }
      } catch { /* ignore */ }
    }

    const parentDir = targetPath.replace(/\/[^/]*$/, '') || '/'
    const partialName = basename(targetPath).toLowerCase()
    if (existsSync(parentDir)) {
      try {
        const entries = readdirSync(parentDir, { withFileTypes: true })
        const dirs = entries
          .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name.toLowerCase().includes(partialName))
          .map((e) => ({ name: e.name, path: join(parentDir, e.name) }))
          .sort((a, b) => a.name.localeCompare(b.name))
          .slice(0, limit)
        return res.json({ results: dirs, navigatedTo: parentDir })
      } catch { /* ignore */ }
    }
    return res.json({ results: [] })
  }

  const results: Array<{ name: string; path: string }> = []
  const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }]

  while (queue.length > 0 && results.length < limit) {
    const item = queue.shift()!
    if (item.depth > maxDepth) continue
    try {
      const entries = readdirSync(item.dir, { withFileTypes: true })
      for (const e of entries) {
        if (!e.isDirectory() || e.name.startsWith('.')) continue
        const fullPath = join(item.dir, e.name)
        if (e.name.toLowerCase().includes(queryLower)) {
          results.push({ name: e.name, path: fullPath })
          if (results.length >= limit) break
        }
        if (item.depth < maxDepth) queue.push({ dir: fullPath, depth: item.depth + 1 })
      }
    } catch { /* permission denied, skip */ }
  }

  res.json({ results })
})

router.post('/api/mkdir', (req, res) => {
  const { path: dirPath } = req.body as { path?: string }
  if (!dirPath || typeof dirPath !== 'string') {
    return res.status(400).json({ error: 'path is required' })
  }
  if (!isAbsolute(dirPath)) {
    return res.status(400).json({ error: 'path must be absolute' })
  }
  if (existsSync(dirPath)) {
    return res.status(400).json({ error: 'Directory already exists' })
  }
  try {
    mkdirSync(dirPath, { recursive: true })
    res.json({ path: dirPath })
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create directory' })
  }
})

router.post('/api/open-in-ide', (req, res) => {
  const { path: dirPath, ide } = req.body as { path?: string; ide?: string }
  if (!dirPath || typeof dirPath !== 'string') {
    return res.status(400).json({ error: 'path is required' })
  }
  if (!isAbsolute(dirPath)) {
    return res.status(400).json({ error: 'path must be absolute' })
  }
  if (!existsSync(dirPath)) {
    return res.status(400).json({ error: 'path does not exist' })
  }

  const candidates = ide ? [ide] : ['cursor', 'code']

  const tryOpen = (idx: number) => {
    if (idx >= candidates.length) {
      return res.status(500).json({ error: 'No IDE found. Install VS Code or Cursor and add to PATH.' })
    }
    const cmd = candidates[idx]
    execFile(cmd, [dirPath], { timeout: 5000 }, (err) => {
      if (err) return tryOpen(idx + 1)
      res.json({ success: true, ide: cmd })
    })
  }

  tryOpen(0)
})

// ── WebIDE: File + DirectoryList ──

const IGNORED_NAMES = new Set([
  '.git', 'node_modules', '.next', 'dist', 'build', '.cache',
  '.DS_Store', '.Spotlight-V100', '.Trashes', 'Thumbs.db',
  '.turbo', '.parcel-cache', '__pycache__', '.pytest_cache',
])

const ALWAYS_HIDDEN = new Set(['.git', '.DS_Store', '.Spotlight-V100', '.Trashes', 'Thumbs.db'])
const LIST_FILES_CACHE_TTL_MS = 5_000

type ListFilesEntry =
  | { name: string; path: string; type: 'directory'; ignored?: boolean }
  | { name: string; path: string; type: 'file'; size: number; ignored?: boolean }

interface ListFilesResponse {
  path: string
  entries: ListFilesEntry[]
}

interface ListFilesCacheEntry {
  expiresAt: number
  dirMtimeMs: number
  response: ListFilesResponse
}

const listFilesCache = new Map<string, ListFilesCacheEntry>()

const listFilesCacheKey = (dirPath: string, showIgnored: boolean) => `${dirPath}\0${showIgnored ? '1' : '0'}`

router.get('/api/list-files', async (req, res) => {
  const dirPath = req.query.path as string
  const showIgnored = req.query.showIgnored === 'true'
  if (!dirPath || typeof dirPath !== 'string') {
    return res.status(400).json({ error: 'path query parameter is required' })
  }
  if (!isAbsolute(dirPath)) {
    return res.status(400).json({ error: 'path must be absolute' })
  }
  if (dirPath.includes('..')) {
    return res.status(403).json({ error: 'Path traversal is not allowed' })
  }
  if (!existsSync(dirPath)) {
    return res.status(404).json({ error: 'Directory not found' })
  }

  try {
    const dirMtimeMs = statSync(dirPath).mtimeMs
    const cacheKey = listFilesCacheKey(dirPath, showIgnored)
    const cached = listFilesCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now() && cached.dirMtimeMs === dirMtimeMs) {
      return res.json(cached.response)
    }

    const raw = readdirSync(dirPath, { withFileTypes: true })
    const candidateNames = raw
      .map(e => e.name)
      .filter(name => !ALWAYS_HIDDEN.has(name))

    const gitIgnored = await getGitIgnoredNames(dirPath, candidateNames)
    const ignoredSet = gitIgnored ?? IGNORED_NAMES
    const isIgnored = (name: string) => ignoredSet.has(name)

    const dirs: Array<{ name: string; path: string; type: 'directory'; ignored?: boolean }> = []
    const files: Array<{ name: string; path: string; type: 'file'; size: number; ignored?: boolean }> = []

    for (const entry of raw) {
      if (ALWAYS_HIDDEN.has(entry.name)) continue
      const ignored = isIgnored(entry.name)
      if (!showIgnored && ignored) continue
      const fullPath = join(dirPath, entry.name)
      if (entry.isDirectory()) {
        dirs.push({ name: entry.name, path: fullPath, type: 'directory', ...(ignored && { ignored }) })
      } else if (entry.isFile()) {
        try {
          const st = statSync(fullPath)
          files.push({ name: entry.name, path: fullPath, type: 'file', size: st.size, ...(ignored && { ignored }) })
        } catch {
          files.push({ name: entry.name, path: fullPath, type: 'file', size: 0, ...(ignored && { ignored }) })
        }
      }
    }

    dirs.sort((a, b) => a.name.localeCompare(b.name))
    files.sort((a, b) => a.name.localeCompare(b.name))

    const response: ListFilesResponse = { path: dirPath, entries: [...dirs, ...files] }
    listFilesCache.set(cacheKey, {
      response,
      dirMtimeMs,
      expiresAt: Date.now() + LIST_FILES_CACHE_TTL_MS,
    })
    res.json(response)
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Cannot read directory' })
  }
})

const SEARCH_FILES_MAX_DEPTH = 5
const SEARCH_FILES_DEFAULT_LIMIT = 30
const SEARCH_FILES_MAX_LIMIT = 50
const SEARCH_FILES_MAX_QUERY_LEN = 64

router.get('/api/search-files', (req, res) => {
  const root = req.query.root as string
  const rawQuery = (req.query.q as string | undefined)?.trim() ?? ''
  const limit = Math.min(Number(req.query.limit) || SEARCH_FILES_DEFAULT_LIMIT, SEARCH_FILES_MAX_LIMIT)

  if (!root || typeof root !== 'string') {
    return res.status(400).json({ error: 'root is required' })
  }
  if (!isAbsolute(root)) {
    return res.status(400).json({ error: 'root must be absolute' })
  }
  if (root.includes('..')) {
    return res.status(403).json({ error: 'Path traversal is not allowed' })
  }
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    return res.status(404).json({ error: 'Root directory not found' })
  }

  if (rawQuery.length > SEARCH_FILES_MAX_QUERY_LEN) {
    return res.status(400).json({ error: 'query too long' })
  }

  const queryLower = rawQuery.toLowerCase()
  const emptyQuery = rawQuery.length === 0
  const dirResults: Array<{ name: string; path: string; type: 'directory' }> = []
  const fileResults: Array<{ name: string; path: string; type: 'file' }> = []
  const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }]

  while (queue.length > 0 && dirResults.length + fileResults.length < limit) {
    const item = queue.shift()!
    if (item.depth > SEARCH_FILES_MAX_DEPTH) continue
    let entries
    try {
      entries = readdirSync(item.dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (IGNORED_NAMES.has(entry.name)) continue
      if (entry.name.startsWith('.') && entry.name !== '.env') continue
      const fullPath = join(item.dir, entry.name)
      const rel = relative(root, fullPath)
      const matched = emptyQuery
        ? item.depth === 0
        : entry.name.toLowerCase().includes(queryLower)
      if (entry.isDirectory()) {
        if (matched) dirResults.push({ name: entry.name, path: rel, type: 'directory' })
        if (!emptyQuery && item.depth < SEARCH_FILES_MAX_DEPTH) {
          queue.push({ dir: fullPath, depth: item.depth + 1 })
        }
      } else if (entry.isFile() && matched) {
        fileResults.push({ name: entry.name, path: rel, type: 'file' })
      }
      if (dirResults.length + fileResults.length >= limit) break
    }
  }

  fileResults.sort((a, b) => a.name.localeCompare(b.name))
  dirResults.sort((a, b) => a.name.localeCompare(b.name))
  res.json({ results: [...fileResults, ...dirResults] })
})

// ── WebIDE: FileContentSearch（ripgrep / grep fallback） ──

const SEARCH_CONTENT_MAX_RESULTS = 200
const SEARCH_CONTENT_MAX_QUERY_LEN = 128

const normalizeGlob = (g: string): string => {
  const s = g.trim()
  if (s.startsWith('.') && !s.includes('*') && !s.includes('/')) return `*${s}`
  return s
}

const tryRipgrep = async (
  root: string, query: string, include?: string, exclude?: string, limit = SEARCH_CONTENT_MAX_RESULTS,
): Promise<{ stdout: string }> => {
  const args = [
    '--json', '--max-count', '5',
    '--max-filesize', '1M',
    '-g', '!.git',
    '-g', '!node_modules',
    '-g', '!dist',
    '-g', '!build',
    '-g', '!.cache',
    '--fixed-strings',
  ]
  if (include) {
    for (const g of include.split(',')) args.push('-g', normalizeGlob(g))
  }
  if (exclude) {
    for (const g of exclude.split(',')) args.push('-g', `!${normalizeGlob(g)}`)
  }
  args.push('--', query, root)
  return execFileAsync('rg', args, { maxBuffer: 10 * 1024 * 1024, timeout: 15000 })
}

const tryGrep = async (
  root: string, query: string, include?: string,
): Promise<{ stdout: string }> => {
  const args = [
    '-rn', '--fixed-strings', '-m', '5',
    '--exclude-dir=.git', '--exclude-dir=node_modules',
    '--exclude-dir=dist', '--exclude-dir=build',
  ]
  if (include) {
    for (const g of include.split(',')) args.push(`--include=${normalizeGlob(g)}`)
  }
  args.push('--', query, root)
  return execFileAsync('grep', args, { maxBuffer: 10 * 1024 * 1024, timeout: 15000 })
}

interface ContentMatch {
  file: string
  matches: Array<{ line: number; content: string }>
}

const parseRipgrepJson = (stdout: string, root: string, limit: number): ContentMatch[] => {
  const fileMap = new Map<string, Array<{ line: number; content: string }>>()
  let total = 0
  for (const line of stdout.split('\n')) {
    if (!line || total >= limit) break
    try {
      const obj = JSON.parse(line)
      if (obj.type !== 'match') continue
      const absPath = obj.data?.path?.text
      if (!absPath) continue
      const rel = relative(root, absPath)
      if (!fileMap.has(rel)) fileMap.set(rel, [])
      const lineNum = obj.data.line_number as number
      const text = (obj.data.lines?.text || '').replace(/\n$/, '')
      fileMap.get(rel)!.push({ line: lineNum, content: text })
      total++
    } catch { /* skip malformed lines */ }
  }
  return Array.from(fileMap.entries()).map(([file, matches]) => ({ file, matches }))
}

const parseGrepOutput = (stdout: string, root: string, limit: number): ContentMatch[] => {
  const fileMap = new Map<string, Array<{ line: number; content: string }>>()
  let total = 0
  for (const line of stdout.split('\n')) {
    if (!line || total >= limit) break
    const match = line.match(/^(.+?):(\d+):(.*)$/)
    if (!match) continue
    const [, absPath, lineStr, text] = match
    const rel = relative(root, absPath)
    if (!fileMap.has(rel)) fileMap.set(rel, [])
    fileMap.get(rel)!.push({ line: Number(lineStr), content: text })
    total++
  }
  return Array.from(fileMap.entries()).map(([file, matches]) => ({ file, matches }))
}

router.get('/api/search-content', async (req, res) => {
  const root = req.query.root as string
  const query = ((req.query.q as string) || '').trim()
  const include = req.query.include as string | undefined
  const exclude = req.query.exclude as string | undefined
  const limit = Math.min(Number(req.query.limit) || SEARCH_CONTENT_MAX_RESULTS, SEARCH_CONTENT_MAX_RESULTS)

  if (!root || typeof root !== 'string') {
    return res.status(400).json({ error: 'root is required' })
  }
  if (!isAbsolute(root)) {
    return res.status(400).json({ error: 'root must be absolute' })
  }
  if (root.includes('..')) {
    return res.status(403).json({ error: 'Path traversal is not allowed' })
  }
  if (!query) {
    return res.json({ results: [], truncated: false })
  }
  if (query.length > SEARCH_CONTENT_MAX_QUERY_LEN) {
    return res.status(400).json({ error: 'query too long' })
  }
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    return res.status(404).json({ error: 'Root directory not found' })
  }

  try {
    const { stdout } = await tryRipgrep(root, query, include, exclude, limit)
    const results = parseRipgrepJson(stdout, root, limit)
    res.json({ results, truncated: results.reduce((s, r) => s + r.matches.length, 0) >= limit })
  } catch (rgErr: unknown) {
    const isNotFound = rgErr instanceof Error && 'code' in rgErr && (rgErr as { code: number }).code === 1
    if (isNotFound) {
      return res.json({ results: [], truncated: false })
    }
    try {
      const { stdout } = await tryGrep(root, query, include)
      const results = parseGrepOutput(stdout, root, limit)
      res.json({ results, truncated: results.reduce((s, r) => s + r.matches.length, 0) >= limit })
    } catch (grepErr: unknown) {
      const grepNotFound = grepErr instanceof Error && 'code' in grepErr && (grepErr as { code: number }).code === 1
      if (grepNotFound) {
        return res.json({ results: [], truncated: false })
      }
      res.status(500).json({ error: 'Search failed' })
    }
  }
})

export default router
