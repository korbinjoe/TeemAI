
import { Command } from 'commander'
import chalk from 'chalk'
import { join, resolve } from 'path'
import { existsSync } from 'fs'
import { WorkspaceStore } from '../../server/stores/WorkspaceStore.js'
import { detectGitRepo } from '../../server/git/WorktreeManager.js'
import { OPENTEAM_HOME } from '../../shared/openteam-home'

const storeDir = OPENTEAM_HOME

const getStore = () => {
  const store = new WorkspaceStore(join(storeDir, 'workspaces.json'))
  return store
}

const listAction = async (options: { json?: boolean }) => {
  const store = getStore()
  const workspaces = store.listSorted()

  if (options.json) {
    console.log(JSON.stringify(workspaces, null, 2))
    return
  }

  if (workspaces.length === 0) {
    console.log(chalk.dim('No workspaces found.'))
    return
  }

  console.log(chalk.bold(`\nWorkspaces (${workspaces.length}):\n`))

  for (const ws of workspaces) {
    const repos = ws.repositories.map((r) => r.name || r.path).join(', ')
    const agent = ws.agentTeam?.primaryAgentId || '-'
    const lastAccess = new Date(ws.lastAccessedAt).toLocaleString()

    console.log(`  ${chalk.cyan(ws.name)}  ${chalk.dim(ws.id.slice(0, 8))}`)
    console.log(`    Repos: ${repos}`)
    console.log(`    Agent: ${agent}`)
    console.log(`    Last:  ${chalk.dim(lastAccess)}`)
    console.log()
  }
}

const addAction = async (paths: string[], options: { name?: string; json?: boolean }) => {
  const resolvedPaths = paths.map((p) => resolve(p))

  for (const p of resolvedPaths) {
    if (!existsSync(p)) {
      console.log(chalk.red(`✗ Path does not exist: ${p}`))
      process.exit(1)
    }
  }

  const store = getStore()

  const existing = resolvedPaths.length === 1
    ? store.findByRepoPath(resolvedPaths[0])
    : store.findByRepoPaths(resolvedPaths)

  if (existing) {
    console.log(chalk.red(`✗ Workspace already exists: ${existing.name} (${existing.id.slice(0, 8)})`))
    process.exit(1)
  }

  const repositories = await Promise.all(
    resolvedPaths.map(async (p) => {
      const gitInfo = await detectGitRepo(p)
      return {
        path: p,
        gitInfo: gitInfo.isGit
          ? { currentBranch: gitInfo.currentBranch }
          : undefined,
      }
    }),
  )

  const workspace = await store.create({
    name: options.name,
    repositories,
  })

  if (options.json) {
    console.log(JSON.stringify(workspace, null, 2))
    return
  }

  console.log(chalk.green(`✓ Workspace created: ${workspace.name} (${workspace.id.slice(0, 8)})`))
  for (const repo of workspace.repositories) {
    const branch = repo.gitInfo?.currentBranch
    console.log(`  Repo: ${repo.path}${branch ? chalk.dim(` (${branch})`) : ''}`)
  }
}

export const workspacesCommand = new Command('workspaces')
  .description('Workspace management')
  .action(async (_options, cmd) => {
    await listAction(cmd.optsWithGlobals())
  })

workspacesCommand
  .command('list')
  .description('List all workspaces')
  .option('--json', 'Output in JSON format')
  .action(listAction)

workspacesCommand
  .command('add <paths...>')
  .description('Create a new workspace')
  .option('-n, --name <name>', 'WorkspaceName')
  .option('--json', 'Output in JSON format')
  .action(addAction)
