
import { Command } from 'commander'
import chalk from 'chalk'
import { join } from 'path'
import { AgentStore } from '../../server/stores/AgentStore.js'
import { TEEMAI_HOME } from '../../shared/teemai-home'

const storeDir = TEEMAI_HOME

export const agentsCommand = new Command('agents')
  .description('List all available agents')
  .option('--json', 'Output in JSON format')
  .option('--role <role>', 'Filter by role (lead/expert)')
  .action(async (options) => {
    const store = new AgentStore(join(storeDir, 'agents.json'))
    await store.load()

    let agents = store.list()

    if (options.role) {
      agents = agents.filter((a) => a.role === options.role)
    }

    if (options.json) {
      console.log(JSON.stringify(agents, null, 2))
      return
    }

    if (agents.length === 0) {
      console.log(chalk.dim('No agents found.'))
      return
    }

    console.log(chalk.bold(`\nAgents (${agents.length}):\n`))

    const leads = agents.filter((a) => a.role === 'lead')
    const experts = agents.filter((a) => a.role === 'expert')

    if (leads.length > 0) {
      console.log(chalk.yellow('  Lead Agents:'))
      for (const agent of leads) {
        console.log(`    ${chalk.cyan(agent.icon || '●')} ${chalk.bold(agent.name)}  ${chalk.dim(`[${agent.source}]`)}`)
        if (agent.description) {
          console.log(`      ${chalk.dim(agent.description)}`)
        }
        if (agent.model) {
          console.log(`      Model: ${agent.model}`)
        }
      }
      console.log()
    }

    if (experts.length > 0) {
      console.log(chalk.magenta('  Expert Agents:'))
      for (const agent of experts) {
        console.log(`    ${chalk.cyan(agent.icon || '●')} ${chalk.bold(agent.name)}  ${chalk.dim(`[${agent.source}]`)}`)
        if (agent.description) {
          console.log(`      ${chalk.dim(agent.description)}`)
        }
        if (agent.model) {
          console.log(`      Model: ${agent.model}`)
        }
      }
      console.log()
    }
  })
