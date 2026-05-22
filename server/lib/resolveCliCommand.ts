/**
 * resolveCliCommand - CLI
 *
 *  macOS GUI Dock/Spotlight PATH
 * 1.  process.env.PATHwarmup
 * 2. Login Shell PATH recovery warmup
 *    -  nvm alias default alias
 *    - nvm / fnm / asdf  semver
 *
 * getRuntimeInspect()  warmup  PATH 20  resolve
 */

import { execFile } from 'child_process'
import { existsSync, readdirSync, readFileSync, openSync, readSync, closeSync, realpathSync } from 'fs'
import { dirname, join } from 'path'
import { homedir } from 'os'
import { createLogger } from './logger'

const log = createLogger('resolveCliCommand')

export type ResolveLayer = 1 | 2 | 3

export interface ResolveRecord {
  command: string
  hitLayer: ResolveLayer | null
  path: string | null
  at: number
}

export interface WarmupState {
  status: 'pending' | 'done' | 'failed'
  startedAt: number | null
  completedAt: number | null
  durationMs: number | null
  error: string | null
  shellPathLength: number | null
}

let cachedShellPath: string | null | undefined
let warmupPromise: Promise<void> | null = null
const warmupState: WarmupState = {
  status: 'pending',
  startedAt: null,
  completedAt: null,
  durationMs: null,
  error: null,
  shellPathLength: null,
}
const RECENT_RESOLVE_LIMIT = 20
const recentResolves: ResolveRecord[] = []

const recordResolve = (command: string, hitLayer: ResolveLayer | null, path: string | null): void => {
  recentResolves.push({ command, hitLayer, path, at: Date.now() })
  if (recentResolves.length > RECENT_RESOLVE_LIMIT) {
    recentResolves.shift()
  }
}

const whichAsync = (command: string, pathEnv?: string): Promise<string | null> => {
  return new Promise((resolve) => {
    const env = { ...process.env } as NodeJS.ProcessEnv
    if (pathEnv) env.PATH = pathEnv
    execFile('which', [command], { env }, (err, stdout) => {
      if (err) { resolve(null); return }
      const resolved = stdout.toString().trim()
      resolve(resolved || null)
    })
  })
}

const runLoginShellPath = (): Promise<string | null> => {
  const shell = process.env.SHELL || '/bin/zsh'
  return new Promise((resolve) => {
    execFile(shell, ['-ilc', 'echo $PATH'], {
      timeout: 5000,
      env: { HOME: homedir(), USER: process.env.USER || '' },
    }, (err, stdout) => {
      if (err) {
        log.warn('Failed to recover shell PATH', { error: err.message })
        resolve(null)
        return
      }
      const lines = stdout.trim().split('\n')
      const last = lines[lines.length - 1] || null
      resolve(last)
    })
  })
}

const getLoginShellPathAsync = (): Promise<string | null> => {
  if (cachedShellPath !== undefined) return Promise.resolve(cachedShellPath)
  return runLoginShellPath().then((p) => {
    cachedShellPath = p
    return p
  })
}

