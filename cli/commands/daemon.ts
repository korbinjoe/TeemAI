/**
 * teemai daemon —
 *
 *   install     macOS launchd Launch AgentRunAtLoad + KeepAlive
 *   uninstall   Launch Agent
 *   start       daemonlaunchctl kickstartspawn
 *   stop        daemon
 *   status      daemon
 *   run         server plist ProgramArguments
 */

import { execFileSync, spawn } from 'child_process'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { Command } from 'commander'
import chalk from 'chalk'
import { TEEMAI_HOME } from '../../shared/teemai-home'

const HOME = homedir()
const TEEMAI_DIR = TEEMAI_HOME
const LOGS_DIR = join(TEEMAI_DIR, 'logs')

const IS_DEV = fileURLToPath(import.meta.url).endsWith('.ts')
const SUFFIX = IS_DEV ? '.dev' : ''
const PORT_FILE = join(TEEMAI_DIR, `daemon${SUFFIX}.port`)
const PID_FILE = join(TEEMAI_DIR, `daemon${SUFFIX}.pid`)
const PLIST_LABEL = 'ai.teemai.daemon'
const PLIST_PATH = join(HOME, 'Library', 'LaunchAgents', `${PLIST_LABEL}.plist`)

const isMacOS = process.platform === 'darwin'

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**  UID gui/{uid} launchd domain */
const getUid = (): number => {
  if (typeof process.getuid === 'function') return process.getuid()
  return 501
}

export const resolveTeemAIBin = (): string => {
  const argv1 = process.argv[1]
  if (argv1 && existsSync(argv1)) return argv1
  const dir = dirname(fileURLToPath(import.meta.url))
  const candidates = [join(dir, 'teemai.js'), join(dir, 'teemai.ts')]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return argv1 ?? 'teemai'
}

/**
 *  tsx loader preflight.cjs + esm/index.mjs
 *  --require + --import  tsx cli wrapper
 */
export const resolveTsxPaths = (): { preflight: string; loader: string } | null => {
  const dir = dirname(fileURLToPath(import.meta.url))
  let cur = dir
  for (let i = 0; i < 6; i++) {
    const tsxDist = join(cur, 'node_modules', 'tsx', 'dist')
    const preflight = join(tsxDist, 'preflight.cjs')
    const loader = join(tsxDist, 'esm', 'index.mjs')
    if (existsSync(preflight) && existsSync(loader)) {
      return { preflight, loader }
    }
    cur = dirname(cur)
  }
  return null
}

/**  ProgramArguments
 *
 * - .ts dev node --require preflight.cjs --import loader.mjs teemai.ts daemon run
 * - .js node teemai.js daemon run
 */
export const buildProgramArguments = (): string[] => {
  const nodePath = process.execPath
  const teemaiBin = resolveTeemAIBin()

  if (teemaiBin.endsWith('.ts')) {
    const tsx = resolveTsxPaths()
    if (tsx) {
      return [nodePath, '--require', tsx.preflight, '--import', `file://${tsx.loader}`, teemaiBin, 'daemon', 'run']
    }
    return [nodePath, '--experimental-strip-types', teemaiBin, 'daemon', 'run']
  }

  return [nodePath, teemaiBin, 'daemon', 'run']
}

export const buildPlist = (): string => {
  const programArguments = buildProgramArguments()
  const stdoutPath = join(LOGS_DIR, 'daemon.log')
  const stderrPath = join(LOGS_DIR, 'daemon.err')

  const argsXml = programArguments
    .map((a) => `    <string>${a}</string>`)
    .join('\n')

  const userPath = process.env.PATH || '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>             <string>${PLIST_LABEL}</string>
  <key>RunAtLoad</key>         <true/>
  <key>KeepAlive</key>         <true/>
  <key>ThrottleInterval</key>  <integer>3</integer>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${escapeXml(userPath)}</string>
  </dict>
  <key>ProgramArguments</key>
  <array>
${argsXml}
  </array>
  <key>StandardOutPath</key>   <string>${stdoutPath}</string>
  <key>StandardErrorPath</key> <string>${stderrPath}</string>
  <key>WorkingDirectory</key>  <string>${HOME}</string>
</dict>
</plist>
`
}

export const waitForHealth = async (maxMs = 5000): Promise<number | null> => {
  const { readPortFile } = await import('../../server/lib/portFile.js') as typeof import('../../server/lib/portFile')
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    const port = readPortFile()
    if (port !== null) {
      try {
        const controller = new AbortController()
        const tid = setTimeout(() => controller.abort(), 2000)
        const res = await fetch(`http://localhost:${port}/api/health`, { signal: controller.signal })
        clearTimeout(tid)
        if (res.ok) return port
      } catch { /* ResumeWaiting */ }
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  return null
}

