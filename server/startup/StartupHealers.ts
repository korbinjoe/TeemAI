import chokidar from 'chokidar'
import { join } from 'path'
import { createLogger } from '../lib/logger'
import type { ChatStore } from '../stores'
import type { AgentRegistry } from '../config/AgentRegistry'
import type { SkillManager } from '../config/SkillManager'
import type { WorkspaceSeeder } from '../services/WorkspaceSeeder'

const log = createLogger('StartupHealers')

interface HealerDeps {
  chatStore: ChatStore
  agentRegistry: AgentRegistry
  skillManager: SkillManager
  bundledAssetsDir: string
  openteamHome: string
  isBundled: boolean
  seederFactory: () => WorkspaceSeeder
}

export const healStaleChatStatuses = (chatStore: ChatStore) => {
  const staleChats = chatStore.listRecent(500).filter((c) => c.status === 'running' || c.status === 'idle')
  if (staleChats.length > 0) {
    log.info('Fixing stale running/idle chats', { count: staleChats.length })
    for (const chat of staleChats) {
      const taskStatusOverride = chat.taskStatus === 'running' ? 'interrupted' as const : undefined
      chatStore.update(chat.id, {
        status: 'stopped',
        ...(taskStatusOverride ? { taskStatus: taskStatusOverride } : {}),
      }).catch((e) => log.warn('Failed to fix stale chat', { chatId: chat.id, error: e instanceof Error ? e.message : String(e) }))
    }
  }
}

export const watchAiAssetsDev = ({ bundledAssetsDir, openteamHome, agentRegistry, skillManager, seederFactory }: Omit<HealerDeps, 'chatStore' | 'isBundled'>) => {
  const seeder = seederFactory()
  let reseedTimer: ReturnType<typeof setTimeout> | null = null
  chokidar.watch([join(bundledAssetsDir, 'agents'), join(bundledAssetsDir, 'skills'), join(bundledAssetsDir, 'hooks')], {
    ignoreInitial: true,
    depth: 3,
    awaitWriteFinish: { stabilityThreshold: 300 },
  }).on('all', () => {
    if (reseedTimer) clearTimeout(reseedTimer)
    reseedTimer = setTimeout(async () => {
      log.info('ai-assets changed, re-seeding to ~/.openteam/')
      await seeder.seed()
      await agentRegistry.reload()
      await skillManager.loadBuiltinSkills()
      await skillManager.syncBuiltinToClaudeHome()
    }, 500)
  })
}
