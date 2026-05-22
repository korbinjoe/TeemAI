#!/usr/bin/env node

import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { Command } from 'commander'
import { serveCommand } from '../commands/serve.js'
import { workspacesCommand } from '../commands/workspaces.js'
import { agentsCommand } from '../commands/agents.js'
import { configCommand } from '../commands/config.js'
import { updateCommand } from '../commands/update.js'
import { daemonCommand } from '../commands/daemon.js'
import { runCommand } from '../commands/run.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const { version } = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8'))

const program = new Command()
  .name('openteam')
  .description('OpenTeam - AI Agent Team Management')
  .version(version)

program.addCommand(serveCommand)
program.addCommand(workspacesCommand)
program.addCommand(agentsCommand)
program.addCommand(configCommand)
program.addCommand(updateCommand)
program.addCommand(daemonCommand)
program.addCommand(runCommand)

program
  .command('chat', { hidden: true })
  .option('-a, --agent <name>', 'Specify agent name (skip interactive select)')
  .option('-r, --resume', 'Restore last workspace and agent (skip select steps)')
  .action(async (options) => {
    const { chatCommand } = await import('../commands/chat.js')
    await chatCommand({ agent: options.agent, resume: options.resume })
  })

program
  .action(async () => {
    const chalk = (await import('chalk')).default
    const { ensureDaemon } = await import('../lib/daemonConnect.js') as typeof import('../lib/daemonConnect')

    let actualPort: number
    try {
      const daemon = await ensureDaemon()
      actualPort = daemon.port
    } catch (err) {
      console.error(chalk.red(`  Failed to start daemon: ${err instanceof Error ? err.message : err}`))
      process.exit(1)
    }

    const url = `http://localhost:${actualPort}`
    console.log(chalk.green('\n  OpenTeam is running at:'))
    console.log(chalk.bold(`  → ${url}\n`))

    const { default: open } = await import('open')
    await open(url)
  })

program.parse()