const execLaunchctl = (args: string[]): { ok: boolean; output: string } => {
  try {
    const out = execFileSync('launchctl', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
    return { ok: true, output: out.trim() }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, output: msg }
  }
}

const cmdInstall = async () => {
  if (!isMacOS) {
    console.log(chalk.yellow('\n  Daemon auto-start is not yet supported on this platform.'))
    console.log(chalk.dim('  To run TeemAI as a background service, use:'))
    console.log(chalk.bold('    nohup teemai daemon run &\n'))
    return
  }

  mkdirSync(LOGS_DIR, { recursive: true })
  mkdirSync(dirname(PLIST_PATH), { recursive: true })

  const plist = buildPlist()
  writeFileSync(PLIST_PATH, plist, { encoding: 'utf8', mode: 0o644 })
  console.log(chalk.cyan(`\n  Installed LaunchAgent: ${PLIST_PATH}`))

  const domain = `gui/${getUid()}`
  execLaunchctl(['bootout', `${domain}/${PLIST_LABEL}`])
  execLaunchctl(['enable', `${domain}/${PLIST_LABEL}`])

  const boot = execLaunchctl(['bootstrap', domain, PLIST_PATH])
  if (!boot.ok && !boot.output.includes('already bootstrapped')) {
    console.error(chalk.red(`  launchctl bootstrap failed: ${boot.output}`))
    process.exit(1)
  }

  // Waiting health check
  console.log(chalk.dim('  Waiting for daemon to start...'))
  const port = await waitForHealth()
  if (port === null) {
    console.error(chalk.red('  Daemon did not start within 5s. Check logs:'))
    console.error(chalk.dim(`    ${join(LOGS_DIR, 'daemon.err')}`))
    process.exit(1)
  }

  console.log(chalk.green('  Daemon is running!'))
  console.log(`  ${chalk.bold('Port:')} ${port}`)
  console.log(`  ${chalk.bold('Logs:')} ${LOGS_DIR}/daemon.log\n`)
}

const cmdUninstall = () => {
  if (!isMacOS) {
    console.log(chalk.yellow('\n  Not supported on this platform.\n'))
    return
  }

  const domain = `gui/${getUid()}`
  execLaunchctl(['bootout', `${domain}/${PLIST_LABEL}`])

  if (existsSync(PLIST_PATH)) {
    unlinkSync(PLIST_PATH)
    console.log(chalk.cyan(`\n  Removed: ${PLIST_PATH}`))
  }

  for (const f of [PORT_FILE, PID_FILE]) {
    try { if (existsSync(f)) unlinkSync(f) } catch { /* Ignore */ }
  }

  console.log(chalk.green('  Daemon uninstalled.\n'))
}

const cmdStart = async () => {
  if (isMacOS && existsSync(PLIST_PATH)) {
    const domain = `gui/${getUid()}`
    execLaunchctl(['bootstrap', domain, PLIST_PATH])
    const res = execLaunchctl(['kickstart', '-k', `${domain}/${PLIST_LABEL}`])
    if (!res.ok) {
      console.error(chalk.red(`  Failed to start daemon: ${res.output}`))
      process.exit(1)
    }
    const port = await waitForHealth()
    if (port) {
      console.log(chalk.green(`\n  Daemon started on port ${port}\n`))
    } else {
      console.error(chalk.red('\n  Daemon did not respond within 5s\n'))
    }
  } else {
    const args = buildProgramArguments()
    const child = spawn(args[0], args.slice(1), {
      detached: true,
      stdio: 'ignore',
    })
    child.unref()
    const port = await waitForHealth()
    if (port) {
      console.log(chalk.green(`\n  Daemon started (background) on port ${port}\n`))
    } else {
      console.error(chalk.red('\n  Daemon did not respond within 5s\n'))
    }
  }
}

