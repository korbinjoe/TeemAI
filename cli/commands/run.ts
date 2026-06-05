/**
 * run  —  sandbox
 *
 *  agent + prompt  CI/CD
 *  TEEMAI_TOKEN
 */

import { Command } from 'commander'
import WebSocket from 'ws'
import chalk from 'chalk'
import { existsSync } from 'fs'
import { dirname } from 'path'

type WorkspaceResolution =
  | { type: 'resolved'; workspace: any; chatId: string }
  | { type: 'failed' }

const isSameProject = (repoPath: string, targetDir: string): boolean => {
  if (repoPath === '/') return true
  let dir = targetDir
  while (dir !== repoPath && dir.startsWith(repoPath + '/')) {
    if (existsSync(`${dir}/.git`)) return false
    dir = dirname(dir)
  }
  return true
}

const resolveWorkspace = async (port: number, cwd: string): Promise<WorkspaceResolution> => {
  const res = await fetch(`http://127.0.0.1:${port}/api/workspaces`)
  const workspaces = (await res.json()) as any[]

  const matches = workspaces.filter((ws: any) =>
    ws.repositories.some((r: any) =>
      cwd === r.path || (cwd.startsWith(r.path + '/') && isSameProject(r.path, cwd))
    )
  )

  if (matches.length === 0) {
    const qsRes = await fetch(`http://127.0.0.1:${port}/api/workspaces/quick-start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoPath: cwd }),
    })
    const { workspace, chat } = await qsRes.json() as any
    return { type: 'resolved', workspace, chatId: chat.id }
  }

  const exactMatches = matches.filter((ws: any) =>
    ws.repositories.some((r: any) => r.path === cwd)
  )
  const best = exactMatches.length > 0
    ? (exactMatches.find((ws: any) => ws.repositories[0]?.path === cwd) || exactMatches[0])
    : [...matches].sort((a: any, b: any) => {
        const aMax = Math.max(...a.repositories.map((r: any) => r.path.length))
        const bMax = Math.max(...b.repositories.map((r: any) => r.path.length))
        return bMax - aMax
      })[0]

  const chatRes = await fetch(`http://127.0.0.1:${port}/api/workspaces/${best.id}/chats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'CLI Run' }),
  })
  const chat = await chatRes.json() as any
  return { type: 'resolved', workspace: best, chatId: chat.id }
}