/** Semver v24.4.0 > v22.17.0 > v20.19.3 vXX  */
const compareSemverDesc = (a: string, b: string): number => {
  const isSemverA = /^v?\d+(\.\d+)*/.test(a)
  const isSemverB = /^v?\d+(\.\d+)*/.test(b)
  if (isSemverA && !isSemverB) return -1
  if (!isSemverA && isSemverB) return 1
  if (!isSemverA && !isSemverB) return a.localeCompare(b)
  const parseVer = (s: string) => s.replace(/^v/, '').split('.').map((x) => parseInt(x, 10) || 0)
  const av = parseVer(a)
  const bv = parseVer(b)
  for (let i = 0; i < 3; i++) {
    const diff = (bv[i] ?? 0) - (av[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

const globBinDirs = (pattern: string, sortSemverDesc = false): string[] => {
  const starIdx = pattern.indexOf('*')
  if (starIdx === -1) return [pattern]

  const parentDir = pattern.substring(0, pattern.lastIndexOf('/', starIdx))
  const suffix = pattern.substring(pattern.indexOf('/', starIdx + 1))

  try {
    if (!existsSync(parentDir)) return []
    let entries = readdirSync(parentDir)
    if (sortSemverDesc) entries = entries.sort(compareSemverDesc)
    return entries
      .map((entry) => join(parentDir, entry, suffix.replace(/^\//, '')))
      .filter((p) => existsSync(p))
  } catch {
    return []
  }
}

/**  nvm alias default  bin  alias  +  */
const resolveNvmDefaultDir = (): string | null => {
  const nvmDir = join(homedir(), '.nvm')
  const aliasFile = join(nvmDir, 'alias', 'default')
  if (!existsSync(aliasFile)) return null

  try {
    let target = readFileSync(aliasFile, 'utf8').trim()
    for (let depth = 0; depth < 3; depth++) {
      if (/^v?\d/.test(target)) {
        const normalized = target.startsWith('v') ? target : `v${target}`
        const versionsDir = join(nvmDir, 'versions', 'node')
        if (!existsSync(versionsDir)) return null
        if (existsSync(join(versionsDir, normalized))) {
          return join(versionsDir, normalized, 'bin')
        }
        const matched = readdirSync(versionsDir)
          .filter((v) => v === normalized || v.startsWith(`${normalized}.`))
          .sort(compareSemverDesc)[0]
        if (matched) return join(versionsDir, matched, 'bin')
        return null
      }
      const nextAlias = join(nvmDir, 'alias', target)
      if (!existsSync(nextAlias)) return null
      target = readFileSync(nextAlias, 'utf8').trim()
    }
  } catch {
    return null
  }
  return null
}

const scanCommonPaths = (command: string): string | null => {
  const home = homedir()
  const nvmDefault = resolveNvmDefaultDir()
  const candidates: string[] = [
    ...(nvmDefault ? [nvmDefault] : []),
    // volta
    `${home}/.volta/bin`,
    ...globBinDirs(`${home}/Library/Application Support/fnm/node-versions/*/installation/bin`, true),
    ...globBinDirs(`${home}/.asdf/installs/nodejs/*/bin`, true),
    `${home}/.asdf/shims`,
    // Homebrew
    '/opt/homebrew/bin',
    '/usr/local/bin',
    // mise
    `${home}/.local/share/mise/installs/node/latest/bin`,
    // pnpm global
    `${home}/Library/pnpm`,
    // pip / pipx / user-local
    `${home}/.local/bin`,
  ]

  for (const dir of candidates) {
    const fullPath = join(dir, command)
    if (existsSync(fullPath)) {
      log.info('Found command via path scan', { command, path: fullPath, dir })
      return fullPath
    }
  }
  return null
}

/**  login shell PATH  process.env.PATH Electron  */
const prependLoginShellPath = (shellPath: string): void => {
  const current = process.env.PATH || ''
  const shellParts = new Set(shellPath.split(':').filter(Boolean))
  const extraParts = current.split(':').filter((p) => p && !shellParts.has(p))
  process.env.PATH = extraParts.length > 0
    ? `${shellPath}:${extraParts.join(':')}`
    : shellPath
  log.info('Login shell PATH prepended to process.env.PATH', {
    shellParts: shellParts.size,
    extraParts: extraParts.length,
  })
}

const appendToPath = (dir: string): void => {
  const current = process.env.PATH || ''
  if (!current.split(':').includes(dir)) {
    process.env.PATH = `${current}:${dir}`
    log.info('Appended dir to process.env.PATH', { dir })
  }
}

/**
 *  login shell PATH ——  await  Promise
 *
 *  overlapstartServer  listen  await  Promise
 *  PATH  Layer 2
 */
export const warmupShellPath = (): Promise<void> => {
  if (warmupPromise) return warmupPromise

  warmupState.startedAt = Date.now()
  warmupState.status = 'pending'
  log.info('Warming up shell PATH', {
    currentExecPath: process.execPath,
    currentPathLength: (process.env.PATH || '').split(':').length,
  })

  warmupPromise = runLoginShellPath().then((shellPath) => {
    warmupState.completedAt = Date.now()
    warmupState.durationMs = warmupState.completedAt - (warmupState.startedAt ?? warmupState.completedAt)

    cachedShellPath = shellPath
    if (shellPath) {
      warmupState.shellPathLength = shellPath.split(':').length
      prependLoginShellPath(shellPath)
      warmupState.status = 'done'
      log.info('Shell PATH warmed up', { pathLength: warmupState.shellPathLength, durationMs: warmupState.durationMs })
    } else {
      warmupState.status = 'failed'
      warmupState.error = 'shell returned empty PATH'
      appendToPath(dirname(process.execPath))
    }
  }).catch((err) => {
    warmupState.completedAt = Date.now()
    warmupState.durationMs = warmupState.completedAt - (warmupState.startedAt ?? warmupState.completedAt)
    warmupState.status = 'failed'
    warmupState.error = err instanceof Error ? err.message : String(err)
    log.warn('Shell PATH warmup failed', { error: warmupState.error })
    cachedShellPath = null
    appendToPath(dirname(process.execPath))
  })

  return warmupPromise
}

/**
 * 1)  PATH  2) Login Shell PATH  3)
 */
export const resolveCliCommandAsync = async (command: string): Promise<string | null> => {
  if (command.startsWith('/')) {
    const found = existsSync(command) ? command : null
    recordResolve(command, found ? 1 : null, found)
    return found
  }

  // Layer 1: Current process.env.PATH
  const fromPath = await whichAsync(command)
  if (fromPath) {
    recordResolve(command, 1, fromPath)
    return fromPath
  }

  // Layer 2: Login Shell PATH recovery
  const shellPath = await getLoginShellPathAsync()
  if (shellPath) {
    const fromShell = await whichAsync(command, shellPath)
    if (fromShell) {
      prependLoginShellPath(shellPath)
      recordResolve(command, 2, fromShell)
      return fromShell
    }
  }

  const fromScan = scanCommonPaths(command)
  if (fromScan) {
    appendToPath(dirname(fromScan))
    recordResolve(command, 3, fromScan)
    return fromScan
  }

  recordResolve(command, null, null)
  return null
}

const MACHO_32_BE = 0xFEEDFACE
const MACHO_64_BE = 0xFEEDFACF
const MACHO_32_LE = 0xCEFAEDFE
const MACHO_64_LE = 0xCFFAEDFE
const MACHO_UNIVERSAL = 0xCAFEBABE
const ELF_MAGIC = 0x7F454C46

/**
 * npm / symlink → JS  shell wrapper
 * macOS execve()  ENOEXEC
 *  node
 */
export const resolveInterpreter = (commandPath: string): { command: string; prependArgs: string[] } => {
  try {
    const realPath = realpathSync(commandPath)
    const fd = openSync(realPath, 'r')
    const buf = Buffer.alloc(4)
    readSync(fd, buf, 0, 4, 0)
    closeSync(fd)

    const magic = buf.readUInt32BE(0)
    if (
      magic === MACHO_32_BE || magic === MACHO_64_BE ||
      magic === MACHO_32_LE || magic === MACHO_64_LE ||
      magic === MACHO_UNIVERSAL || magic === ELF_MAGIC
    ) {
      return { command: commandPath, prependArgs: [] }
    }

    const symlinkDir = dirname(commandPath)
    const nodeInSymlinkDir = join(symlinkDir, 'node')
    if (existsSync(nodeInSymlinkDir)) {
      log.info('Non-binary CLI, using node from symlink dir', { command: commandPath, realPath, node: nodeInSymlinkDir })
      return { command: nodeInSymlinkDir, prependArgs: [realPath] }
    }

    const realDir = dirname(realPath)
    const nodeInRealDir = join(realDir, 'node')
    if (existsSync(nodeInRealDir)) {
      log.info('Non-binary CLI, using node from real dir', { command: commandPath, realPath, node: nodeInRealDir })
      return { command: nodeInRealDir, prependArgs: [realPath] }
    }

    log.info('Non-binary CLI, using process.execPath', { command: commandPath, realPath, node: process.execPath })
    return { command: process.execPath, prependArgs: [realPath] }
  } catch {
    return { command: commandPath, prependArgs: [] }
  }
}

export interface RuntimeInspect {
  bundledNodeVersion: string
  execPath: string
  platform: string
  warmup: WarmupState
  currentPath: string[]
  cachedShellPath: string | null | undefined
  recentResolves: ResolveRecord[]
}

export const getRuntimeInspect = (): RuntimeInspect => ({
  bundledNodeVersion: process.versions.node,
  execPath: process.execPath,
  platform: process.platform,
  warmup: { ...warmupState },
  currentPath: (process.env.PATH || '').split(':'),
  cachedShellPath,
  recentResolves: [...recentResolves],
})
