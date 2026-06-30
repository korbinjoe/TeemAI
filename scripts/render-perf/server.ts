import { createWriteStream, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { spawn, type ChildProcess } from 'child_process'
import { createServer as createNetServer } from 'net'
import type { RenderPerfMode } from './types'

export interface ManagedRenderPerfServer {
  uiBase: string
  apiBase: string
  stop: () => Promise<void>
}

interface StartOptions {
  mode: RenderPerfMode
  runDir: string
  homeDir: string
  reuseServer: boolean
}

const DEFAULT_UI = process.env.TEEMAI_UI ?? 'http://127.0.0.1:13000'
const DEFAULT_API = process.env.TEEMAI_API ?? 'http://127.0.0.1:13001'

export const startRenderPerfServer = async (options: StartOptions): Promise<ManagedRenderPerfServer> => {
  if (options.reuseServer) {
    await waitForHealth(DEFAULT_API)
    return { uiBase: DEFAULT_UI, apiBase: DEFAULT_API, stop: async () => {} }
  }

  if (options.mode !== 'dev') {
    throw new Error('preview mode currently requires --reuse-server with TEEMAI_UI/TEEMAI_API pointing at the preview server')
  }

  const logDir = join(options.runDir, 'server-logs')
  mkdirSync(logDir, { recursive: true })
  const apiPort = await getFreePort()
  const uiPort = await getFreePort()
  const apiBase = `http://127.0.0.1:${apiPort}`
  const uiBase = `http://127.0.0.1:${uiPort}`

  const { ELECTRON: _electron, TEEMAI_CLI: _teemaiCli, ...parentEnv } = process.env
  const baseEnv = {
    ...parentEnv,
    TEEMAI_HOME: options.homeDir,
    TEEMAI_NO_PORTFILE: '1',
    VITE_RENDER_PERF: 'true',
    TEEMAI_DEV_SERVER_PORT: String(apiPort),
    NODE_ENV: process.env.NODE_ENV ?? 'development',
  }

  const api = spawn('npx', ['tsx', 'watch', 'server/index.ts'], {
    cwd: process.cwd(),
    detached: true,
    env: { ...baseEnv, PORT: String(apiPort) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  api.stdout?.pipe(createWriteStream(join(logDir, 'api.out.log'), { flags: 'a' }))
  api.stderr?.pipe(createWriteStream(join(logDir, 'api.err.log'), { flags: 'a' }))

  const ui = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', String(uiPort), '--strictPort'], {
    cwd: process.cwd(),
    detached: true,
    env: baseEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  ui.stdout?.pipe(createWriteStream(join(logDir, 'ui.out.log'), { flags: 'a' }))
  ui.stderr?.pipe(createWriteStream(join(logDir, 'ui.err.log'), { flags: 'a' }))

  try {
    await waitForHealth(apiBase)
    await waitForUi(uiBase)
  } catch (error) {
    await stopProcessTree(ui)
    await stopProcessTree(api)
    const hint = existsSync(join(logDir, 'api.err.log')) ? `; see ${logDir}` : ''
    throw new Error(`${error instanceof Error ? error.message : String(error)}${hint}`)
  }

  return {
    uiBase,
    apiBase,
    stop: async () => {
      await stopProcessTree(ui)
      await stopProcessTree(api)
    },
  }
}

const getFreePort = async (): Promise<number> => {
  return new Promise((resolve, reject) => {
    const server = createNetServer()
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        server.close(() => reject(new Error('failed to allocate free port')))
        return
      }
      const port = addr.port
      server.close(() => resolve(port))
    })
    server.on('error', reject)
  })
}

const waitForHealth = async (apiBase: string, attempts = 90): Promise<void> => {
  for (let i = 0; i < attempts; i++) {
    try {
      const health = await fetch(`${apiBase}/api/health`)
      const agents = await fetch(`${apiBase}/api/agents`)
      if (health.ok && agents.ok) return
    } catch {
      // retry
    }
    await sleep(1000)
  }
  throw new Error(`server not ready at ${apiBase}`)
}

const waitForUi = async (uiBase: string, attempts = 90): Promise<void> => {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(uiBase)
      if (res.ok) return
    } catch {
      // retry
    }
    await sleep(1000)
  }
  throw new Error(`ui not ready at ${uiBase}`)
}

const stopProcessTree = async (child: ChildProcess): Promise<void> => {
  if (!child.pid) return
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    try { child.kill('SIGTERM') } catch {}
  }
  await sleep(500)
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