const killPid = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
  } catch {
    return false
  }
  process.kill(pid, 'SIGTERM')
  const deadline = Date.now() + 3000
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0)
    } catch {
      return true
    }
    execFileSync('sleep', ['0.2'])
  }
  try {
    process.kill(pid, 'SIGKILL')
  } catch { /* already dead */ }
  return true
}

const cmdStop = () => {
  let stopped = false

  if (isMacOS && existsSync(PLIST_PATH)) {
    const domain = `gui/${getUid()}`
    const res = execLaunchctl(['bootout', `${domain}/${PLIST_LABEL}`])
    if (res.ok) stopped = true
  }

  try {
    const raw = existsSync(PID_FILE) ? readFileSync(PID_FILE, 'utf8').trim() : ''
    const pid = Number(raw)
    if (pid > 0 && killPid(pid)) stopped = true
  } catch { /* PID FileReadFailed，Ignore */ }

  // Clean up port/pid File
  for (const f of [PORT_FILE, PID_FILE]) {
    try { if (existsSync(f)) unlinkSync(f) } catch { /* Ignore */ }
  }

  if (stopped) {
    console.log(chalk.green('\n  Daemon stopped.\n'))
  } else {
    console.log(chalk.yellow('\n  No running daemon found.\n'))
  }
}

const cmdStatus = async () => {
  const { tryConnectDaemon } = await import('../lib/daemonConnect.js') as typeof import('../lib/daemonConnect')
  const daemon = await tryConnectDaemon()

  if (!daemon) {
    console.log(chalk.yellow('\n  Daemon status:  stopped\n'))
    return
  }

  console.log(chalk.green('\n  Daemon status:  running'))
  console.log(`  ${chalk.bold('Port:')}    ${daemon.port}`)
  if (daemon.pid) console.log(`  ${chalk.bold('PID:')}     ${daemon.pid}`)

  if (isMacOS) {
    const domain = `gui/${getUid()}`
    const res = execLaunchctl(['print', `${domain}/${PLIST_LABEL}`])
    let launchdStatus: string
    if (res.ok) {
      const stateMatch = res.output.match(/state\s*=\s*(\S+)/)
      launchdStatus = stateMatch ? stateMatch[1] : 'loaded'
    } else {
      launchdStatus = existsSync(PLIST_PATH) ? 'installed (not bootstrapped)' : 'not installed'
    }
    console.log(`  ${chalk.bold('launchd:')} ${launchdStatus} (${PLIST_LABEL})`)
  }

  console.log(`  ${chalk.bold('Logs:')}    ${LOGS_DIR}/daemon.log\n`)
}

const cmdRun = async () => {
  process.env.TEEMAI_CLI = '1'
  process.env.TEEMAI_DAEMON = '1'
  if (IS_DEV) {
    process.env.TEEMAI_DEV = '1'
  }
  const { startServer } = await import('../../server/index.js')
  const envPort = Number(process.env.PORT)
  await startServer(Number.isFinite(envPort) && envPort > 0 ? envPort : 0)
}

export const daemonCommand = new Command('daemon')
  .description('Manage TeemAI background daemon process')

daemonCommand
  .command('install')
  .description('Register as system service (macOS launchd), auto-start on login')
  .action(cmdInstall)

daemonCommand
  .command('uninstall')
  .description('Unload system service')
  .action(cmdUninstall)

daemonCommand
  .command('start')
  .description('Start daemon')
  .action(cmdStart)

daemonCommand
  .command('stop')
  .description('Stop daemon')
  .action(cmdStop)

daemonCommand
  .command('status')
  .description('View daemon run status')
  .action(cmdStatus)

daemonCommand
  .command('run')
  .description('Run server in foreground (called internally by launchd plist)')
  .action(cmdRun)