const ensureAuth = async (port: number): Promise<void> => {
  const statusRes = await fetch(`http://127.0.0.1:${port}/api/auth/teemai/status`)
  const status = await statusRes.json() as { authenticated: boolean }
  if (status.authenticated) return

  const token = process.env.TEEMAI_TOKEN
  if (!token) {
    process.stderr.write(chalk.red('Error: Not authenticated. Set TEEMAI_TOKEN environment variable.\n'))
    process.exit(1)
  }

  const injectRes = await fetch(`http://127.0.0.1:${port}/api/auth/teemai/env-inject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      userId: process.env.TEEMAI_USER_ID,
      userName: process.env.TEEMAI_USER_NAME,
      serverUrl: process.env.TEEMAI_SERVER_URL,
    }),
  })

  if (!injectRes.ok) {
    process.stderr.write(chalk.red('Error: Failed to inject token.\n'))
    process.exit(1)
  }
}

const getPrompt = async (positionalArg?: string): Promise<string> => {
  if (positionalArg) return positionalArg

  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = []
    for await (const chunk of process.stdin) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
    }
    const input = Buffer.concat(chunks).toString('utf8').trim()
    if (input) return input
  }

  process.stderr.write(chalk.red('Error: No prompt provided.\n'))
  process.stderr.write(chalk.dim('Usage: teemai run -a <agent> "your prompt"\n'))
  process.stderr.write(chalk.dim('   or: echo "prompt" | teemai run -a <agent>\n'))
  process.exit(1)
}

export const runCommand = new Command('run')
  .description('Non-interactive Agent Task execution（sandbox mode）')
  .argument('[prompt]', 'Prompt to send to the agent')
  .requiredOption('-a, --agent <name>', 'Specify agent name')
  .option('-m, --model <model>', 'Specify model (overrides agent default)')
  .option('--cwd <path>', 'Working directory', process.cwd())
  .action(async (promptArg: string | undefined, options: { agent: string; model?: string; cwd: string }) => {
    const { agent: agentId, model, cwd } = options

    const prompt = await getPrompt(promptArg)

    // 1. Start daemon
    const { ensureDaemon } = await import('../lib/daemonConnect.js') as typeof import('../lib/daemonConnect')

    let port: number
    try {
      const daemon = await ensureDaemon()
      port = daemon.port
    } catch (err) {
      process.stderr.write(chalk.red(`Failed to start daemon: ${err instanceof Error ? err.message : err}\n`))
      process.exit(1)
    }

    await ensureAuth(port)

    // 3. Parse workspace
    const resolution = await resolveWorkspace(port, cwd)
    if (resolution.type !== 'resolved') {
      process.stderr.write(chalk.red('Failed to resolve workspace\n'))
      process.exit(1)
    }

    const { workspace, chatId } = resolution
    const repoPaths = workspace.repositories?.map((r: any) => r.path) ?? [cwd]

    if (model) {
      await fetch(`http://127.0.0.1:${port}/api/chats/${chatId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      }).catch(() => {})
    }

    process.stderr.write(chalk.dim(`[teemai] agent=${agentId} workspace=${workspace.name} chat=${chatId}\n`))

    // 5. WS Connect + Start agent
    const ws = new WebSocket(`ws://localhost:${port}/ws`)
    let started = false
    let partialOutputted = false

    const cleanup = () => {
      ws.close()
    }

    process.on('SIGTERM', () => {
      ws.send(JSON.stringify({ type: 'expert:stop', payload: { agentId, chatId } }))
      cleanup()
      process.exit(0)
    })
    process.on('SIGINT', () => {
      ws.send(JSON.stringify({ type: 'expert:stop', payload: { agentId, chatId } }))
      cleanup()
      process.exit(0)
    })

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'chat:set-context', payload: { chatId } }))
      ws.send(JSON.stringify({
        type: 'expert:direct-input',
        payload: {
          chatId,
          agentId,
          message: prompt,
          autoStart: true,
          cwd,
          repositories: repoPaths.map((p: string) => ({ path: p })),
        },
      }))
    })

    ws.on('message', (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(data.toString()) as { type: string; payload: any }

        switch (msg.type) {
          case 'expert:started':
            if (msg.payload.agentId !== agentId) break
            started = true
            process.stderr.write(chalk.dim(`[teemai] Agent started (session=${msg.payload.sessionId})\n`))
            break

          case 'expert:partial-text':
            if (msg.payload.agentId !== agentId) break
            if (msg.payload.text) {
              partialOutputted = true
              process.stdout.write(msg.payload.text)
            }
            break

          case 'expert:structured-message':
            if (msg.payload.agentId !== agentId) break
            if (!partialOutputted && msg.payload.messages) {
              for (const m of msg.payload.messages) {
                if (m.role === 'assistant' && m.type === 'text' && m.content) {
                  process.stdout.write(m.content)
                }
              }
            }
            break

          case 'expert:activity':
            if (msg.payload.agentId !== agentId) break
            if (msg.payload.activity?.state) {
              process.stderr.write(chalk.dim(`[teemai] ${msg.payload.activity.state}\n`))
            }
            break

          case 'expert:exit': {
            if (msg.payload.agentId !== agentId) break
            const exitCode = msg.payload.exitCode ?? 0
            process.stderr.write(chalk.dim(`[teemai] Agent exited (code=${exitCode})\n`))
            process.stdout.write('\n')
            cleanup()
            process.exit(exitCode)
            break
          }

          case 'expert:error':
            if (msg.payload.agentId !== agentId) break
            process.stderr.write(chalk.red(`Error: ${msg.payload.message}\n`))
            cleanup()
            process.exit(1)
            break
        }
      } catch {
        // ignore parse errors
      }
    })

    ws.on('close', () => {
      if (!started) {
        process.stderr.write(chalk.red('WebSocket closed before agent started\n'))
        process.exit(1)
      }
      process.exit(0)
    })

    ws.on('error', (err) => {
      process.stderr.write(chalk.red(`WebSocket error: ${err.message}\n`))
      process.exit(1)
    })
  })
