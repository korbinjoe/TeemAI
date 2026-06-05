
import { Command } from 'commander'
import chalk from 'chalk'
import { join } from 'path'
import { existsSync } from 'fs'
import { WorkspaceStore } from '../../server/stores/WorkspaceStore.js'
import { AgentStore } from '../../server/stores/AgentStore.js'
import { ChatStore } from '../../server/stores/ChatStore.js'
import { TEEMAI_HOME } from '../../shared/teemai-home'

const storeDir = TEEMAI_HOME

export const configCommand = new Command('config')
  .description('View current configuration info')
  .option('--json', 'Output in JSON format')
  .action(async (options) => {
    const workspaceStore = new WorkspaceStore(join(storeDir, 'workspaces.json'))
    const agentStore = new AgentStore(join(storeDir, 'agents.json'))
    const chatStore = new ChatStore(join(storeDir, 'chats.json'))

    await Promise.all([workspaceStore.load(), agentStore.load(), chatStore.load()])

    const config = {
      storageDir: storeDir,
      storageExists: existsSync(storeDir),
      counts: {
        workspaces: workspaceStore.list().length,
        agents: agentStore.list().length,
        chats: chatStore.list().length,
      },
      agentsByRole: {
        lead: agentStore.getByRole('lead').length,
        expert: agentStore.getByRole('expert').length,
      },
    }

    if (options.json) {
      console.log(JSON.stringify(config, null, 2))
      return
    }

    console.log(chalk.bold('\nTeemAI Configuration:\n'))
    console.log(`  Storage:    ${chalk.cyan(config.storageDir)}`)
    console.log(`  Exists:     ${config.storageExists ? chalk.green('Yes') : chalk.red('No')}`)
    console.log()
    console.log(chalk.bold('  Counts:'))
    console.log(`    Workspaces: ${config.counts.workspaces}`)
    console.log(`    Agents:     ${config.counts.agents} (${config.agentsByRole.lead} lead, ${config.agentsByRole.expert} expert)`)
    console.log(`    Chats:      ${config.counts.chats}`)
    console.log()
  })
