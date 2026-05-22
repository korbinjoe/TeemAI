import { Command } from 'commander'
import chalk from 'chalk'
import { ensureDaemon } from '../lib/daemonConnect.js'

export const serveCommand = new Command('serve')
  .description('Start web server and access OpenTeam via browser')
  .option('--no-open', 'Do not auto-open browser')
  .action(async (options) => {
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

    if (options.open !== false) {
      const { default: open } = await import('open')
      await open(url)
    }
  })
